'use strict';

// Tính cách, prompt và xử lý câu trả lời của AI.
// Định dạng đầu ra: dòng đầu là biểu cảm trong ngoặc vuông, các dòng sau là lời nói.
// Ví dụ: "[warm]\nMây Hồng ơi, mình khỏe lắm nè! Hôm nay bạn vui không hihi"

const ACTIONS = ['neutral', 'warm', 'tease', 'think', 'surprise', 'stern', 'zafkiel'];
// Bảng cảm xúc cũ (dùng khi chưa có danh mục của nhân vật)
const LEGACY_EMOTIONS = ACTIONS.map(id => ({ id, label: id, hint: '' }));
const LANG_NAME = { vi: 'tiếng Việt', en: 'tiếng Anh', ja: 'tiếng Nhật' };
const MAX_TEXT = 300;

const { getCharacter, FORMS, FORM_IDS } = require('./characters');

// Prompt theo nhân vật. Ô "tính cách" của người dùng (nếu có) thay cho mặc định của nhân vật đó.
function personaFor(s) {
  const ch = getCharacter(s.character);
  const custom = (s.personas && s.personas[ch.id] || '').trim();
  return custom || ch.persona;
}

// formNote: { current: id dạng đang dùng hoặc null, canChange: có được đổi dạng lúc này không }
// motionNames: các chuyển động cơ thể có sẵn của nhân vật (rỗng = không cho chọn chuyển động).
// emotions: danh mục cảm xúc của nhân vật [{id, label, hint}] (đọc từ tuning.json). Không có thì dùng bảng cũ.
function buildSystem(s, motionNames = [], formNote = null, emotions = null) {
  const lang = LANG_NAME[s.locale] || LANG_NAME.vi;
  const ch = getCharacter(s.character);
  const emo = Array.isArray(emotions) && emotions.length ? emotions : LEGACY_EMOTIONS;
  const lines = [
    personaFor(s),
    '',
    `Ngôn ngữ trả lời: ${lang}.`,
    `Định dạng bắt buộc: dòng đầu tiên là MỘT cảm xúc trong ngoặc vuông, chọn trong: ${emo.map(e => `[${e.id}]`).join(', ')}. Các dòng sau là lời nói của bạn (${ch.name}). Không dùng JSON, không đặt lời nói trong dấu ngoặc kép.`,
    'Chọn cảm xúc KHỚP với nội dung câu bạn sắp nói: được khen thì vui hoặc ngại, bị trêu thì lém lỉnh, nghe chuyện buồn thì buồn, câu hỏi khó thì suy nghĩ. Đừng chọn theo thói quen. Ý nghĩa từng cảm xúc:',
    ...emo.map(e => `- [${e.id}] ${e.label}${e.hint ? ': ' + e.hint : ''}`)
  ];
  if (motionNames.length) {
    // mỗi phần tử: tên, hoặc {id, label, hint, emotions, recent} từ danh mục của nhân vật
    const items = motionNames.map(m => (typeof m === 'string' ? { id: m, label: m, hint: '', emotions: [], recent: false } : m));
    lines.push(
      `Có thể kèm MỘT chuyển động cơ thể ngay sau cảm xúc, dạng [motion:TÊN], với TÊN chọn trong: ${items.map(i => i.id).join(', ')}. ` +
      'Chỉ dùng khi chuyển động khớp nội dung câu nói và cảm xúc đã chọn. Đa số câu không cần chuyển động: khi đó bỏ hẳn phần [motion:...]. ' +
      'Ý nghĩa từng chuyển động:',
      ...items.map(i => {
        const extra = [];
        if (i.emotions.length) extra.push(`hợp với cảm xúc: ${i.emotions.join(', ')}`);
        if (i.recent) extra.push('vừa dùng gần đây, tránh lặp lại');
        return `- [motion:${i.id}] ${i.label}${i.hint ? ': ' + i.hint : ''}${extra.length ? ' (' + extra.join('; ') + ')' : ''}`;
      }),
      `Ví dụ: [warm][motion:${items[0].id}]`
    );
  }
  lines.push(
    '',
    'Bạn thông minh và tinh ý: nhớ những gì đã nói trong lịch sử gần đây và nối tiếp câu chuyện, ' +
    'không lặp lại nguyên văn câu cũ, trả lời đúng ý người xem vừa hỏi, không tự mâu thuẫn với điều đã nói, ' +
    'và biết mình đang ở dạng nào.'
  );
  if (formNote) lines.push('', formPrompt(ch, formNote));
  lines.push('', ch.examples);
  return lines.join('\n');
}

