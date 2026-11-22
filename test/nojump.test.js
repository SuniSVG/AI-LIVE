'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { noVideoGiftReply } = require('../src/quick');
const { hasLinkedVideo } = require('../src/giftvideo');

test('quà không có video: cảm ơn và nói sắp nhảy được, vài hôm nữa nhảy cho xem', () => {
  for (let i = 0; i < 3; i++) {
    const r = noVideoGiftReply({ name: 'Lan', kind: 'gift', diamonds: 50 }, {}, () => i / 3);
    assert.match(r.text, /Lan/);
    assert.match(r.text, /cảm ơn/i);
    assert.match(r.text, /sắp/i);
    assert.match(r.text, /vài hôm nữa/);
    assert.match(r.text, /nhảy/);
  }
});

test('quà không lặp lại cùng một mẫu liên tiếp', () => {
  const state = {};
  const a = noVideoGiftReply({ name: 'A' }, state, () => 0).text;
  const b = noVideoGiftReply({ name: 'A' }, state, () => 0).text;
  assert.notEqual(a, b);
});

test('hasLinkedVideo: cần bật video, có luật khớp hoặc luật "mọi quà khác"', () => {
  const rules = [{ id: 'r1', gift: 'Rose', path: 'a.mp4' }];
  assert.equal(hasLinkedVideo(rules, 'Rose', true), true);
  assert.equal(hasLinkedVideo(rules, 'Rose', false), false);
  assert.equal(hasLinkedVideo(rules, 'Doughnut', true), false);
  assert.equal(hasLinkedVideo([{ id: 'r2', gift: '*', path: 'b.mp4' }], 'Doughnut', true), true);
  assert.equal(hasLinkedVideo([], 'Rose', true), false);
});
