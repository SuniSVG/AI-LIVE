'use strict';

// Trả lời có sẵn: lời chào và quà tặng được đáp ngay, không cần gọi AI (nhanh hơn nhiều).
// Quà càng lớn thì lời cảm ơn càng nhiệt tình.

const GREET_WORDS = new Set(['chào', 'chao', 'hello', 'hi', 'hey', 'helo', 'alo', 'xin', 'hế', 'hê', 'lô', 'yo', 'ê']);
const FILLER_WORDS = new Set(['bạn', 'ơi', 'ad', 'mọi', 'người', 'cả', 'các', 'nhà', 'nha', 'nhé', 'nhe', 'nè', 'á', 'ạ', 'à', 'ha', 'đi', 'luôn', 'với', 'mình', 'em', 'chị', 'anh', 'hihi', 'haha', 'đây', 'deepseek', 'live', 'ngày', 'vui']);

// Một lời chào: ngắn, không có dấu hỏi, và chỉ gồm từ chào hoặc từ đệm
function isGreeting(text) {
  const raw = String(text || '');
  if (raw.includes('?') || raw.includes('？')) return false;
  const words = raw.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  return words.some(w => GREET_WORDS.has(w)) && words.every(w => GREET_WORDS.has(w) || FILLER_WORDS.has(w));
}

function tierOf(diamonds) {
  const d = Number(diamonds) || 0;
  if (d >= 2000) return 'mega';
  if (d >= 500) return 'huge';
  if (d >= 100) return 'big';
  return 'small';
}

const GREET = [
  { text: 'AAA {name} tới rồi!!! Chào bạn nha, mình nhớ bạn quá trời luôn á!!!', action: 'surprise' },
  { text: 'Yayyy chào {name}!!! Cuối cùng cũng đợi được bạn rồi, vào đây với mình ngay nè!!!', action: 'surprise' },
  { text: 'Ê {name}!!! Chào chào chào, bạn tới là live này bùng nổ luôn rồi đó!!!', action: 'warm' },
  { text: 'Trời ơi {name} ơi!!! Chào bạn nha, hôm nay bạn tỏa sáng quá đi mất!!!', action: 'surprise' },
  { text: 'Hú hú {name}!!! Chào bạn một cái thật to nha, bạn là người mình chờ nãy giờ đó!!!', action: 'warm' }
];

const GIFT = {
  small: [
    { text: 'Cảm ơn {name} đã tặng quà nha, mình thích lắm luôn á!', action: 'warm' },
    { text: 'Hihi, quà của {name} dễ thương quá, cảm ơn bạn nhiều nha~', action: 'warm' },
    { text: 'Ui, cảm ơn {name} nha! Mình vui quá đi mất!', action: 'warm' }
  ],
  big: [
    { text: 'Wow {name} ơi! {n} kim cương luôn hả? Mình cảm động quá, cảm ơn bạn nhiều lắm nha!!', action: 'warm' },
    { text: 'Trời ơi {name}, quà này to quá! Tim mình đập loạn rồi nè, cảm ơn bạn nhiều nha!!', action: 'warm' }
  ],
  huge: [
    { text: 'AAA {name} ơi!!! {n} kim cương luôn á?! Mình xúc động quá trời, cảm ơn bạn nhiều nhiều luôn nha!', action: 'surprise' },
    { text: 'Hả hả {name}?! {n} kim cương hả?? Bạn là ân nhân của mình rồi đó, cảm ơn bạn hết lòng luôn nha!!', action: 'surprise' }
  ],
  mega: [
    { text: 'Ê ê ê {name}!!! {n} kim cương?? Mình không thở nổi luôn á, cảm ơn {name} hết lòng luôn nha!!!', action: 'surprise' },
    { text: 'Trời đất ơi {name}!!! {n} kim cương?! Bạn là số một của live hôm nay rồi đó, cảm ơn bạn vạn lần nha!!!', action: 'surprise' }
  ]
};

// Chọn mẫu ngẫu nhiên nhưng không lặp lại mẫu vừa dùng trong cùng nhóm
function pickTemplate(pool, group, state, rand) {
  const last = state.last && state.last[group];
  let idx = Math.floor(rand() * pool.length);
  if (pool.length > 1 && idx === last) idx = (idx + 1) % pool.length;
  state.last = state.last || {};
  state.last[group] = idx;
  return pool[idx];
}

function fill(text, vars) {
  return text.replace(/\{(name|n)\}/g, (_, k) => String(vars[k]));
}

// Trả về { text, action } nếu có câu trả lời có sẵn, hoặc null để chuyển cho AI.
function quickReply(item, state = {}, rand = Math.random) {
  const name = String(item.name || 'bạn').slice(0, 30);
  if (item.kind === 'gift') {
    const tier = tierOf(item.diamonds);
    const t = pickTemplate(GIFT[tier], 'gift-' + tier, state, rand);
    return { text: fill(t.text, { name, n: Number(item.diamonds) || 0 }), action: t.action };
  }
  if (item.kind === 'chat' && isGreeting(item.text)) {
    const t = pickTemplate(GREET, 'greet', state, rand);
    return { text: fill(t.text, { name, n: 0 }), action: t.action };
  }
  return null;
}

// Câu dự phòng khi mọi mô hình AI đều không dùng được: viewer vẫn nhận được phản hồi
const CANNED = [
  { text: 'Ối, mình đang hơi đông khách quá nên nghĩ chậm xíu nha {name}! Bạn hỏi lại sau một chút nhé~', action: 'think' },
  { text: 'Hmm, đầu óc mình đang đơ mất rồi {name} ơi... bạn đợi mình chút xíu nha!', action: 'think' },
  { text: '{name} ơi, mình chưa nghĩ ra câu hay luôn á! Bạn hỏi lại giúp mình nha~', action: 'think' }
];

function cannedReply(state = {}, rand = Math.random, name = 'bạn') {
  const t = pickTemplate(CANNED, 'canned', state, rand);
  return { text: fill(t.text, { name: String(name).slice(0, 30), n: 0 }), action: t.action, source: 'canned' };
}

// Quà không có video nào được gắn: cảm ơn, rồi báo sắp nhảy được và sẽ nhảy cho cả nhà xem
const NO_VIDEO_GIFT = [
  { text: 'Cảm ơn {name} đã tặng quà nha! Mình sắp có thể nhảy rồi đó, vài hôm nữa mình sẽ nhảy cho mọi người xem nha!', action: 'surprise' },
  { text: 'Ui {name} ơi, cảm ơn bạn nhiều nha! Mình sắp nhảy được rồi, vài hôm nữa sẽ nhảy cho cả nhà xem luôn nè!', action: 'warm' },
  { text: 'Cảm ơn {name}~ Mình đang tập nhảy đó, sắp có thể nhảy rồi, vài hôm nữa mình nhảy cho mọi người xem nha!', action: 'warm' }
];

function noVideoGiftReply(item, state = {}, rand = Math.random) {
  const name = String(item.name || 'bạn').slice(0, 30);
  const t = pickTemplate(NO_VIDEO_GIFT, 'novideo', state, rand);
  return { text: fill(t.text, { name, n: 0 }), action: t.action };
}

module.exports = { quickReply, isGreeting, tierOf, cannedReply, noVideoGiftReply };
