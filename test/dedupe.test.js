'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeduper, msgIdOf } = require('../src/dedupe');

test('chống trùng: cùng msgId chỉ tính một lần; id rỗng không bị chặn', () => {
  const d = createDeduper();
  assert.equal(d.seenBefore('m1'), false);
  assert.equal(d.seenBefore('m1'), true);
  assert.equal(d.seenBefore(''), false);
  assert.equal(d.seenBefore(''), false);
});

test('chống trùng: giới hạn bộ nhớ, id cũ nhất bị bỏ trước', () => {
  const d = createDeduper(3);
  for (const id of ['a', 'b', 'c', 'd']) d.seenBefore(id);
  assert.equal(d.size, 3);
  assert.equal(d.seenBefore('a'), false);   // 'a' đã bị đẩy ra nên coi như mới
});

test('lấy msgId từ các vị trí khác nhau của gói tin TikTok', () => {
  assert.equal(msgIdOf({ common: { msgId: '11' } }), '11');
  assert.equal(msgIdOf({ event: { msgId: '22' } }), '22');
  assert.equal(msgIdOf({ msgId: '33' }), '33');
  assert.equal(msgIdOf({}), '');
});