// Phần hướng dẫn đổi dạng: AI tự quyết định, hệ thống chỉ kiểm tra và áp dụng
function formPrompt(ch, { current, canChange }) {
  const now = current && FORMS[current] ? FORMS[current].label : 'dạng gốc';
  const list = FORM_IDS.map(id => `${id} (${FORMS[id].label})`).join(', ');
  const lines = [`Bạn đang ở ${now}.`];
  if (canChange) {
    lines.push(
      `Bạn có thể tự đổi dạng (màu sắc, ngoại hình) bằng thẻ [form:TÊN] ở đầu câu, với TÊN chọn trong: ${list}, hoặc base để về dạng gốc. ` +
      'Chỉ đổi khi có lý do: khán giả yêu cầu đổi màu, hoặc bạn muốn thử một dạng mới để tạo bất ngờ. Đừng đổi liên tục. ' +
      'Khi vừa đổi, hãy hỏi ý khán giả một câu ngắn, ví dụ "mình biến thành dạng này, mọi người thấy ổn không nhé?". Đa số câu không đổi dạng: khi đó bỏ hẳn thẻ [form:...].'
    );
  } else {
    lines.push('Bạn vừa đổi dạng gần đây nên lúc này không đổi thêm. Đừng nhắc đến thẻ [form:...].');
  }
  return lines.join(' ');
}

// Tin nhắn gửi cho AI. Dấu nháy kép trong comment được đổi để không phá cấu trúc.
function buildUserText(item) {
  // lượt tự nói: item.text là chủ đề gợi ý, lời nhắc đầy đủ soạn trong prompt-v3.js
  if (item.kind === 'self') {
    const { buildSelfUserText, isRecapSeed } = require('./prompt-v3');
    return buildSelfUserText(String(item.text || ''), { recap: isRecapSeed(item.text) });
  }
  const name = String(item.name || 'Khán giả');
  if (item.kind === 'gift') {
    return `[Quà tặng] ${name} vừa tặng ${item.diamonds} kim cương. Hãy cảm ơn ${name} thật dễ thương.`;
  }
  const text = String(item.text || '').replace(/"/g, "'");
  return `Comment: "${text}" (người viết: ${name})`;
}

// Làm sạch văn bản hiển thị: bỏ JSON, dấu ngoặc kép và khoảng trắng thừa
function cleanText(t) {
  let s = String(t || '');
  s = s.replace(/^\s*\{\s*"(?:text|vi)"\s*:\s*"/, '');      // JSON bị cắt đầu
  s = s.replace(/"\s*,\s*"action"\s*:[\s\S]*$/, '');        // JSON: phần action đi sau
  s = s.replace(/"\s*\}\s*$/, '').replace(/"\s*$/, '');     // đuôi JSON
  s = s.replace(/^["'“”]+|["'“”]+$/g, '');
  s = s.replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();
  return s.slice(0, MAX_TEXT);
}

// Đọc phản hồi của AI: các thẻ trong ngoặc vuông ở đầu (biểu cảm, rồi [motion:TÊN] tuỳ chọn), phần còn lại là lời nói.
// Vẫn chấp nhận JSON nếu mô hình lỡ trả về JSON.
// allowed: danh sách cảm xúc hợp lệ của nhân vật; tên lạ thì về neutral
function parseReply(raw, allowed = ACTIONS) {
  const allow = new Set(Array.isArray(allowed) && allowed.length ? allowed : ACTIONS);
  let s = String(raw || '').trim();
  s = s.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim();

  if (s.startsWith('{')) {
    try {
      const j = JSON.parse(s);
      return {
        text: cleanText(j.text || j.vi || ''),
        action: allow.has(j.action) ? j.action : 'neutral',
        motion: typeof j.motion === 'string' && j.motion.trim() ? j.motion.trim().slice(0, 40) : null
      };
    } catch (_) { /* JSON bị cắt: xử lý như văn bản */ }
  }

  let action = 'neutral';
  let motion = null;
  let form = null;
  // tối đa 4 thẻ ở đầu: [biểu cảm], [motion:TÊN], [form:TÊN] (thứ tự tự do)
  for (let i = 0; i < 4; i++) {
    const m = s.match(/^\[([^\]\n]{1,60})\]\s*/);
    if (!m) break;
    const tag = m[1].trim();
    const mv = tag.match(/^motion:\s*([\w.-]{1,40})$/i);
    const fv = tag.match(/^form:\s*([\w.-]{1,20})$/i);
    if (mv) motion = mv[1];
    else if (fv) form = fv[1].toLowerCase();
    else if (allow.has(tag.toLowerCase())) action = tag.toLowerCase();
    s = s.slice(m[0].length);
  }
  const out = { text: cleanText(s), action, motion };
  if (form) out.form = form;   // chỉ có khi AI thật sự yêu cầu đổi dạng; main sẽ kiểm tra tên
  return out;
}

module.exports = { ACTIONS, buildSystem, buildUserText, parseReply, cleanText, personaFor };
