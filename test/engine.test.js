'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../src/engine');
const { sanitize, DEFAULTS } = require('../src/settings');

const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));

function setup(over = {}, askImpl) {
  let settings = sanitize({ minIntervalSec: 0, cooldownUserSec: 30, ...over }, DEFAULTS);
  const said = [];
  const asked = [];
  const engine = createEngine({
    getSettings: () => settings,
    ask: askImpl || (async item => { asked.push(item); return { text: 'Chào ' + item.name, action: 'warm' }; }),
    say: p => said.push(p)
  });
  return { engine, said, asked, setSettings: p => { settings = sanitize(p, settings); } };
}

test('chế độ từ khoá: comment không có từ khoá bị bỏ qua', async () => {
  const { engine, said } = setup({ triggerMode: 'keyword' });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'hôm nay trời đẹp' });
  await tick();
  assert.equal(said.length, 0);
  const snap = engine.snapshot();
  assert.equal(snap.feed[0].status, 'skipped');
  assert.equal(snap.feed[0].detail, 'Không chứa từ khoá');
});

test('comment có từ khoá được trả lời và hiển thị', async () => {
  const { engine, said } = setup();
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'DeepSeek ơi chào!' });
  await tick();
  assert.equal(said.length, 1);
  assert.equal(said[0].name, 'An');
  assert.equal(said[0].action, 'warm');
  assert.equal(engine.snapshot().stats.replied, 1);
});

test('chế độ all: mọi comment đều được trả lời', async () => {
  const { engine, said } = setup({ triggerMode: 'all' });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'bình thường' });
  await tick();
  assert.equal(said.length, 1);
});

test('AI tắt thì không nhận comment nào', async () => {
  const { engine, said } = setup({ aiEnabled: false, triggerMode: 'all' });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'DeepSeek' });
  engine.enqueue({ kind: 'gift', uid: 'b', name: 'Bình', diamonds: 500 });
  await tick();
  assert.equal(said.length, 0);
  assert.ok(engine.snapshot().feed.every(f => f.detail === 'AI đang tắt'));
});

test('cooldown theo người: cùng một người không được trả lời liên tiếp', async () => {
  const { engine, said } = setup({ cooldownUserSec: 60 });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'DeepSeek 1' });
  await tick();
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'DeepSeek 2' });
  await tick();
  assert.equal(said.length, 1);
  assert.match(engine.snapshot().feed[0].detail, /thời gian chờ/);
});

test('quà: dưới ngưỡng bị bỏ, đủ ngưỡng được cảm ơn kể cả khi không có từ khoá', async () => {
  const { engine, said } = setup({ giftMinDiamonds: 10 });
  engine.enqueue({ kind: 'gift', uid: 'g1', name: 'Lan', diamonds: 5 });
  engine.enqueue({ kind: 'gift', uid: 'g2', name: 'Hoa', diamonds: 100 });
  await tick();
  assert.equal(said.length, 1);
  assert.equal(said[0].name, 'Hoa');
  assert.equal(said[0].kind, 'gift');
});

test('một người không được xếp hai lần trong hàng đợi', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { engine } = setup({}, async () => { await gate; return { text: 'ok', action: 'neutral' }; });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'DeepSeek 1' });
  engine.enqueue({ kind: 'chat', uid: 'b', name: 'Bình', text: 'DeepSeek 2' });
  engine.enqueue({ kind: 'chat', uid: 'b', name: 'Bình', text: 'DeepSeek 3' });
  const s = engine.snapshot();
  assert.equal(s.queueLength + (s.busy ? 1 : 0), 2);
  assert.ok(s.feed.some(f => f.detail === 'Đã có trong hàng đợi'));
  release();
  await tick(30);
});

test('hàng đợi đầy thì bỏ comment cũ nhất', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { engine } = setup({ maxQueue: 2 }, async () => { await gate; return { text: 'ok', action: 'neutral' }; });
  engine.enqueue({ kind: 'chat', uid: 'x', name: 'X', text: 'DeepSeek x' });   // sẽ đang được xử lý
  await tick(5);
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'A', text: 'DeepSeek a' });
  engine.enqueue({ kind: 'chat', uid: 'b', name: 'B', text: 'DeepSeek b' });
  engine.enqueue({ kind: 'chat', uid: 'c', name: 'C', text: 'DeepSeek c' });
  const names = engine.snapshot().queue.map(q => q.name);
  assert.deepEqual(names, ['B', 'C']);
  release();
  await tick(30);
});

