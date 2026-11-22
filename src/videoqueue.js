'use strict';

// Hàng đợi video quà tặng.
// - Mỗi lúc chỉ phát một video. Xong (hoặc lỗi, hoặc bị bỏ qua) mới phát video kế tiếp.
// - Quà vào hàng đợi theo thứ tự; khi đầy thì bỏ video cũ nhất đang chờ (giống hàng đợi comment).
// - Có "chốt thời gian": nếu sân khấu im lặng quá lâu thì tự bỏ video đó để hàng đợi không bị kẹt.
// Không phụ thuộc Electron: `send(channel, payload)` trả về false nếu không gửi được (khi đó bỏ qua video).

const HISTORY_MAX = 30;
const DEFAULT_WATCHDOG_MS = 45000;   // chưa biết độ dài video thì chờ tối đa 45 giây
const META_SLACK_MS = 10000;         // đã biết độ dài thì chờ thêm 10 giây so với độ dài

function createVideoQueue(opts) {
  const {
    send,                              // (channel, payload) => boolean
    getLimit = () => 10,               // số video chờ tối đa
    getVolume = () => 80,              // âm lượng 0-100
    onChange = () => {},               // (snapshot) => cập nhật giao diện
    interlude = null,                  // async (hasNext) => nghỉ giữa hai video (nói câu, chờ đủ giờ); null = không nghỉ
    beforeStart = null,                // async (item) => chờ trước khi phát (ví dụ câu đang nói phải nói hết); null = phát ngay
    onBusy = () => {},                 // (true|false) => bận khi đang có video/chờ phát; rảnh khi hết hàng đợi video
    now = () => Date.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout
  } = opts;

  let seq = 0;
  let waiting = [];                    // { id, rule, gift, name, diamonds }
  let current = null;                  // { ...item, since }
  let timer = null;
  let history = [];                    // nhật ký: { at, gift, name, status }
  let resting = false;                 // đang nghỉ giữa hai video: chưa phát video kế
  let held = false;                    // đang tạm giữ (sân khấu đang tải lại): không phát video nào
  let starting = false;                // đang chờ beforeStart trước khi phát video kế
  let busy = false;                    // trạng thái đã báo cho onBusy

  function snapshot() {
    return {
      playing: current ? { id: current.id, gift: current.gift, name: current.name, diamonds: current.diamonds, since: current.since } : null,
      queue: waiting.map(w => ({ id: w.id, gift: w.gift, name: w.name, diamonds: w.diamonds })),
      history: history.slice(0, 15).map(h => ({ ...h })),
      resting,
      held
    };
  }
  function reportBusy() {
    const now_ = starting || !!current || resting || waiting.length > 0;
    if (now_ !== busy) { busy = now_; onBusy(busy); }
  }
  const emit = () => { reportBusy(); onChange(snapshot()); };

  function record(item, status) {
    history.unshift({ at: now(), gift: item.gift, name: item.name, status });
    if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);
  }

  function armWatchdog(ms = DEFAULT_WATCHDOG_MS) {
    clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      if (!current) return;
      send('stage:videoStop', {});
      finish('timeout');
    }, ms);
  }

  // Kết thúc video đang phát với một trạng thái, rồi chuyển sang video kế tiếp
  function finish(status) {
    if (!current) return;
    const done = current;
    current = null;
    clearTimer(timer);
    timer = null;
    record(done, status);
    // video phát xong tự nhiên: nghỉ (nếu có) rồi mới tới video kế
    if (status === 'played' && interlude) {
      resting = true;
      emit();
      Promise.resolve()
        .then(() => interlude(waiting.length > 0))
        .catch(() => {})
        .then(() => { resting = false; next(); });
      return;
    }
    next();
  }

  // Gửi lệnh phát một video. false nếu sân khấu chưa sẵn sàng.
  function startItem(item) {
    const ok = send('stage:videoPlay', {
      id: item.id,
      src: '/video/' + item.rule,
      gift: item.gift,
      name: item.name,
      diamonds: item.diamonds,
      volume: getVolume()
    });
    if (!ok) { record(item, 'error'); return false; }   // sân khấu chưa sẵn sàng: bỏ qua video này
    current = { ...item, since: now() };
    armWatchdog();
    return true;
  }

  // Có beforeStart: chờ xong mới phát video đầu hàng. Trong lúc chờ không nhận video khác.
  function startGated() {
    starting = true;
    const item = waiting.shift();
    Promise.resolve()
      .then(() => beforeStart(item))
      .catch(() => {})
      .then(() => {
        starting = false;
        if (held || current) { waiting.unshift(item); emit(); return; }   // đã bị giữ hoặc có video khác: trả lại đầu hàng
        if (!startItem(item)) next();
        else emit();
      });
  }

  function next() {
    while (!held && !resting && !current && !starting && waiting.length) {
      if (beforeStart) { startGated(); break; }
      startItem(waiting.shift());
    }
    emit();
  }

  // Thêm quà vào hàng đợi. rule: dòng trong bảng quà; gift: tên quà; name: người tặng.
  function enqueue({ rule, gift, name, diamonds }) {
    const item = { id: 'q' + (++seq), rule, gift: String(gift || '(không tên)'), name: String(name || 'Khán giả'), diamonds: Number(diamonds) || 0 };
    const limit = Math.max(1, Number(getLimit()) || 1);
    while (waiting.length >= limit) {
      const dropped = waiting.shift();
      record(dropped, 'dropped');
    }
    waiting.push(item);
    next();
    return item.id;
  }

  // Sân khấu báo đã phát xong (hoặc lỗi)
  function done(id, ok = true) {
    if (current && current.id === id) finish(ok ? 'played' : 'error');
  }

  // Sân khấu báo độ dài video: chốt thời gian theo độ dài thật
  function meta(id, durationSec) {
    if (!current || current.id !== id) return;
    const d = Number(durationSec);
    if (!Number.isFinite(d) || d <= 0) return;
    armWatchdog(Math.round(d * 1000) + META_SLACK_MS);
  }

  // Bỏ qua video đang phát
  function skip() {
    if (!current) return false;
    send('stage:videoStop', {});
    finish('skipped');
    return true;
  }

  // Xoá các video đang chờ (không đụng video đang phát)
  function clear() {
    for (const w of waiting) record(w, 'cleared');
    waiting = [];
    emit();
  }

  // Sân khấu tải lại (đổi nhân vật): video đang phát không còn, bỏ qua và phát tiếp
  function reset() {
    if (current) finish('skipped');
    else emit();
  }

  // Số video đang chờ (để nghỉ xong biết còn video không)
  const pendingCount = () => waiting.length;

  // Tạm giữ hàng đợi khi sân khấu tải lại (đổi dạng, đổi nhân vật); nhả ra thì phát tiếp
  function setHold(on) {
    held = !!on;
    if (!held) next();
    else emit();
  }

  function stop() {
    clearTimer(timer);
    timer = null;
  }

  return { enqueue, done, meta, skip, clear, reset, stop, snapshot, pendingCount, setHold, isBusy: () => busy };
}

module.exports = { createVideoQueue };
