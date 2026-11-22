'use strict';

// Nhiều API key Gemini, xoay vòng. Mỗi comment dùng 2 key cùng lúc (đua nhau, key nào trả lời trước thì thắng).
// Key bị giới hạn tốc độ (429) hoặc sai/hết hạn được cho "nghỉ" một lúc, lần sau xoay sang key khác.
// Không phụ thuộc SDK nên kiểm thử được bằng node --test.

const { statusOf } = require('./models');

const KEYS_PER_REQUEST = 2;
const COOL_RATE_MS = 30 * 1000;        // 429: nghỉ 30 giây
const COOL_QUOTA_DAY_MS = 10 * 60e3;   // hết hạn mức ngày: nghỉ 10 phút
const COOL_AUTH_MS = 10 * 60e3;        // key sai/bị chặn: nghỉ 10 phút

// Tách danh sách key từ văn bản người dùng dán vào: mỗi dòng một key (cũng nhận dấu phẩy, chấm phẩy, khoảng trắng)
function parseKeys(text) {
  const list = String(text || '').split(/[\s,;]+/).map(s => s.trim()).filter(s => s.length >= 10);
  return [...new Set(list)].slice(0, 20);
}

// Thời gian nghỉ (ms) cho một key sau lỗi này; 0 nếu lỗi không do key
function cooldownFor(err) {
  const msg = String((err && err.message) || err || '');
  const st = statusOf(err);
  if (st === 401 || st === 403 || /API key not valid|API_KEY_INVALID|PERMISSION_DENIED|API key expired|leaked/i.test(msg)) return COOL_AUTH_MS;
  if (st === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) return /per ?day|daily/i.test(msg) ? COOL_QUOTA_DAY_MS : COOL_RATE_MS;
  return 0;
}

function createKeyPool({ now = Date.now } = {}) {
  let rr = 0;
  const cool = new Map();   // key -> thời điểm hết nghỉ

  const isCooling = k => (cool.get(k) || 0) > now();

  // Chọn tối đa n key khác nhau, xoay vòng; bỏ qua key đang nghỉ (nếu tất cả đều nghỉ thì vẫn dùng hết, còn hơn không trả lời)
  function pick(keys, n = KEYS_PER_REQUEST) {
    const all = [...new Set(keys || [])];
    if (!all.length) return [];
    let pool = all.filter(k => !isCooling(k));
    if (!pool.length) pool = all;
    const m = Math.min(n, pool.length);
    const out = [];
    for (let i = 0; i < m; i++) out.push(pool[(rr + i) % pool.length]);
    rr += m;
    return out;
  }

  function penalize(key, err) {
    const ms = cooldownFor(err);
    if (ms > 0) cool.set(key, now() + ms);
    return ms;
  }

  const status = keys => ({ total: (keys || []).length, cooling: (keys || []).filter(isCooling).length });
  return { pick, penalize, isCooling, status };
}

// Gọi cùng một yêu cầu bằng nhiều key cùng lúc; key nào trả lời (không rỗng) trước thì thắng, các key còn lại bị huỷ.
// Chỉ khi mọi key đều lỗi mới ném lỗi (ưu tiên lỗi cho phép thử mô hình khác).
function raceKeys({ keys, call, signal, onFail = () => {}, shouldTryNext = () => true }) {
  if (keys.length === 1) return call(keys[0], signal).then(t => {
    if (!String(t || '').trim()) throw new Error('mô hình trả về rỗng');
    return t;
  }, err => { onFail(keys[0], err); throw err; });

  return new Promise((resolve, reject) => {
    const ctl = new AbortController();
    const sig = signal ? AbortSignal.any([ctl.signal, signal]) : ctl.signal;
    let pending = keys.length, done = false;
    const errs = [];
    const lose = (k, err) => {
      if (done) return;
      errs.push(err);
      onFail(k, err);
      if (--pending === 0) { done = true; reject(errs.find(shouldTryNext) || errs[0]); }
    };
    for (const k of keys) {
      Promise.resolve().then(() => call(k, sig)).then(text => {
        if (done) return;
        if (!String(text || '').trim()) return lose(k, new Error('mô hình trả về rỗng'));
        done = true;
        ctl.abort();
        resolve(text);
      }, err => lose(k, err));
    }
  });
}

module.exports = { parseKeys, cooldownFor, createKeyPool, raceKeys, KEYS_PER_REQUEST };
