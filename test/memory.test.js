'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemory, tokens } = require('../src/memory');

function setup() {
  let t = 1000;
  return { mem: createMemory({ now: () => t }), tick: ms => { t += ms; } };
}

test('tokens: tách từ tiếng Việt có dấu, bỏ ký tự thừa', () => {
  const s = tokens('Mình thích MÈO, còn bạn?');
  assert.ok(s.has('thích') && s.has('mèo') && s.has('còn'));
  assert.ok(!s.has('?'));
});

test('nhớ hồ sơ khán giả: đếm chat, quà và sự thật (không trùng)', () => {
  const { mem } = setup();
  const who = { uid: 'u1', name: 'Lan' };
  mem.addEpisode({ kind: 'chat', who, text: 'hôm nay mình đi học y', reply: 'Chúc bạn học tốt!' });
  mem.addEpisode({ kind: 'gift', who, diamonds: 50 });
  assert.equal(mem.rememberFact(who, 'đang học y khoa'), true);
  assert.equal(mem.rememberFact(who, 'ĐANG HỌC Y KHOA'), false);
  const v = mem.viewer(who);
  assert.equal(v.chats, 1);
  assert.equal(v.gifts, 1);
  assert.equal(v.giftDiamonds, 50);
  assert.deepEqual(v.facts.map(f => f.text), ['đang học y khoa']);
});

test('truy hồi: ưu tiên lượt trùng từ khoá của người khác, và lượt gần nhất của chính người đó', () => {
  const { mem, tick } = setup();
  const lan = { uid: 'u1', name: 'Lan' };
  const minh = { uid: 'u2', name: 'Minh' };
  mem.addEpisode({ kind: 'chat', who: minh, text: 'mình nuôi con mèo tên Mít' });
  tick(1000);
  mem.addEpisode({ kind: 'chat', who: lan, text: 'hôm nay trời đẹp' });
  tick(1000);
  mem.addEpisode({ kind: 'chat', who: lan, text: 'bạn có thích mèo không' });
  const r = mem.recall({ who: lan, query: 'mèo của bạn tên gì' });
  assert.equal(r.recent.length, 2);
  assert.ok(r.related.some(e => e.name === 'Minh' && e.text.includes('mèo')));
  assert.ok(r.related.every(e => e.uid !== 'u1'));
});

test('nhật ký giới hạn số lượt, hồ sơ khán giả vẫn giữ nguyên', () => {
  const { mem } = setup();
  const who = { uid: 'u9', name: 'An' };
  mem.rememberFact(who, 'thích trà sữa');
  for (let i = 0; i < 400; i++) mem.addEpisode({ kind: 'chat', who, text: 'dòng ' + i });
  assert.equal(mem.stats().episodes, 300);
  assert.equal(mem.viewer(who).facts.length, 1);
});

test('dump/load khôi phục đầy đủ, dữ liệu hỏng không làm sập', () => {
  const { mem } = setup();
  const who = { uid: 'u3', name: 'Hoa' };
  mem.addEpisode({ kind: 'chat', who, text: 'chào Kurumi', reply: 'chào bạn!' });
  mem.rememberFact(who, 'sinh nhật tháng 5');
  const data = JSON.parse(JSON.stringify(mem.dump()));

  const fresh = createMemory({ now: () => 5000 });
  fresh.load(data);
  assert.equal(fresh.recall({ who, query: 'chào' }).recent.length, 1);
  assert.deepEqual(fresh.viewer(who).facts.map(f => f.text), ['sinh nhật tháng 5']);

  const broken = createMemory();
  broken.load({ episodes: [null, 42, { text: 'ok' }], viewers: [null, { key: 'x' }] });
  assert.equal(broken.stats().episodes, 1);
  assert.equal(broken.stats().viewers, 1);
  broken.load(null);
  assert.equal(broken.stats().episodes, 0);
});
