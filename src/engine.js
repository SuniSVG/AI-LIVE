'use strict';

// Bộ máy xử lý comment.
// - Gọi AI song song (tối đa `parallel` câu cùng lúc).
// - Đọc lần lượt: một câu trả lời được đọc xong mới tới câu tiếp theo.
// - Bảng comment ghi mọi comment; hàng đợi chỉ giữ comment đủ điều kiện.
// Không phụ thuộc Electron nên có thể kiểm thử bằng node --test.

const MAX_FEED = 80;
const MAX_BOARD = 150;

const { isGreeting } = require('./quick');

function parseKeywords(str) {
  return String(str || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function createEngine(opts) {
  const {
    getSettings,               // () => settings hiện tại
    ask,                       // async (item, settings) => { text, action }
    say,                       // async (payload) => hiển thị và đọc trên sân khấu, resolve khi đọc xong
    onChange = () => {},       // (snapshot) => cập nhật giao diện
    onBoard = () => {},        // (entry) => một comment mới vào bảng comment
    now = () => Date.now(),
    rand = Math.random         // có thể thay để kiểm thử
  } = opts;

  let queue = [];              // comment đủ điều kiện, chờ được gọi AI
  let feed = [];               // nhật ký quyết định
  let board = [];              // bảng comment: mọi comment nhận được
  const boardById = new Map();
  const lastReplyAt = new Map();
  let lastSpokeAt = null;      // thời điểm kết thúc đọc câu gần nhất
  let paused = false;          // người dùng bấm tạm dừng
  let videoHeld = false;       // đang có video quà: không bắt đầu câu trả lời mới
  let timer = null;
  let seq = 0;
  let lastReply = null;
  let priorityId = null;       // comment chọn tay ("trả lời ngay")
  const asking = new Map();    // id -> { id, name, kind, since }: đang gọi AI
  let ready = [];              // câu trả lời đã có, chờ đọc: { item, reply, urgent }
  let speaking = null;         // đang đọc: { id, name, kind, since, text }
  const stats = { replied: 0, skipped: 0, errors: 0 };

  function setState(id, state) {
    const b = boardById.get(id);
    if (b) b.state = state;
  }

  function addBoard(item) {
    const entry = { id: item.id, kind: item.kind, name: item.name, text: item.text, diamonds: item.diamonds, state: 'new', t: now() };
    board.push(entry);
    boardById.set(entry.id, entry);
    if (board.length > MAX_BOARD) boardById.delete(board.shift().id);
    onBoard({ ...entry });
  }

  function record(status, item, detail = '', reply = '') {
    feed.unshift({ id: ++seq, t: now(), status, kind: item.kind, name: item.name, text: item.text, diamonds: item.diamonds, detail, reply });
    if (feed.length > MAX_FEED) feed = feed.slice(0, MAX_FEED);
    if (status === 'skipped') stats.skipped++;
    else if (status === 'replied') stats.replied++;
    else if (status === 'error') stats.errors++;
    setState(item.id, status);
  }

  function snapshot() {
    const pending = priorityId !== null ? queue.find(q => q.id === priorityId) : null;
    return {
      paused,
      videoHeld,
      busy: asking.size > 0 || !!speaking,
      queueLength: queue.length,
      queue: queue.map(q => ({ id: q.id, kind: q.kind, name: q.name, text: q.text, diamonds: q.diamonds })),
      board: board.slice(-100).reverse().map(b => ({ ...b })),
      feed: feed.slice(0, 60),
      lastReply,
      asking: [...asking.values()].map(a => ({ ...a })),
      speaking: speaking ? { ...speaking } : null,
      readyCount: ready.length,
      pendingPick: pending ? { name: pending.name } : null,
      stats: { ...stats }
    };
  }
  function emit() { onChange(snapshot()); }

  // Trả về lý do bỏ qua, hoặc null nếu comment được nhận.
  function judge(item, s) {
    if (!s.aiEnabled) return 'AI đang tắt';
    if (item.kind === 'self') return null;
    if (item.force) return null;
    if (item.kind === 'gift') {
      if (!s.replyToGifts) return 'Đã tắt cảm ơn quà';
      if (item.diamonds < s.giftMinDiamonds) return `Quà dưới ${s.giftMinDiamonds} kim cương`;
      return null;
    }
    if (s.triggerMode === 'keyword') {
      const low = item.text.toLowerCase();
      const hasKeyword = parseKeywords(s.keywords).some(k => low.includes(k));
      // lời chào cũng được đáp dù không có từ khoá (khi bật trả lời nhanh)
      if (!hasKeyword && !(s.quickReplies && isGreeting(item.text))) return 'Không chứa từ khoá';
    }
    return null;
  }

  function enqueue(raw = {}) {
    const s = getSettings();
    const kind = raw.kind === 'gift' ? 'gift' : raw.kind === 'self' ? 'self' : 'chat';
    const item = {
      id: ++seq,
      kind,
      uid: String(raw.uid || raw.name || '?'),
      name: String(raw.name || 'Khán giả').slice(0, 40),
      text: String(raw.text || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      diamonds: Number(raw.diamonds) || 0,
      force: !!raw.force
    };
    if (item.kind === 'chat' && !item.text) return;   // comment rỗng: không đưa lên bảng
    // lượt tự nói không phải comment của khán giả nên không vào bảng comment
    if (item.kind !== 'self') addBoard(item);
    const skip = why => { record('skipped', item, why); emit(); };

    const why = judge(item, s);
    if (why) return skip(why);

    if (item.kind === 'self') {
      if (queue.length > 0 || paused) return;   // comment thật luôn được ưu tiên trước lượt tự nói
      queue.push(item);
      schedule(0);
      return;
    }

    if (!item.force && item.kind === 'chat') {
      const last = lastReplyAt.get(item.uid);
      if (last !== undefined && now() - last < s.cooldownUserSec * 1000) {
        return skip(`Đang trong thời gian chờ (${s.cooldownUserSec}s)`);
      }
    }
    if (queue.some(q => q.uid === item.uid)) return skip('Đã có trong hàng đợi');

    if (queue.length >= s.maxQueue) {
      const old = queue.shift();
      record('skipped', old, 'Hàng đợi đầy, bỏ comment cũ');
    }
    queue.push(item);
    setState(item.id, 'queued');
    emit();
    schedule(0);
  }

  function schedule(ms) {
    if (timer || paused || videoHeld) return;
    timer = setTimeout(() => { timer = null; pump(); }, Math.max(0, ms));
  }

  // Chọn comment tiếp theo để gọi AI: ưu tiên comment được chọn tay, rồi mới tới ngẫu nhiên/thứ tự
  function takeNext(s) {
    let idx = -1;
    let urgent = false;
    if (priorityId !== null) {
      idx = queue.findIndex(q => q.id === priorityId);
      priorityId = null;
      urgent = idx >= 0;
    }
    if (idx < 0) idx = s.pickMode === 'random' ? Math.floor(rand() * queue.length) : 0;
    const item = queue.splice(idx, 1)[0];
    item.urgent = urgent;
    return item;
  }

  function startAsk(item, s) {
    asking.set(item.id, { id: item.id, name: item.name, kind: item.kind, since: now() });
    emit();
    ask(item, s).then(reply => {
      asking.delete(item.id);
      const entry = { item, reply, urgent: !!item.urgent };
      if (entry.urgent) ready.unshift(entry);   // comment được chọn tay thì đọc trước
      else ready.push(entry);
      emit();
      pump();
    }, err => {
      asking.delete(item.id);
      record('error', item, (err && err.message) || 'Lỗi không xác định');
      emit();
      pump();
    });
  }

  async function speakOne(entry, s) {
    const { item, reply } = entry;
    speaking = { id: item.id, name: item.name, kind: item.kind, since: now(), text: reply.text };
    lastReply = { id: item.id, name: item.name, kind: item.kind, text: reply.text, action: reply.action, motion: reply.motion || null, form: reply.form || null, t: now() };
    emit();
    try {
      await say({ ...lastReply, subtitleSec: s.subtitleSec });
    } catch (_) { /* lỗi hiển thị không làm kẹt hàng đợi */ }
    record('replied', item, reply.source === 'canned' ? 'câu mẫu dự phòng (AI không khả dụng)' : '', reply.text);
    lastSpokeAt = now();
    lastReplyAt.set(item.uid, lastSpokeAt);
    speaking = null;
    emit();
    pump();
  }

  // Điều phối: gọi AI song song khi còn chỗ, đọc lần lượt khi có câu trả lời sẵn
  function pump() {
    if (paused || videoHeld) return;
    const s = getSettings();

    while (asking.size < s.parallel && ready.length < s.parallel && queue.length > 0) {
      startAsk(takeNext(s), s);
    }

    if (!speaking && ready.length > 0) {
      const head = ready[0];
      const wait = head.urgent || lastSpokeAt === null ? 0 : lastSpokeAt + s.minIntervalSec * 1000 - now();
      if (wait > 0) return schedule(wait);
      ready.shift();
      speakOne(head, s);
    }
  }

  // Bấm "trả lời ngay": đưa comment lên đầu, bỏ qua khoảng nghỉ giữa hai câu
  function pickNow(id = null) {
    let target = null;
    if (id !== null && id !== undefined) target = queue.find(q => q.id === Number(id));
    else if (queue.length) target = queue[Math.floor(rand() * queue.length)];
    if (!target) return { ok: false, message: 'Comment này không còn trong hàng đợi (có thể đã được trả lời hoặc bị bỏ qua).' };

    const s = getSettings();
    const notes = [];
    if (paused) { paused = false; notes.push('Đã tiếp tục trả lời.'); }
    if (asking.size >= s.parallel) notes.push('Đang đủ số câu gọi AI cùng lúc; comment này sẽ được gọi ngay khi có chỗ trống.');
    else notes.push(`Đang gọi AI để trả lời ${target.name}…`);

    priorityId = target.id;
    clearTimeout(timer);
    timer = null;
    emit();
    schedule(0);
    return { ok: true, message: notes.join(' ') };
  }

  function togglePause() {
    paused = !paused;
    if (!paused) schedule(0);
    emit();
    return paused;
  }

  // Video quà đang phát: tạm giữ hàng chờ (câu đang đọc vẫn nói hết), nhả ra thì tiếp tục
  function setVideoHold(on) {
    videoHeld = !!on;
    if (!videoHeld) schedule(0);
    emit();
  }

  function clear() {
    queue = [];
    emit();
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
  }

  return { enqueue, pickNow, togglePause, setVideoHold, clear, snapshot, stop };
}

module.exports = { createEngine, parseKeywords };
