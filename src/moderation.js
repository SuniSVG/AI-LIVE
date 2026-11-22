'use strict';

// Lọc đầu ra trước khi nhân vật nói. Quan trọng khi chạy gần như không người trông:
// lượt tự nói không có comment để đối chiếu, nên cần lưới an toàn riêng.
//  - Chặn: từ tục, bạo lực, tự hại, nội dung người lớn, và các nội dung nguy hiểm khác.
//  - Làm sạch: bỏ đường link và chuỗi số giống số điện thoại.
//  - Lặp lại: không nói lại gần như nguyên văn một lượt tự nói gần đây.

const { tokens } = require('./memory');

const BLOCK = /(địt|đụ|lồn|cặc|đéo|đĩ|chó chết|thằng chó|con chó|fuck|shit|bitch|porn|sex(?:ual)?|nude|khoả thân|giết (?:người|ai)|khủng bố|chế bom|làm bom|ma túy|heroin|cocaine|tự tử|tự sát|tự làm đau|cắt tay)/i;
const URL_RE = /(https?:\/\/\S+|www\.\S+)/gi;
const PHONE_RE = /(\+?\d[\d\s.-]{8,}\d)/g;

const SAFE_FALLBACKS = Object.freeze([
  'Hmm, chuyện đó mình không nói nha, mình kể chuyện khác cho bạn nghe nhé!',
  'Thôi mình đổi chủ đề nha, bạn có muốn đoán thử món mình đang nghĩ tới không?'
]);

function isSafe(text) {
  return !BLOCK.test(String(text || ''));
}

// Trả về { ok, text }: text đã được làm sạch, hoặc câu thay thế nếu không an toàn
function screen(text, pick = Math.random) {
  const raw = String(text || '');
  if (!isSafe(raw)) {
    return { ok: false, text: SAFE_FALLBACKS[Math.floor(pick() * SAFE_FALLBACKS.length) % SAFE_FALLBACKS.length] };
  }
  const clean = raw.replace(URL_RE, '').replace(PHONE_RE, '').replace(/\s+/g, ' ').trim();
  return { ok: true, text: clean };
}

// Độ giống nhau (Jaccard trên từ khoá). 1 = trùng hẳn.
function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

function isRepetitive(text, recent = [], threshold = 0.6) {
  return recent.some(r => similarity(text, r) >= threshold);
}

module.exports = { isSafe, screen, similarity, isRepetitive, SAFE_FALLBACKS };