test('tạm dừng thì không trả lời cho tới khi tiếp tục', async () => {
  const { engine, said } = setup();
  engine.togglePause();
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'DeepSeek' });
  await tick();
  assert.equal(said.length, 0);
  assert.equal(engine.snapshot().queueLength, 1);
  engine.togglePause();
  await tick();
  assert.equal(said.length, 1);
});

test('lỗi AI được ghi vào nhật ký và không làm kẹt hàng đợi', async () => {
  let n = 0;
  const { engine, said } = setup({}, async item => {
    if (++n === 1) throw new Error('Gemini HTTP 500');
    return { text: 'ok ' + item.name, action: 'neutral' };
  });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'DeepSeek 1' });
  await tick();
  engine.enqueue({ kind: 'chat', uid: 'b', name: 'Bình', text: 'DeepSeek 2' });
  await tick();
  const snap = engine.snapshot();
  assert.equal(snap.stats.errors, 1);
  assert.equal(snap.feed.find(f => f.status === 'error').detail, 'Gemini HTTP 500');
  assert.equal(said.length, 1);
  assert.equal(said[0].name, 'Bình');
});

test('giãn cách tối thiểu giữa hai câu trả lời được giữ', async () => {
  const sayTimes = [];
  const { engine } = setup({ minIntervalSec: 0.15, pickMode: 'fifo', parallel: 1 }, async () => ({ text: 'ok', action: 'neutral' }));
  const e2 = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all', minIntervalSec: 0.15, pickMode: 'fifo', parallel: 2, cooldownUserSec: 0 }),
    ask: async () => ({ text: 'ok', action: 'neutral' }),
    say: async () => { sayTimes.push(Date.now()); await tick(5); }
  });
  e2.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'DeepSeek 1' });
  e2.enqueue({ kind: 'chat', uid: 'b', name: 'Bình', text: 'DeepSeek 2' });
  await tick(400);
  assert.equal(sayTimes.length, 2);
  assert.ok(sayTimes[1] - sayTimes[0] >= 140, `khoảng cách ${sayTimes[1] - sayTimes[0]}ms`);
  engine.stop(); e2.stop();
});

test('test của người điều khiển (force) bỏ qua từ khoá và cooldown nhưng vẫn cần AI bật', async () => {
  const { engine, said } = setup({ cooldownUserSec: 60 });
  engine.enqueue({ kind: 'chat', uid: 'test:A', name: 'A', text: 'không có từ khoá', force: true });
  await tick();
  engine.enqueue({ kind: 'chat', uid: 'test:A', name: 'A', text: 'lần 2', force: true });
  await tick();
  assert.equal(said.length, 2);
});

test('bảng comment ghi mọi comment kể cả bị bỏ qua, và cập nhật trạng thái', async () => {
  const { engine } = setup({ triggerMode: 'keyword' });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'trời đẹp' });        // bỏ qua
  engine.enqueue({ kind: 'chat', uid: 'b', name: 'Bình', text: 'DeepSeek ơi!' });    // trả lời
  await tick();
  const board = engine.snapshot().board;           // mới nhất trước
  assert.equal(board.length, 2);
  assert.equal(board[0].name, 'Bình');
  assert.equal(board[0].state, 'replied');
  assert.equal(board[1].state, 'skipped');
});

test('bảng comment gọi onBoard cho từng comment mới', () => {
  const seen = [];
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all' }),
    ask: async () => ({ text: 'ok', action: 'neutral' }),
    say: async () => {},
    onBoard: e => seen.push(e.name)
  });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'x' });
  engine.enqueue({ kind: 'gift', uid: 'b', name: 'Bình', diamonds: 1 });
  assert.deepEqual(seen, ['An', 'Bình']);
});

test('chế độ random: bốc đúng comment theo rand()', async () => {
  const asked = [];
  const r = () => 0.99;   // luôn chọn phần tử cuối của hàng đợi
  let release;
  const gate = new Promise(res => { release = res; });
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all', minIntervalSec: 0, pickMode: 'random' }),
    ask: async item => { if (item.name === 'Đầu') await gate; asked.push(item.name); return { text: 'ok', action: 'neutral' }; },
    say: async () => {},
    rand: r
  });
  engine.enqueue({ kind: 'chat', uid: '0', name: 'Đầu', text: 'x' });   // đang được xử lý
  await tick(5);
  engine.enqueue({ kind: 'chat', uid: '1', name: 'A', text: 'x' });
  engine.enqueue({ kind: 'chat', uid: '2', name: 'B', text: 'x' });
  engine.enqueue({ kind: 'chat', uid: '3', name: 'C', text: 'x' });
  release();
  await tick(30);
  assert.deepEqual(asked, ['Đầu', 'C', 'B', 'A']);
  engine.stop();
});

