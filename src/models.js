'use strict';

// Chuỗi mô hình dự phòng và cách phân loại lỗi. Không phụ thuộc SDK nên có thể kiểm thử riêng.

const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',   // nhanh nhất: đứng đầu để trả lời sớm nhất
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash'
];

// Thứ tự: mô hình chính -> mô hình người dùng thêm -> chuỗi mặc định (không trùng)
function buildChain(model, extraCsv = '') {
  const extras = String(extraCsv || '').split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set([String(model || '').trim(), ...extras, ...FALLBACK_MODELS].filter(Boolean))];
}

function statusOf(err) {
  if (err && typeof err.status === 'number') return err.status;
  const msg = String((err && err.message) || err || '');
  const m = msg.match(/"code"\s*:\s*(\d{3})/) || msg.match(/\b(404|408|429|500|502|503|504)\b/);
  return m ? Number(m[1]) : 0;
}

const RETRY_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);
const RETRY_TEXT = /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|NOT_FOUND|is not found|not supported for|DEADLINE|timed? ?out|aborted|fetch failed|ECONNRESET|ETIMEDOUT|trả về rỗng/i;
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

// Lỗi tạm thời (quá tải, hết hạn mức): đáng thử lại cùng mô hình một lần
function isTransient(err) {
  return TRANSIENT_STATUS.has(statusOf(err)) || /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(String((err && err.message) || err || ''));
}

// Lỗi tạm thời hoặc mô hình không dùng được: thử mô hình kế tiếp.
// Lỗi khóa API, quyền, yêu cầu sai: dừng luôn, thử mô hình khác cũng vô ích.
function shouldTryNext(err) {
  const name = err && err.name;
  if (name === 'AbortError' || name === 'TimeoutError') return true;   // hết thời gian của một mô hình
  return RETRY_STATUS.has(statusOf(err)) || RETRY_TEXT.test(String((err && err.message) || err || ''));
}

module.exports = { FALLBACK_MODELS, buildChain, statusOf, shouldTryNext, isTransient };
