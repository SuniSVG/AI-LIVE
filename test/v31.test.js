'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCooldown } = require('../src/cooldown');
const { createBatcher } = require('../src/batcher');
const { screen, isRepetitive, similarity, isSafe } = require('../src/moderation');
const { extractFacts, heuristicFacts, sanitizeFact } = require('../src/facts');
const { createAutonomy, SEEDS } = require('../src/autonomy');
const { sanitize, DEFAULTS } = require('../src/settings');

test('cooldown: một lần trong mỗi cửa sổ, theo từng khoá', () => {
  const cd = createCooldown({ ms: 1000 });
  assert.equal(cd.tryAcquire('a', 0), true);
  assert.equal(cd.tryAcquire('a', 500), false);
  assert.equal(cd.tryAcquire('b', 500), true);
  assert.equal(cd.canAcquire('a', 1000), true);
  assert.equal(cd.canAcquire('a', 999), false);
});

test('batcher: gửi khi đủ số mục, hoặc khi hết thời gian chờ', () => {
  const sent = [];
  let pending = null;
  const schedule = (cb) => { pending = cb; return () => { pending = null; }; };
  const b = createBatcher({ maxWaitMs: 100, maxItems: 3, flush: items => sent.push(items), schedule });
  b.push(1); b.push(2);
  assert.deepEqual(sent, []);
  pending();
  assert.deepEqual(sent, [[1, 2]]);
  b.push(3); b.push(4); b.push(5);
  assert.deepEqual(sent, [[1, 2], [3, 4, 5]]);
  b.push(6); b.close();
  assert.deepEqual(sent[2], [6]);
});

test('moderation: chặn nội dung cấm, làm sạch link và số điện thoại', () => {
  assert.equal(isSafe('chào bạn nha'), true);
  assert.equal(isSafe('mình muốn tự tử'), false);
  const bad = screen('mình muốn tự tử', () => 0);
  assert.equal(bad.ok, false);
  assert.ok(bad.text.length > 0);
  const clean = screen('xem tại https://example.com nha, gọi 0912345678 đi');
  assert.equal(clean.ok, true);
  assert.ok(!clean.text.includes('http') && !clean.text.includes('0912345678'));
});

test('moderation: nhận diện lượt tự nói lặp lại', () => {
  assert.ok(similarity('đố vui cho mọi người đoán nè', 'đố vui cho mọi người đoán nha') > 0.6);
  assert.equal(isRepetitive('hôm nay trời đẹp quá', ['đố bạn món mình đang nghĩ']), false);
  assert.equal(isRepetitive('hôm nay trời đẹp quá', ['hôm nay trời đẹp quá nha']), true);
});

test('facts: tách thẻ [fact:] khỏi lời nói và lọc thông tin nhạy cảm', () => {
  const r = extractFacts('[warm]\nChúc bạn học tốt nha! [fact:đang học y khoa] [fact:bị bệnh tiểu đường]');
  assert.deepEqual(r.facts, ['đang học y khoa']);
  assert.ok(!r.clean.includes('[fact'));
  assert.equal(sanitizeFact('theo đạo Phật'), null);
  assert.equal(sanitizeFact('số điện thoại 0912345678'), null);
});

test('facts: tự nhận mẫu tự giới thiệu trong comment', () => {
  assert.deepEqual(heuristicFacts('mình đang học Kinh tế nè'), ['đang học Kinh tế']);
  assert.deepEqual(heuristicFacts('em tên là Lan, em rất thích mèo.'), ['tên là Lan', 'thích mèo']);
  assert.deepEqual(heuristicFacts('chào kurumi'), []);
});

test('autonomy: không lặp cùng chủ đề trong thời gian chờ chủ đề, và setConfig đổi được ngưỡng', () => {
  let t = 0;
  const a = createAutonomy({ now: () => t, rand: () => 0, config: { idleSec: 0, minGapSec: 0, recapEveryMin: 0, topicCooldownMin: 30 } });
  const idle = { queueLength: 0, busy: false, videoHeld: false, paused: false, aiEnabled: true };
  const seen = new Set();
  for (let i = 0; i < SEEDS.length; i++) { seen.add(a.evaluate(idle).seed); a.markSpoken('idle'); }
  assert.equal(seen.size, SEEDS.length);
  a.setConfig({ idleSec: 300 });
  assert.equal(a.config().idleSec, 300);
  assert.equal(a.evaluate(idle), null);
});

test('settings: có khoá v3.1 với giá trị mặc định và được kẹp trong khoảng', () => {
  assert.equal(DEFAULTS.selfTalkEnabled, true);
  assert.equal(DEFAULTS.factMemory, true);
  const s = sanitize({ selfIdleSec: 1, selfMaxPerHour: 9999, selfTalkEnabled: 'x' });
  assert.equal(s.selfIdleSec, 10);
  assert.equal(s.selfMaxPerHour, 200);
  assert.equal(s.selfTalkEnabled, true);
});
