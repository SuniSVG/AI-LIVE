'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMemoryBlock, buildSelfUserText } = require('../src/prompt-v3');
const { buildUserText, parseReply } = require('../src/persona');
const { RECAP_SEED } = require('../src/autonomy');

test('khối trí nhớ có tên, sự thật và lượt liên quan, không rỗng khi có dữ liệu', () => {
  const block = buildMemoryBlock({
    viewer: { name: 'Lan', chats: 3, gifts: 1, facts: ['đang học y khoa'] },
    recent: [{ kind: 'chat', text: 'hôm nay thi giải phẫu', reply: 'cố lên nha!' }],
    related: []
  }, 'Tâm trạng hiện tại: vui vẻ, thoải mái.');
  assert.match(block, /Lan/);
  assert.match(block, /đang học y khoa/);
  assert.match(block, /thi giải phẫu/);
  assert.equal(buildMemoryBlock({}, ''), '');
});

test('lượt tự nói dùng đúng chủ đề và không cần comment', () => {
  const text = buildUserText({ kind: 'self', text: 'đố vui nhẹ nhàng cho khán giả đoán' });
  assert.match(text, /\[Tự nói\]/);
  assert.match(text, /đố vui/);
  const recap = buildSelfUserText(RECAP_SEED, { recap: true });
  assert.match(recap, /tóm tắt/i);
});

test('định dạng phản hồi cũ vẫn đọc đúng (cảm xúc + lời nói)', () => {
  const r = parseReply('[warm]\nMình nhớ bạn lắm nha!', ['neutral', 'warm']);
  assert.equal(r.action, 'warm');
  assert.equal(r.text, 'Mình nhớ bạn lắm nha!');
});
