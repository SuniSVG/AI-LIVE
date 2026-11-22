'use strict';

// Rút "sự thật" về khán giả để nhớ lâu dài, theo hai đường:
//  1. Thẻ [fact:...] do AI tự gắn khi khán giả vừa nói điều gì về bản thân (kiểu marker của airi llm-marker-parser).
//  2. Mẫu câu tự giới thiệu tiếng Việt trong comment ("mình tên là...", "mình đang học...").
// Luôn đi qua sanitizeFact: thông tin nhạy cảm (sức khoẻ, tôn giáo, chính trị, liên lạc, tài chính...)
// không bao giờ được lưu, dù AI hay comment nói ra. Chỉ lưu điều khán giả tự nói về chính họ.

const FACT_TAG = /\[fact:\s*([^\]\n]{1,160})\]/gi;

const SENSITIVE = /(bệnh|ung thư|trầm cảm|lo âu|thuốc|tôn giáo|theo đạo|công giáo|phật giáo|hồi giáo|chúa|đảng|chính trị|bầu cho|địa chỉ|số nhà|sđt|số điện thoại|email|facebook|tài khoản|ngân hàng|mật khẩu|khuyết tật|tình dục|hôn nhân|ly hôn|thu nhập|lương|nợ|\d{6,}|gay|đồng tính|chuyển giới)/i;

const TRAILING_PARTICLES = /\s+(nè|nha|nhé|nhe|á|ạ|luôn|đó|vậy|với|ơi|nữa|hả|hen|quá|lắm)$/iu;

function sanitizeFact(text) {
  let t = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.!?,;]+$/, '');
  while (TRAILING_PARTICLES.test(t)) t = t.replace(TRAILING_PARTICLES, '');
  if (t.length < 3 || t.length > 120) return null;
  if (SENSITIVE.test(t)) return null;
  return t;
}

// Tách thẻ [fact:...] ra khỏi lời nói. Trả về { clean, facts }
function extractFacts(raw) {
  const facts = [];
  const clean = String(raw || '').replace(FACT_TAG, (_, body) => {
    const f = sanitizeFact(body);
    if (f) facts.push(f);
    return '';
  }).replace(/[ \t]+\n/g, '\n').trim();
  return { clean, facts };
}

const SELF_PATTERNS = [
  [/\b(?:mình|em|tôi|tớ) tên (?:là )?([\p{L}]{2,15}(?: [\p{L}]{2,15})?)/iu, m => `tên là ${m[1]}`],
  [/\b(?:mình|em|tôi|tớ) (?:đang )?học ([\p{L}]{2,15}(?: [\p{L}]{2,15}){0,2})/iu, m => `đang học ${m[1]}`],
  [/\b(?:mình|em|tôi|tớ) (?:rất )?thích ([\p{L}]{2,15}(?: [\p{L}]{2,15}){0,2})/iu, m => `thích ${m[1]}`],
  [/\b(?:mình|em|tôi|tớ) (?:làm nghề|đang làm) ([\p{L}]{2,15}(?: [\p{L}]{2,15}){0,2})/iu, m => `làm ${m[1]}`]
];

// Mẫu tự giới thiệu trong comment. Mẫu đầu tiên khớp thì thôi, tránh lưu lặp.
function heuristicFacts(text) {
  const out = [];
  const s = String(text || '');
  for (const [re, fmt] of SELF_PATTERNS) {
    const m = s.match(re);
    if (m) {
      const f = sanitizeFact(fmt(m));
      if (f) out.push(f);
    }
  }
  return out;
}

const FACT_RULE = [
  'Nếu khán giả vừa nói điều gì về chính họ (tên, việc đang học, sở thích, nghề nghiệp), hãy thêm MỘT thẻ [fact:...] ở cuối câu trả lời, nội dung ngắn gọn, ví dụ [fact:đang học y khoa] hoặc [fact:thích mèo].',
  'Không gắn thẻ fact cho thông tin nhạy cảm (sức khoẻ, tôn giáo, chính trị, liên lạc, tài chính) hoặc cho điều bạn tự suy đoán. Đa số câu không cần thẻ fact: khi đó bỏ hẳn.'
].join(' ');

module.exports = { extractFacts, heuristicFacts, sanitizeFact, FACT_RULE };
