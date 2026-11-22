'use strict';

// Tóm tắt trí nhớ bằng mô hình (thay cho chỉ truy hồi theo từ khoá).
// Khi một khán giả có đủ lượt mới, mô hình viết một tóm tắt ngắn và danh sách sự thật.
// Kết quả là JSON; mọi sự thật đi qua sanitizeFact như trước.

const { sanitizeFact } = require('./facts');

function buildSummaryPrompt(name, episodes) {
  const system = [
    'Bạn tóm tắt quan hệ giữa nhân vật ảo và một khán giả livestream từ các lượt trò chuyện.',
    'Chỉ trả về MỘT đối tượng JSON, không kèm chữ nào khác, không dùng markdown:',
    '{"summary": "tối đa 3 câu, tiếng Việt, về người này và chủ đề họ quan tâm", "facts": ["tối đa 5 điều khán giả TỰ NÓI về chính họ, ngắn gọn"]}',
    'Không ghi thông tin nhạy cảm (sức khoẻ, tôn giáo, chính trị, liên lạc, tài chính). Không suy đoán điều họ không nói. Nếu không có gì đáng nhớ, trả về "summary": "" và "facts": [].'
  ].join('\n');
  const lines = episodes.map(e => `- ${e.kind === 'self' ? '(nhân vật)' : name}: ${e.kind === 'gift' ? '[quà]' : `"${e.text}"`}${e.reply ? ` → nhân vật: "${e.reply}"` : ''}`);
  return { system, userText: `Các lượt của ${name}:\n${lines.join('\n')}` };
}

// Đọc JSON trả về của mô hình, chịu được rào markdown. Lỗi thì trả về null.
function parseSummary(raw) {
  let s = String(raw || '').trim().replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(s.slice(start, end + 1));
    const summary = typeof j.summary === 'string' ? j.summary.trim() : '';
    const facts = Array.isArray(j.facts) ? j.facts.filter(f => typeof f === 'string').map(sanitizeFact).filter(Boolean).slice(0, 5) : [];
    return { summary, facts };
  } catch (_) {
    return null;
  }
}

module.exports = { buildSummaryPrompt, parseSummary };
