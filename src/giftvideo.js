'use strict';

// Bảng quà → video. Mỗi dòng: tên quà (đúng như TikTok hiển thị) và đường dẫn file video.
// Tên "*" nghĩa là mọi quà không có trong bảng. Không phụ thuộc Electron nên có thể kiểm thử bằng node --test.

const MAX_RULES = 50;
const MAX_GIFT = 60;
const MAX_PATH = 500;

// So khớp tên quà: không phân biệt hoa thường, bỏ khoảng trắng thừa
const normGift = s => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function newRuleId() {
  return 'v' + Math.random().toString(36).slice(2, 10);
}

// Làm sạch một dòng. Dòng thiếu tên quà hoặc thiếu file thì bỏ. Thiếu id thì tạo mới.
function cleanRule(r) {
  if (!r || typeof r !== 'object') return null;
  const gift = String(r.gift ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_GIFT);
  const path = String(r.path ?? '').trim().slice(0, MAX_PATH);
  if (!gift || !path) return null;
  const id = typeof r.id === 'string' && /^[a-z0-9]{4,40}$/.test(r.id) ? r.id : newRuleId();
  return { id, gift, path };
}

// Làm sạch cả bảng: bỏ dòng hỏng, bỏ id trùng (giữ dòng đầu), giới hạn số dòng
function cleanRules(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list.slice(0, MAX_RULES * 2)) {
    const r = cleanRule(raw);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
    if (out.length >= MAX_RULES) break;
  }
  return out;
}

// Tìm dòng khớp với quà: khớp đúng tên trước, không có thì dùng dòng "*"
function findVideoRule(rules, giftName) {
  const list = Array.isArray(rules) ? rules : [];
  const g = normGift(giftName);
  if (g) {
    const exact = list.find(r => normGift(r.gift) === g);
    if (exact) return exact;
  }
  return list.find(r => r.gift === '*') || null;
}

// Quà này có video được gắn để nhảy không (đã bật video và có luật khớp hoặc luật "mọi quà khác")
function hasLinkedVideo(rules, giftName, videoEnabled) {
  return !!videoEnabled && !!findVideoRule(rules, giftName);
}

module.exports = { cleanRule, cleanRules, findVideoRule, hasLinkedVideo, normGift, newRuleId, MAX_RULES };
