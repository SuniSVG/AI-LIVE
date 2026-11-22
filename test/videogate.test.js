'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVideoQueue } = require('../src/videoqueue');
const { createEngine } = require('../src/engine');
const { sanitize, DEFAULTS } = require('../src/settings');

const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));
const item = (gift, name = 'An') => ({ rule: 'r1', gift, name, diamonds: 10 });

test('video chỉ phát sau khi beforeStart xong (câu đang nói nói hết trước)', async () => {
  const sent = [];
  let release;
  const gate = new Promise(r => { release = r; });
  const q = createVideoQueue({
    send: (ch, p) => { sent.push({ ch, p }); return true; },
    beforeStart: () => gate,
    onChange: () => {}
  });
  q.enqueue(item('Rose'));
  await tick();
  assert.equal(sent.length, 0, 'chưa được phát khi còn chờ');
  release();
  await tick();
  assert.equal(sent.filter(s => s.ch === 'stage:videoPlay').length, 1);
});

test('trong lúc chờ, video khác xếp vào hàng và phát đúng thứ tự, không phát chồng', async () => {
  const sent = [];
  const gates = [];
  const q = createVideoQueue({
    send: (ch, p) => { sent.push({ ch, p }); return true; },
    beforeStart: () => new Promise(r => gates.push(r)),
    onChange: () => {}
  });
  q.enqueue(item('Rose', 'A'));
  q.enqueue(item('Doughnut', 'B'));
  await tick();
  assert.equal(gates.length, 1, 'chỉ một cổng chờ tại một thời điểm');
  gates[0]();
  await tick();
  const plays = sent.filter(s => s.ch === 'stage:videoPlay').map(s => s.p.gift);
  assert.deepEqual(plays, ['Rose']);
  q.done(sent.find(s => s.ch === 'stage:videoPlay').p.id);
  await tick();
  assert.equal(gates.length, 2);
  gates[1]();
  await tick();
  assert.deepEqual(sent.filter(s => s.ch === 'stage:videoPlay').map(s => s.p.gift), ['Rose', 'Doughnut']);
});

test('onBusy: bận từ lúc có video xếp hàng đến khi hết cả đợt, rồi rảnh', async () => {
  const states = [];
  let ids = [];
  const q = createVideoQueue({
    send: (ch, p) => { if (ch === 'stage:videoPlay') ids.push(p.id); return true; },
    onBusy: on => states.push(on),
    onChange: () => {}
  });
  q.enqueue(item('Rose'));
  q.enqueue(item('Doughnut'));
  assert.deepEqual(states, [true]);
  q.done(ids[0]);
  q.done(ids[1]);
  assert.deepEqual(states, [true, false]);
});

test('engine: giữ hàng chờ vì video thì không gọi AI; nhả ra thì tiếp tục', async () => {
  const asked = [];
  let settings = sanitize({ minIntervalSec: 0, cooldownUserSec: 0 }, DEFAULTS);
  const engine = createEngine({
    getSettings: () => settings,
    ask: async it => { asked.push(it); return { text: 'ok', action: 'neutral' }; },
    say: async () => {}
  });
  engine.setVideoHold(true);
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'DeepSeek ơi' });
  await tick(40);
  assert.equal(asked.length, 0);
  assert.equal(engine.snapshot().videoHeld, true);
  engine.setVideoHold(false);
  await tick(40);
  assert.equal(asked.length, 1);
  engine.stop();
});
