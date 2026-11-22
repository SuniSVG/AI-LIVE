'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHeartCounter } = require('../src/hearts');

test('cảm ơn khi vượt mốc, không cảm ơn ở mỗi lần thả tim', () => {
  const h = createHeartCounter({ step: 100, minGapMs: 0 });
  assert.equal(h.add(50, 0).thank, false);
  assert.equal(h.add(50, 0).thank, true);     // vượt 100
  assert.equal(h.add(10, 0).thank, false);    // chưa tới 200
  assert.equal(h.total, 110);
});

test('không cảm ơn dày hơn khoảng cách tối thiểu, nhưng vẫn đếm đủ', () => {
  const h = createHeartCounter({ step: 10, minGapMs: 60000 });
  assert.equal(h.add(10, 0).thank, true);
  assert.equal(h.add(10, 30000).thank, false);  // mốc 20 vượt nhưng quá sớm
  assert.equal(h.total, 20);
  assert.equal(h.add(10, 70000).thank, true);   // mốc 30 vượt, và đã đủ 60s từ lần cảm ơn trước: cảm ơn lại
});

test('bỏ qua số lượng không hợp lệ', () => {
  const h = createHeartCounter({ step: 10, minGapMs: 0 });
  assert.equal(h.add(NaN, 0).thank, false);
  assert.equal(h.add(-5, 0).thank, false);
  assert.equal(h.total, 0);
});
