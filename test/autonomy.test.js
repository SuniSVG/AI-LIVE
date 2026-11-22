'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAutonomy, SEEDS, RECAP_SEED } = require('../src/autonomy');

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: ms => { t += ms; } };
}

const idle = { queueLength: 0, busy: false, videoHeld: false, paused: false, aiEnabled: true };

test('không tự nói khi còn comment chờ, đang bận, có video hoặc bị tạm dừng', () => {
  const c = clock();
  const a = createAutonomy({ now: c.now, config: { idleSec: 10, recapEveryMin: 0 } });
  c.advance(60_000);
  assert.ok(a.evaluate(idle));
  assert.equal(a.evaluate({ ...idle, queueLength: 1 }), null);
  assert.equal(a.evaluate({ ...idle, busy: true }), null);
  assert.equal(a.evaluate({ ...idle, videoHeld: true }), null);
  assert.equal(a.evaluate({ ...idle, paused: true }), null);
  assert.equal(a.evaluate({ ...idle, aiEnabled: false }), null);
});

test('phải im lặng đủ idleSec thì mới tự nói, và comment mới làm lại đồng hồ', () => {
  const c = clock();
  const a = createAutonomy({ now: c.now, config: { idleSec: 45, recapEveryMin: 0 } });
  assert.equal(a.evaluate(idle), null);
  c.advance(30_000);
  a.noteActivity();
  c.advance(30_000);
  assert.equal(a.evaluate(idle), null);
  c.advance(20_000);
  assert.equal(a.evaluate(idle).kind, 'self');
});

test('giữa hai lần tự nói phải cách đủ minGapSec', () => {
  const c = clock();
  const a = createAutonomy({ now: c.now, config: { idleSec: 5, minGapSec: 60, recapEveryMin: 0 } });
  c.advance(10_000);
  assert.ok(a.evaluate(idle));
  a.markSpoken('idle');
  c.advance(30_000);
  assert.equal(a.evaluate(idle), null);
  c.advance(31_000);
  assert.ok(a.evaluate(idle));
});

test('giới hạn số lần tự nói trong một giờ', () => {
  const c = clock();
  const a = createAutonomy({ now: c.now, config: { idleSec: 1, minGapSec: 1, maxPerHour: 2, recapEveryMin: 0 } });
  for (let i = 0; i < 2; i++) {
    c.advance(5_000);
    assert.ok(a.evaluate(idle));
    a.markSpoken('idle');
  }
  c.advance(5_000);
  assert.equal(a.evaluate(idle), null);
  c.advance(60 * 60 * 1000);
  assert.ok(a.evaluate(idle));
});

test('chủ đề không lặp lại liên tiếp', () => {
  const c = clock();
  const a = createAutonomy({ now: c.now, rand: () => 0, config: { idleSec: 0, minGapSec: 0, recapEveryMin: 0 } });
  const first = a.evaluate(idle).seed;
  const second = a.evaluate(idle).seed;
  assert.notEqual(first, second);
  assert.ok(SEEDS.includes(first) && SEEDS.includes(second));
});

test('đến hạn recap thì ưu tiên tóm tắt live', () => {
  const c = clock();
  const a = createAutonomy({ now: c.now, config: { idleSec: 0, minGapSec: 0, recapEveryMin: 15 } });
  assert.notEqual(a.evaluate(idle).seed, RECAP_SEED);
  c.advance(15 * 60 * 1000);
  const r = a.evaluate(idle);
  assert.equal(r.reason, 'recap');
  assert.equal(r.seed, RECAP_SEED);
  a.markSpoken('recap');
  assert.notEqual(a.evaluate(idle).reason, 'recap');
});

test('khi vắng (quiet): tự nói sớm hơn và khoảng cách ngắn hơn', () => {
  const c = clock();
  const a = createAutonomy({ now: c.now, rand: () => 0, config: { idleSec: 45, quietIdleSec: 15, minGapSec: 60, quietMinGapSec: 25, recapEveryMin: 0 } });
  c.advance(20_000);
  assert.equal(a.evaluate(idle), null);
  assert.ok(a.evaluate({ ...idle, quiet: true }));
  a.markSpoken('idle');
  c.advance(20_000);
  assert.equal(a.evaluate({ ...idle, quiet: true }), null);
  c.advance(10_000);
  assert.ok(a.evaluate({ ...idle, quiet: true }));
});
