'use strict';

// Danh mục cảm xúc của nhân vật Live2D, đọc từ tuning.json của model.
//  - expressions: cảm xúc có biểu cảm thật (id -> danh sách file exp). Chỉ id có biểu cảm mới được AI chọn.
//  - emotionInfo: nhãn tiếng Việt và gợi ý khi nào dùng (id -> {label, hint}). Thiếu thì dùng id làm nhãn.
// Thứ tự: theo emotionInfo trước, các id còn lại theo expressions.

const ID_RE = /^[a-z][a-z0-9_]{0,30}$/;

function emotionCatalog(tuning) {
  const exps = (tuning && tuning.expressions) || {};
  const info = (tuning && tuning.emotionInfo) || {};
  const valid = id => ID_RE.test(id) && Array.isArray(exps[id]) && exps[id].length > 0;
  const withInfo = Object.keys(info).filter(valid);
  const rest = Object.keys(exps).filter(id => valid(id) && !withInfo.includes(id));
  return [...withInfo, ...rest].map(id => {
    const i = info[id] || {};
    return { id, label: String(i.label || id).slice(0, 40), hint: String(i.hint || '').slice(0, 120) };
  });
}

module.exports = { emotionCatalog };
