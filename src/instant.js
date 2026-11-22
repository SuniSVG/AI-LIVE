'use strict';

// Trả lời tức thì (không xếp hàng, không gọi AI) theo luật riêng của từng nhân vật.
//  - instant: comment khớp đúng một từ khoá (ví dụ "me") -> nói lời chào ngay.
//  - defer:   câu hỏi khớp từ khoá riêng -> nói câu cố định ngay, không tốn lượt AI.

// Chuẩn hoá để so khớp: chữ thường, bỏ dấu câu và khoảng trắng thừa
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fill(text, name) {
  return String(text).replace(/\{name\}/g, String(name || 'bạn').slice(0, 30));
}

/* Trả về:
 *   { kind: 'reply', text, action }  nói ngay câu này
 *   { kind: 'skip' }                 khớp luật nhưng đang trong thời gian chờ của người này: bỏ qua, không gọi AI
 *   null                              không khớp, đi tiếp như comment thường
 */
function instantFor(item, rules, state, now = Date.now(), cooldownMs = 120000) {
  if (!item || item.kind !== 'chat' || !rules || !Array.isArray(rules.instant)) return null;
  const t = norm(item.text);
  const rule = rules.instant.find(r => r.words.some(w => norm(w) === t));
  if (!rule) return null;
  const key = String(item.uid || item.name || '');
  const last = (state && state[key]) || 0;
  if (last && now - last < cooldownMs) return { kind: 'skip' };   // chưa từng được chào thì luôn chào
  if (state) state[key] = now;
  return { kind: 'reply', text: fill(rule.text, item.name), action: rule.action || 'warm' };
}

// Câu hỏi khớp từ khoá của luật defer: trả lời câu cố định ngay (nhân vật nào có luật thì khai báo trong characters.js)
function deferFor(item, rules) {
  if (!item || item.kind !== 'chat' || !rules || !rules.defer) return null;
  const t = norm(item.text);
  if (!rules.defer.words.some(w => t.includes(norm(w)))) return null;
  return { text: fill(rules.defer.text, item.name), action: rules.defer.action || 'think' };
}

module.exports = { norm, instantFor, deferFor };
