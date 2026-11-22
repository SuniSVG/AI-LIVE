'use strict';

// Icon của từng quà (tên TikTok -> tên file trong renderer/assets/gifts). Đồng bộ với GIFT_CATALOG
// trong renderer/js/control.js; test/giftfx.test.js kiểm tra hai bảng khớp nhau.
const ICON_BY_NAME = new Map([
  ['GG', 'gg'],
  ['Heart', 'heart'],
  ['Heart Me', 'heart_me'],
  ['Ice Cream Cone', 'ice_cream_cone'],
  ['Love you', 'love_you'],
  ['Rose', 'rose'],
  ['Thumbs Up', 'thumbs_up'],
  ['TikTok', 'tiktok'],
  ['Team Bracelet', 'team_bracelet'],
  ['Finger Heart', 'finger_heart'],
  ['Cheer You Up', 'cheer_you_up'],
  ['Friendship Necklace', 'friendship_necklace'],
  ['Rosa', 'rosa'],
  ['Perfume', 'perfume'],
  ['Doughnut', 'doughnut'],
  ['Bubble Gum', 'bubble_gum'],
  ['Cap', 'cap'],
  ['Hat and Mustache', 'hat_and_mustache'],
  ['Level-up Sparks', 'levelup_sparks'],
  ['Like-Pop', 'like_pop'],
  ['Little Crown', 'little_crown'],
  ['Love Painting', 'love_painting'],
  ['Paper Crane', 'paper_crane'],
  ['Confetti', 'confetti'],
  ['Shamrock', 'shamrock'],
  ['Bouquet', 'bouquet'],
  ['Hand Heart', 'hand_heart'],
  ['Ice Cream', 'ice_cream']
]);
const FALLBACK_ICON = 'confetti';

// Tên quà từ TikTok có thể khác chữ hoa/thường hoặc khoảng trắng: chuẩn hoá trước khi tra
const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const ICON_LOOKUP = new Map([...ICON_BY_NAME].map(([n, i]) => [norm(n), i]));

function giftIcon(name) {
  return ICON_LOOKUP.get(norm(name)) || FALLBACK_ICON;
}

module.exports = { giftIcon, ICON_BY_NAME, FALLBACK_ICON };
