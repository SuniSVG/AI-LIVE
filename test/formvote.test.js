'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, createFormTrial } = require('../src/formvote');

test('classify: phản đối, tán thành, trung tính', () => {
  assert.equal(classify('không đẹp'), 'neg');
  assert.equal(classify('không được'), 'neg');   // phản đối được ưu tiên
  assert.equal(classify('đẹp quá trời'), 'pos');
  assert.equal(classify('hát một bài đi'), null);
});

test('phản đối đủ ngưỡng và nhiều hơn tán thành thì đổi về', () => {
  const t = createFormTrial({ form: 'kurumi3', now: 0, threshold: 3, windowMs: 60000 });
  assert.equal(t.vote('a', 'không thích', 1000).revert, false);
  assert.equal(t.vote('b', 'dở quá', 2000).revert, false);
  const v = t.vote('c', 'không', 3000);
  assert.equal(v.revert, true);
  assert.equal(v.neg, 3);
});

test('một người spam nhiều lần chỉ tính một phiếu', () => {
  const t = createFormTrial({ form: 'kurumi3', now: 0, threshold: 3, windowMs: 60000 });
  for (let i = 0; i < 10; i++) t.vote('spammer', 'không không không', i * 100);
  assert.equal(t.snapshot(1000).neg, 1);
  assert.equal(t.vote('spammer', 'không', 2000).revert, false);
});

test('số phản đối đủ nhưng tán thành nhiều hơn thì giữ dạng mới', () => {
  const t = createFormTrial({ form: 'kurumi3', now: 0, threshold: 2, windowMs: 60000 });
  t.vote('a', 'không', 100);
  t.vote('b', 'đẹp quá', 200);
  t.vote('c', 'thích ghê', 300);
  assert.equal(t.vote('d', 'không', 400).revert, false);   // neg 2, pos 2: chưa đủ "nhiều hơn"
});

test('hết thời gian thử thì kết thúc, không đổi về nữa', () => {
  const t = createFormTrial({ form: 'kurumi3', now: 0, threshold: 2, windowMs: 1000 });
  const v = t.vote('a', 'không', 5000);
  assert.equal(v.done, true);
  assert.equal(v.revert, false);
  assert.equal(t.vote('b', 'không', 5100).revert, false);
});
