'use strict';

// Gọi chuỗi mô hình theo kiểu "hedged request" để giảm độ trễ đuôi:
//  - Bắt đầu bằng mô hình đầu chuỗi.
//  - Nếu sau `hedgeMs` chưa có kết quả, bắn thêm mô hình kế tiếp SONG SONG (tối đa `maxParallel`).
//  - Mô hình lỗi (quá tải, không tồn tại...) thì sang mô hình kế tiếp ngay, không chờ.
//  - Ai trả lời xong trước thì thắng, các request còn lại bị huỷ.
// Không phụ thuộc SDK nên kiểm thử được bằng node --test.

const sleep = ms => new Promise(r => setTimeout(r, ms));

function hedgedRun({
  chain,
  call,                       // async (model, signal) => string
  signal,                     // huỷ từ bên ngoài (hết thời gian tổng, người dùng huỷ)
  isTransient,                // (err) => bool: đáng thử lại cùng mô hình một lần
  shouldTryNext,              // (err) => bool: false = lỗi cố định (khoá API, yêu cầu sai), dừng hẳn
  hedgeMs = 1800,
  maxParallel = 3,
  retryDelayMs = 300,
  perAttemptMs = 8000,
  warn = () => {}
}) {
  return new Promise((resolve, reject) => {
    const master = new AbortController();
    let next = 0, running = 0, tried = 0;
    let settled = false, halted = false, lastErr = null, timer = null;

    function finish(fn, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      master.abort();          // huỷ các request còn dang dở
      fn(value);
    }
    function fail() {
      const msg = String((lastErr && lastErr.message) || 'không rõ lỗi').replace(/\s+/g, ' ').slice(0, 200);
      finish(reject, new Error(`Gemini lỗi sau ${tried} lần thử: ${msg}`));
    }
    function onAbort() {
      finish(reject, signal.reason || Object.assign(new Error('Đã huỷ'), { name: 'AbortError' }));
    }
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    function arm() {
      clearTimeout(timer);
      if (settled || halted || next >= chain.length) return;
      timer = setTimeout(() => { if (running < maxParallel) launch(); else arm(); }, hedgeMs);
    }

    async function attempt(model) {
      for (let n = 1; ; n++) {
        const sig = AbortSignal.any([master.signal, AbortSignal.timeout(perAttemptMs)]);
        tried++;
        try {
          const text = await call(model, sig);
          if (!String(text || '').trim()) throw new Error('mô hình trả về rỗng');
          return text;
        } catch (err) {
          if (settled) throw err;
          if (n < 2 && isTransient(err)) {
            await sleep(retryDelayMs);
            if (settled) throw err;
            continue;
          }
          throw err;
        }
      }
    }

    function launch() {
      if (settled || halted) return;
      if (next >= chain.length) { if (running === 0) fail(); return; }
      const model = chain[next++];
      running++;
      attempt(model).then(
        text => {
          if (settled) return;
          if (model !== chain[0]) warn(`[gemini] dùng mô hình dự phòng: ${model}`);
          finish(resolve, text);
        },
        err => {
          running--;
          if (settled) return;
          lastErr = err;
          if (!shouldTryNext(err)) halted = true;
          else warn(`[gemini] ${model} không dùng được, thử mô hình kế tiếp: ${String(err && err.message).slice(0, 120)}`);
          if (halted) { if (running === 0) fail(); return; }
          launch();            // sang mô hình kế tiếp ngay
        }
      );
      arm();
    }

    launch();
  });
}

module.exports = { hedgedRun };