test('chế độ fifo: lấy comment theo thứ tự vào', async () => {
  let release;
  const gate = new Promise(res => { release = res; });
  const asked = [];
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all', minIntervalSec: 0, pickMode: 'fifo' }),
    ask: async item => { if (item.name === 'Đầu') await gate; asked.push(item.name); return { text: 'ok', action: 'neutral' }; },
    say: async () => {}
  });
  engine.enqueue({ kind: 'chat', uid: '0', name: 'Đầu', text: 'x' });
  await tick(5);
  engine.enqueue({ kind: 'chat', uid: '1', name: 'A', text: 'x' });
  engine.enqueue({ kind: 'chat', uid: '2', name: 'B', text: 'x' });
  release();
  await tick(30);
  assert.deepEqual(asked, ['Đầu', 'A', 'B']);
});

test('trả lời ngay một comment cụ thể: bỏ qua giãn cách và đi trước hàng đợi', async () => {
  let release;
  const gate = new Promise(res => { release = res; });
  const asked = [];
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all', minIntervalSec: 60, pickMode: 'fifo', cooldownUserSec: 0 }),
    ask: async item => { if (item.name === 'Đầu') await gate; asked.push(item.name); return { text: 'ok', action: 'neutral' }; },
    say: async () => {}
  });
  engine.enqueue({ kind: 'chat', uid: '0', name: 'Đầu', text: 'x' });
  await tick(5);
  engine.enqueue({ kind: 'chat', uid: '1', name: 'A', text: 'x' });
  engine.enqueue({ kind: 'chat', uid: '2', name: 'B', text: 'x' });
  const bId = engine.snapshot().queue.find(q => q.name === 'B').id;
  assert.equal(engine.pickNow(bId).ok, true);
  release();
  await tick(30);
  assert.equal(asked[1], 'B');
  engine.stop();
});

test('pickNow không có id: bốc ngẫu nhiên; hàng đợi rỗng thì trả về false', async () => {
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all' }),
    ask: async () => ({ text: 'ok', action: 'neutral' }),
    say: async () => {},
    rand: () => 0
  });
  assert.equal(engine.pickNow().ok, false);
  engine.stop();
});

test('say được chờ xong trước khi trả lời tiếp (không nói chồng nhau)', async () => {
  const log = [];
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all', minIntervalSec: 0, pickMode: 'fifo', parallel: 2 }),
    ask: async item => { log.push('ask ' + item.name); return { text: 'ok', action: 'neutral' }; },
    say: async p => { log.push('say-start ' + p.name); await tick(60); log.push('say-end ' + p.name); }
  });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'A', text: 'x' });
  engine.enqueue({ kind: 'chat', uid: 'b', name: 'B', text: 'x' });
  await tick(300);
  // hai câu được gọi AI song song, nhưng đọc lần lượt
  assert.deepEqual(log.filter(x => x.startsWith('ask')).length, 2);
  assert.deepEqual(log.filter(x => x.startsWith('say')), ['say-start A', 'say-end A', 'say-start B', 'say-end B']);
  engine.stop();
});

test('pickNow khi đang tạm dừng: tự tiếp tục và trả lời comment được chọn', async () => {
  const asked = [];
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all', minIntervalSec: 0, pickMode: 'fifo' }),
    ask: async item => { asked.push(item.name); return { text: 'ok', action: 'neutral' }; },
    say: async () => {}
  });
  engine.togglePause();
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'A', text: 'x' });
  engine.enqueue({ kind: 'chat', uid: 'b', name: 'B', text: 'x' });
  const bId = engine.snapshot().queue.find(q => q.name === 'B').id;
  const r = engine.pickNow(bId);
  assert.equal(r.ok, true);
  assert.equal(engine.snapshot().paused, false);
  await tick(30);
  assert.equal(asked[0], 'B');
  engine.stop();
});

test('pickNow khi đã đủ số câu gọi AI cùng lúc: báo chờ có chỗ trống', async () => {
  let release;
  const gate = new Promise(res => { release = res; });
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all', minIntervalSec: 0, parallel: 1 }),
    ask: async item => { if (item.name === 'Đầu') await gate; return { text: 'ok', action: 'neutral' }; },
    say: async () => {}
  });
  engine.enqueue({ kind: 'chat', uid: '0', name: 'Đầu', text: 'x' });
  await tick(5);
  engine.enqueue({ kind: 'chat', uid: '1', name: 'A', text: 'x' });
  const r = engine.pickNow(engine.snapshot().queue[0].id);
  assert.equal(r.ok, true);
  assert.match(r.message, /chỗ trống/);
  release();
  engine.stop();
});

