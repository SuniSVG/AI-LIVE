'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { emotionCatalog } = require('../src/emotions');
const { parseReply, buildSystem } = require('../src/persona');
const { sanitize } = require('../src/settings');

test('danh mục cảm xúc: theo emotionInfo trước, bỏ id không có biểu cảm hoặc tên lạ', () => {
  const list = emotionCatalog({
    expressions: { warm: ['blush'], happy: ['bunny_teeth'], Bad: ['x'], empty: [] },
    emotionInfo: { happy: { label: 'hào hứng' }, warm: { label: 'vui vẻ', hint: 'chào hỏi' }, ghost: { label: 'ma' } }
  });
  assert.deepEqual(list.map(e => e.id), ['happy', 'warm']);
  assert.equal(list[0].label, 'hào hứng');
  assert.equal(list[1].hint, 'chào hỏi');
});

test('không có tuning thì danh mục rỗng; id thiếu nhãn dùng chính id', () => {
  assert.deepEqual(emotionCatalog(null), []);
  assert.deepEqual(emotionCatalog({ expressions: { love: ['heart_eyes'] } }), [{ id: 'love', label: 'love', hint: '' }]);
});

test('parseReply: chỉ nhận cảm xúc trong danh sách được truyền vào', () => {
  assert.equal(parseReply('[happy]\nhi', ['happy', 'sad']).action, 'happy');
  assert.equal(parseReply('[happy]\nhi').action, 'neutral');   // mặc định: bảng cũ không có happy
  assert.equal(parseReply('[sad]\nhi', ['happy']).action, 'neutral');
  assert.equal(parseReply('{"text":"ok","action":"love"}', ['love']).action, 'love');
});

test('buildSystem: liệt kê đúng cảm xúc của nhân vật, không truyền thì dùng bảng cũ', () => {
  const s = sanitize({ character: 'deepseek' });
  const sys = buildSystem(s, [], null, [{ id: 'shy', label: 'ngại ngùng', hint: 'bị khen' }]);
  assert.match(sys, /\[shy\]/);
  assert.match(sys, /ngại ngùng/);
  assert.doesNotMatch(sys, /\[zafkiel\]/);
  assert.match(buildSystem(s), /\[zafkiel\]/);
});

test('tuning.json của DeepSeek-chan: mọi cảm xúc có file biểu cảm thật, không lẫn đồ mặc', () => {
  const dir = path.join(__dirname, '..', 'renderer', 'models', 'deepseek');
  const tuning = JSON.parse(fs.readFileSync(path.join(dir, 'tuning.json'), 'utf8'));
  const list = emotionCatalog(tuning);
  assert.ok(list.length >= 10, 'cần đủ cảm xúc để AI chọn');
  // đổi trang phục/kiểu cơ thể thì không phải cảm xúc (riêng body_type_default là trạng thái mặc định)
  const OUTFIT = /toggle|take_off|chest_clothes|body_type_[12]/;
  for (const [id, files] of Object.entries(tuning.expressions)) {
    for (const name of files) {
      assert.ok(fs.existsSync(path.join(dir, 'exp', name + '.exp3.json')), `${id} -> ${name}`);
      assert.doesNotMatch(name, OUTFIT, `${id} -> ${name} là đồ/kiểu cơ thể`);
    }
  }
  for (const e of list) assert.ok(tuning.emotionInfo[e.id], `${e.id} thiếu nhãn`);
});
