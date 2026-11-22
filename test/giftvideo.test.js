'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanRule, cleanRules, findVideoRule, normGift } = require('../src/giftvideo');

test('normGift: không phân biệt hoa thường, gọn khoảng trắng', () => {
  assert.equal(normGift('  Finger   Heart '), 'finger heart');
  assert.equal(normGift(undefined), '');
});

test('cleanRule: bỏ dòng thiếu quà hoặc file, tạo id khi thiếu', () => {
  assert.equal(cleanRule({ gift: '', path: 'a.mp4' }), null);
  assert.equal(cleanRule({ gift: 'Rose', path: '   ' }), null);
  assert.equal(cleanRule(null), null);
  const r = cleanRule({ gift: '  Rose  ', path: 'C:/v/rose.mp4' });
  assert.equal(r.gift, 'Rose');
  assert.match(r.id, /^[a-z0-9]{4,40}$/);
});

test('cleanRule: giữ id hợp lệ, thay id lạ', () => {
  assert.equal(cleanRule({ id: 'abc123', gift: 'Rose', path: 'x.mp4' }).id, 'abc123');
  assert.notEqual(cleanRule({ id: '../../etc', gift: 'Rose', path: 'x.mp4' }).id, '../../etc');
});

test('cleanRules: bỏ id trùng, bỏ dòng hỏng, không phải mảng thì rỗng', () => {
  const out = cleanRules([
    { id: 'aaaa', gift: 'Rose', path: 'a.mp4' },
    { id: 'aaaa', gift: 'Doughnut', path: 'b.mp4' },
    { gift: 'Lỗi' },
    { id: 'bbbb', gift: 'Perfume', path: 'c.mp4' }
  ]);
  assert.deepEqual(out.map(r => r.id), ['aaaa', 'bbbb']);
  assert.deepEqual(cleanRules('không phải mảng'), []);
});

test('findVideoRule: khớp đúng tên trước, rồi mới tới dòng "*"', () => {
  const rules = [
    { id: 'r1', gift: 'Rose', path: 'rose.mp4' },
    { id: 'r2', gift: '*', path: 'mac-dinh.mp4' }
  ];
  assert.equal(findVideoRule(rules, 'rose').id, 'r1');
  assert.equal(findVideoRule(rules, '  ROSE ').id, 'r1');
  assert.equal(findVideoRule(rules, 'Lion').id, 'r2');
  assert.equal(findVideoRule(rules, '').id, 'r2');
});

test('findVideoRule: không có dòng nào khớp thì trả về null', () => {
  assert.equal(findVideoRule([{ id: 'r1', gift: 'Rose', path: 'rose.mp4' }], 'Lion'), null);
  assert.equal(findVideoRule(undefined, 'Rose'), null);
});
