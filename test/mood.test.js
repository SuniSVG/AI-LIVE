'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMood } = require('../src/mood');

test('quà làm tâm trạng vui lên, và giá trị luôn nằm trong khoảng hợp lệ', () => {
  let t = 0;
  const m = createMood({ now: () => t, energy: 0.5, valence: 0 });
  m.onGift(2000);
  m.onGift(5000);
  const s = m.snapshot();
  assert.ok(s.valence > 0.5 && s.valence <= 1);
  assert.ok(s.energy >= 0 && s.energy <= 1);
});

test('im lặng lâu thì trôi về trung tính', () => {
  let t = 0;
  const m = createMood({ now: () => t, halfLifeMs: 1000, energy: 0.9, valence: 0.8 });
  t += 10_000;
  const s = m.snapshot();
  assert.ok(Math.abs(s.valence) < 0.01);
  assert.ok(Math.abs(s.energy - 0.5) < 0.01);
});

test('describe trả về câu tiếng Việt phản ánh trạng thái', () => {
  let t = 0;
  const m = createMood({ now: () => t, energy: 0.5, valence: -0.6 });
  assert.match(m.describe(), /Tâm trạng hiện tại: buồn/);
});
