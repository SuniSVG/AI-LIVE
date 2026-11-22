'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { instantFor, deferFor, norm } = require('../src/instant');
const { getCharacter } = require('../src/characters');

// Luật giả để kiểm thử cơ chế chung (DeepSeek-chan hiện không có luật tức thì)
const rules = {
  instant: [{ words: ['me'], text: 'Chào {name}, cảm ơn bạn đã tới nha!', action: 'warm' }],
  defer: { words: ['bí mật'], text: 'Chuyện này để sau nha {name}', action: 'think' }
};
const deepseek = getCharacter('deepseek').rules;

test('chuẩn hoá: bỏ dấu câu, chữ hoa, khoảng trắng', () => {
  assert.equal(norm('  ME!!  '), 'me');
  assert.equal(norm('Bí   Mật?'), 'bí mật');
});

test('luật tức thì: chào ngay, có tên người xem', () => {
  const r = instantFor({ kind: 'chat', uid: 'u1', name: 'Minh', text: 'me' }, rules, {}, 1000);
  assert.equal(r.kind, 'reply');
  assert.equal(r.text, 'Chào Minh, cảm ơn bạn đã tới nha!');
});

test('cùng một người gửi liên tiếp: lần sau bỏ qua trong 2 phút, không gọi AI', () => {
  const st = {};
  const item = { kind: 'chat', uid: 'u1', name: 'Minh', text: 'me' };
  assert.equal(instantFor(item, rules, st, 1000).kind, 'reply');
  assert.equal(instantFor(item, rules, st, 5000).kind, 'skip');
  assert.equal(instantFor(item, rules, st, 1000 + 120001).kind, 'reply');
});

test('comment khác không khớp luật; quà không bao giờ khớp', () => {
  assert.equal(instantFor({ kind: 'chat', uid: 'u', name: 'A', text: 'me nè bạn ơi' }, rules, {}), null);
  assert.equal(instantFor({ kind: 'gift', uid: 'u', name: 'A', diamonds: 5 }, rules, {}), null);
});

test('DeepSeek-chan không có luật tức thì và không có luật defer', () => {
  assert.equal(instantFor({ kind: 'chat', uid: 'u', name: 'A', text: 'me' }, deepseek, {}), null);
  assert.equal(deferFor({ kind: 'chat', name: 'Lan', text: 'bí mật nhé' }, deepseek), null);
});

test('luật defer: câu khớp từ khoá được đáp ngay, câu không khớp đi tiếp', () => {
  const r = deferFor({ kind: 'chat', name: 'Lan', text: 'cho mình bí mật đi' }, rules);
  assert.equal(r.text, 'Chuyện này để sau nha Lan');
  assert.equal(deferFor({ kind: 'chat', name: 'Lan', text: 'hôm nay trời đẹp' }, rules), null);
});
