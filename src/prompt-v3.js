'use strict';

// Ghép trí nhớ và tâm trạng vào prompt hệ thống, và tạo lượt "tự nói".
// Đầu ra vẫn theo định dạng cũ ([cảm xúc] rồi lời nói) nên không cần đổi phần đọc trả lời.

const { RECAP_SEED } = require('./autonomy');

const MAX_BLOCK_CHARS = 1200;

// recall: kết quả từ memory.recall(); mood: chuỗi từ mood.describe()
function buildMemoryBlock(recall, mood) {
  const lines = [];
  if (mood) lines.push(mood);
  const r = recall || {};
  if (r.viewer) {
    const v = r.viewer;
    lines.push(`Người đang nói với bạn là ${v.name} (đã chat ${v.chats} lần, tặng ${v.gifts} quà).`);
    if (v.summary) lines.push(`Tóm tắt về ${v.name} từ các buổi trước: ${v.summary}`);
    if (v.facts && v.facts.length) lines.push(`Bạn biết về ${v.name}: ${v.facts.join('; ')}.`);
  }
  if (r.recent && r.recent.length) {
    lines.push('Các lượt gần đây với người này:');
    for (const e of r.recent) lines.push(`- ${e.kind === 'self' ? 'bạn tự nói' : 'họ nói'}: "${e.text}"${e.reply ? ` → bạn đáp: "${e.reply}"` : ''}`);
  }
  if (r.related && r.related.length) {
    lines.push('Chuyện liên quan đã xảy ra trong live (có thể nhắc lại tự nhiên nếu hợp):');
    for (const e of r.related) lines.push(`- ${e.name || 'khán giả'}: "${e.text}"`);
  }
  if (!lines.length) return '';
  let block = ['[Trí nhớ và trạng thái]', ...lines,
    'Dùng trí nhớ để nối tiếp câu chuyện và nhớ tên người xem. Không bịa thêm sự kiện không có trong trí nhớ. Không đọc lại nguyên văn các dòng trên.'].join('\n');
  if (block.length > MAX_BLOCK_CHARS) block = block.slice(0, MAX_BLOCK_CHARS);
  return block;
}

// Lời nhắc cho lượt tự nói: không có comment nào, nhân vật tự mở lời
function buildSelfUserText(seed, { recap = false } = {}) {
  const head = recap
    ? 'Không có comment nào lúc này. Hãy tự tóm tắt buổi live.'
    : 'Không có comment nào lúc này. Hãy tự mở lời với khán giả một cách tự nhiên.';
  return `[Tự nói] ${head} Chủ đề gợi ý: ${seed}. Nói tối đa hai câu, không hỏi thông tin cá nhân, không ép tặng quà.`;
}

function isRecapSeed(seed) {
  return seed === RECAP_SEED;
}

module.exports = { buildMemoryBlock, buildSelfUserText, isRecapSeed };

// Tính cách nền ổn định: giữ cho nhân vật nhất quán qua nhiều buổi live (không thay đổi theo comment).
const IDENTITY_LINES = [
  '[Bản thân]',
  'Bạn có sở thích ổn định: ăn vặt, nghe nhạc lo-fi, kể chuyện vặt, chơi game đơn giản. Những sở thích này không đổi giữa các buổi live.',
  'Bạn có thói quen: hay than đói, hay nhắc tên người xem khi nhớ ra, thích đố vui nhẹ.',
  'Nếu ai hỏi trực tiếp bạn có phải AI không, hãy trả lời thật rằng bạn là nhân vật ảo do AI điều khiển, rồi tiếp tục trò chuyện tự nhiên.',
  'Đừng bịa ra thông tin đời thật về người xem. Nếu chưa biết điều gì, cứ hỏi nhẹ nhàng.'
];

function buildIdentityBlock() {
  return IDENTITY_LINES.join('\n');
}

module.exports.buildIdentityBlock = buildIdentityBlock;