test('snapshot: asking -> speaking -> trống, và pendingPick', async () => {
  let release;
  const gate = new Promise(res => { release = res; });
  let sayGate;
  const sayDone = new Promise(res => { sayGate = res; });
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all', minIntervalSec: 0, parallel: 1 }),
    ask: async item => { if (item.name === 'Đầu') await gate; return { text: 'ok', action: 'neutral' }; },
    say: async () => { await sayDone; }
  });
  engine.enqueue({ kind: 'chat', uid: '0', name: 'Đầu', text: 'x' });
  await tick(5);
  const first = engine.snapshot();
  assert.equal(first.asking.length, 1);
  assert.equal(first.asking[0].name, 'Đầu');
  engine.enqueue({ kind: 'chat', uid: '1', name: 'A', text: 'x' });
  engine.pickNow(engine.snapshot().queue[0].id);
  assert.equal(engine.snapshot().pendingPick.name, 'A');
  release();
  await tick(20);
  const mid = engine.snapshot();
  assert.equal(mid.speaking.name, 'Đầu');
  assert.equal(mid.asking.length, 0);
  sayGate();
  await tick(30);
  const after = engine.snapshot();
  assert.equal(after.speaking, null);
  assert.ok(after.feed.some(f => f.status === 'replied' && f.name === 'A'));
  assert.equal(after.pendingPick, null);
  engine.stop();
});

test('gọi song song: hai comment cùng đang gọi AI trước khi câu đầu tiên xong', async () => {
  const gates = {};
  const started = [];
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all', minIntervalSec: 0, pickMode: 'fifo', parallel: 2 }),
    ask: async item => { started.push(item.name); await new Promise(r => { gates[item.name] = r; }); return { text: 'ok ' + item.name, action: 'neutral' }; },
    say: async () => {}
  });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'A', text: 'x' });
  engine.enqueue({ kind: 'chat', uid: 'b', name: 'B', text: 'x' });
  await tick(5);
  assert.deepEqual(started, ['A', 'B']);
  assert.equal(engine.snapshot().asking.length, 2);
  gates.B(); gates.A();
  await tick(20);
  assert.equal(engine.snapshot().asking.length, 0);
  engine.stop();
});

test('parallel = 1: chỉ một comment được gọi AI tại một thời điểm', async () => {
  const gates = {};
  const started = [];
  const engine = createEngine({
    getSettings: () => sanitize({ triggerMode: 'all', minIntervalSec: 0, pickMode: 'fifo', parallel: 1 }),
    ask: async item => { started.push(item.name); await new Promise(r => { gates[item.name] = r; }); return { text: 'ok', action: 'neutral' }; },
    say: async () => {}
  });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'A', text: 'x' });
  engine.enqueue({ kind: 'chat', uid: 'b', name: 'B', text: 'x' });
  await tick(5);
  assert.deepEqual(started, ['A']);
  gates.A();
  await tick(20);
  assert.deepEqual(started, ['A', 'B']);
  gates.B();
  await tick(10);
  engine.stop();
});

test('keyword mode: lời chào được nhận dù không có từ khoá, khi bật trả lời nhanh', async () => {
  const { engine, said } = setup({ triggerMode: 'keyword', quickReplies: true });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'xin chào' });
  await tick();
  assert.equal(said.length, 1);
  engine.stop();
});
test('keyword mode: lời chào bị bỏ qua khi tắt trả lời nhanh', async () => {
  const { engine, said } = setup({ triggerMode: 'keyword', quickReplies: false });
  engine.enqueue({ kind: 'chat', uid: 'a', name: 'An', text: 'xin chào' });
  await tick();
  assert.equal(said.length, 0);
  engine.stop();
});

test('mặc định mới: trả lời mọi comment và bốc ngẫu nhiên', () => {
  assert.equal(DEFAULTS.triggerMode, 'all');
  assert.equal(DEFAULTS.pickMode, 'random');
});

test('lượt tự nói: không vào bảng comment, nhường chỗ cho comment thật', async () => {
  const { engine, said, asked, setSettings } = setup({ triggerMode: 'all' });
  engine.enqueue({ kind: 'self', name: 'Kurumi', text: 'đố vui' });
  await tick();
  assert.equal(asked.length, 1);
  assert.equal(engine.snapshot().board.length, 0);
  assert.equal(said.length, 1);
});
