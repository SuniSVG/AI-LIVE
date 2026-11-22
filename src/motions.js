'use strict';

// Tự nạp motion Live2D từ thư mục motions/ mà không cần sửa model.json bằng tay.
//  - Mỗi file .mtn là một motion. Tên file (không đuôi) là tên nhóm: "id4.mtn" -> nhóm "id4".
//  - File bắt đầu bằng "idle" (ví dụ idle.mtn, idle_02.mtn) vào nhóm "idle": nhân vật tự chơi khi rảnh.
// Trả về model.json đã có mục "motions"; nếu không có file nào thì giữ nguyên.

function groupOf(fileName) {
  const base = String(fileName).replace(/\.mtn$/i, '');
  return /^idle/i.test(base) ? 'idle' : base;
}

function buildMotions(fileNames, dir = 'motions') {
  const groups = {};
  for (const f of fileNames) {
    if (!/\.mtn$/i.test(f)) continue;
    const g = groupOf(f);
    (groups[g] = groups[g] || []).push({ file: `${dir}/${f}` });
  }
  // sắp để idle.mtn đứng trước idle_02.mtn, các nhóm khác theo tên
  for (const g of Object.keys(groups)) groups[g].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return groups;
}

function buildModelJson(base, fileNames, dir = 'motions') {
  const motions = buildMotions(fileNames, dir);
  if (!Object.keys(motions).length) return base;
  return { ...base, motions };
}

// Nhóm motion mà AI và chuyển động tự do được phép dùng: mọi nhóm trừ idle (idle do Live2D tự chạy khi rảnh).
function freeGroupNames(fileNames) {
  return Object.keys(buildMotions(fileNames)).filter(g => g !== 'idle').sort();
}

// Chọn ngẫu nhiên một nhóm trong `groups`, tránh lặp lại nhóm vừa chạy (`last`) khi còn lựa chọn khác.
function pickFreeGroup(groups, last = '', rng = Math.random) {
  if (!groups || !groups.length) return null;
  const pool = groups.length > 1 ? groups.filter(g => g !== last) : groups;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

// Tên motion AI đưa ra chỉ được dùng khi nó thật sự có trong thư mục; còn lại bỏ qua.
function resolveMotion(name, available) {
  if (!name || !available) return null;
  return available.includes(name) ? name : null;
}

// Danh mục motion cho AI chọn. Chỉ giữ motion có thật trong thư mục. Mỗi motion có nhãn, gợi ý khi nào dùng
// (tuning.motionInfo), danh sách cảm xúc hợp với nó (đảo từ tuning.emotionMotion) và cờ vừa dùng gần đây.
function motionCatalog(tuning, available, recent = '') {
  const info = (tuning && tuning.motionInfo) || {};
  const emo = (tuning && tuning.emotionMotion) || {};
  const have = new Set(available || []);
  const fits = {};
  for (const [e, list] of Object.entries(emo)) {
    if (!Array.isArray(list)) continue;
    for (const m of list) (fits[m] = fits[m] || []).push(e);
  }
  const named = Object.keys(info).filter(id => have.has(id));
  const rest = (available || []).filter(id => !info[id]);
  return [...named, ...rest].map(id => ({
    id,
    label: String((info[id] && info[id].label) || id).slice(0, 40),
    hint: String((info[id] && info[id].hint) || '').slice(0, 120),
    emotions: fits[id] || [],
    recent: id === recent
  }));
}

// Chọn motion hợp cảm xúc (dùng khi cần một lựa chọn dự phòng), tránh lặp motion vừa chạy
function motionForEmotion(emotion, tuning, available, last = '', rng = Math.random) {
  const have = new Set(available || []);
  const pool = (((tuning && tuning.emotionMotion) || {})[emotion] || []).filter(m => have.has(m));
  if (!pool.length) return null;
  const fresh = pool.length > 1 ? pool.filter(m => m !== last) : pool;
  return fresh[Math.floor(rng() * fresh.length) % fresh.length];
}

module.exports = { groupOf, buildMotions, buildModelJson, freeGroupNames, pickFreeGroup, resolveMotion, motionCatalog, motionForEmotion };
