'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { motionCatalog, motionForEmotion, groupOf } = require('../src/motions');
const { buildSystem } = require('../src/persona');
const { sanitize } = require('../src/settings');

const dir = path.join(__dirname, '..', 'renderer', 'models', 'deepseek');
const tuning = JSON.parse(fs.readFileSync(path.join(dir, 'tuning.json'), 'utf8'));
const available = fs.readdirSync(path.join(dir, 'motions'))
  .filter(f => f.endsWith('.motion3.json')).map(f => f.replace('.motion3.json', ''))
  .filter(g => g.toLowerCase() !== 'idle');

test('danh mục: chỉ giữ motion có thật, có nhãn, cảm xúc hợp và cờ vừa dùng', () => {
  const list = motionCatalog({ motionInfo: { ghost: { label: 'ma' }, show: { label: 'khoe', hint: 'h' } }, emotionMotion: { happy: ['show'], sad: ['show'] } }, ['show', 'raise_hand'], 'show');
  assert.deepEqual(list.map(m => m.id), ['show', 'raise_hand']);
  assert.equal(list[0].label, 'khoe');
  assert.deepEqual(list[0].emotions.sort(), ['happy', 'sad']);
  assert.equal(list[0].recent, true);
  assert.equal(list[1].recent, false);
});

test('motionForEmotion: chỉ chọn motion hợp cảm xúc, tránh lặp motion vừa chạy', () => {
  const t = { emotionMotion: { happy: ['a', 'b'], sad: ['zz'] } };
  assert.equal(motionForEmotion('sad', t, ['a', 'b']), null);
  assert.equal(motionForEmotion('happy', t, ['a', 'b'], 'a', () => 0), 'b');
  assert.equal(motionForEmotion('happy', t, ['a'], 'a', () => 0), 'a');
});

test('prompt: mô tả từng motion và giữ dạng [motion:TÊN]', () => {
  const sys = buildSystem(sanitize({ character: 'deepseek' }), motionCatalog(tuning, available, 'show'));
  assert.match(sys, /\[motion:TÊN\]/);
  assert.match(sys, /- \[motion:raise_hand\] giơ tay/);
  assert.match(sys, /vừa dùng gần đây, tránh lặp lại/);
});

test('tuning.json khớp với thư mục motion và danh sách cảm xúc', () => {
  for (const id of Object.keys(tuning.motionInfo)) assert.ok(available.includes(id), `motionInfo: ${id} không có file`);
  const emos = Object.keys(tuning.expressions);
  for (const [e, list] of Object.entries(tuning.emotionMotion)) {
    assert.ok(emos.includes(e), `emotionMotion: cảm xúc lạ ${e}`);
    for (const m of list) assert.ok(available.includes(m), `emotionMotion: ${e} -> ${m} không có file`);
  }
  for (const g of available) assert.ok(tuning.motionInfo[g], `thiếu nhãn cho motion ${g}`);
  assert.equal(groupOf('IDLE.motion3.json'), 'idle');
});
