'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVideoQueue } = require('../src/videoqueue');

// Trình giả lập: ghi lại mọi lệnh gửi sang sân khấu, và đồng hồ/hẹn giờ điều khiển được
function harness(opts = {}) {
  const sent = [];
  let clock = 0;
  const timers = new Map();
  let tid = 0;
  const q = createVideoQueue({
    send: (ch, p) => { sent.push({ ch, p }); return opts.ready === false ? false : true; },
    getLimit: () => opts.limit ?? 10,
    getVolume: () => 80,
    now: () => clock,
    setTimer: (fn, ms) => { const id = ++tid; timers.set(id, { fn, ms }); return id; },
    clearTimer: id => timers.delete(id),
    onChange: () => {}
  });
  const plays = () => sent.filter(s => s.ch === 'stage:videoPlay').map(s => s.p);
  const fireTimers = () => { for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } };
  return { q, sent, plays, fireTimers, timers, tick: ms => { clock += ms; } };
}
const item = (gift, name = 'An', rule = 'r1') => ({ rule, gift, name, diamonds: 10 });

test('mỗi lúc chỉ phát một video; video sau chỉ bắt đầu khi video trước báo xong', () => {
  const h = harness();
  h.q.enqueue(item('Rose', 'An'));
  h.q.enqueue(item('Doughnut', 'Bình'));
  assert.equal(h.plays().length, 1);
  assert.equal(h.plays()[0].gift, 'Rose');
  assert.equal(h.plays()[0].src, '/video/r1');
  assert.equal(h.plays()[0].volume, 80);
  h.q.done(h.plays()[0].id);
  assert.equal(h.plays().length, 2);
  assert.equal(h.plays()[1].name, 'Bình');
});

test('đúng thứ tự vào hàng đợi (FIFO)', () => {
  const h = harness();
  for (const g of ['A', 'B', 'C']) h.q.enqueue(item(g));
  const order = [];
  for (let i = 0; i < 3; i++) { const p = h.plays()[i]; order.push(p.gift); h.q.done(p.id); }
  assert.deepEqual(order, ['A', 'B', 'C']);
});

test('done với id sai không làm chuyển video', () => {
  const h = harness();
  h.q.enqueue(item('Rose'));
  h.q.enqueue(item('Doughnut'));
  h.q.done('khong-co');
  assert.equal(h.plays().length, 1);
});

test('hàng đợi đầy thì bỏ video cũ nhất đang chờ (không bỏ video đang phát)', () => {
  const h = harness({ limit: 2 });
  h.q.enqueue(item('Đang phát'));
  h.q.enqueue(item('Chờ 1'));
  h.q.enqueue(item('Chờ 2'));
  h.q.enqueue(item('Chờ 3'));       // đầy: bỏ "Chờ 1"
  const snap = h.q.snapshot();
  assert.equal(snap.playing.gift, 'Đang phát');
  assert.deepEqual(snap.queue.map(x => x.gift), ['Chờ 2', 'Chờ 3']);
  assert.ok(snap.history.some(x => x.gift === 'Chờ 1' && x.status === 'dropped'));
});

test('bỏ qua video đang phát: gửi lệnh dừng rồi phát video kế tiếp', () => {
  const h = harness();
  h.q.enqueue(item('A'));
  h.q.enqueue(item('B'));
  assert.equal(h.q.skip(), true);
  assert.ok(h.sent.some(s => s.ch === 'stage:videoStop'));
  assert.equal(h.plays()[1].gift, 'B');
  assert.equal(h.q.skip() === true, true);   // B cũng bị bỏ
  assert.equal(h.q.snapshot().playing, null);
  assert.equal(h.q.skip(), false);           // không có gì để bỏ
});

test('xoá hàng đợi chỉ xoá video đang chờ, không đụng video đang phát', () => {
  const h = harness();
  h.q.enqueue(item('A'));
  h.q.enqueue(item('B'));
  h.q.enqueue(item('C'));
  h.q.clear();
  const snap = h.q.snapshot();
  assert.equal(snap.playing.gift, 'A');
  assert.equal(snap.queue.length, 0);
});

test('sân khấu chưa sẵn sàng (send trả false): bỏ qua video đó, không kẹt hàng đợi', () => {
  const h = harness({ ready: false });
  h.q.enqueue(item('A'));
  const snap = h.q.snapshot();
  assert.equal(snap.playing, null);
  assert.equal(snap.history[0].status, 'error');
});

test('hết giờ mà sân khấu không báo: tự bỏ và phát video kế tiếp', () => {
  const h = harness();
  h.q.enqueue(item('A'));
  h.q.enqueue(item('B'));
  h.fireTimers();                              // watchdog mặc định 45 giây
  assert.ok(h.sent.some(s => s.ch === 'stage:videoStop'));
  assert.equal(h.plays()[1].gift, 'B');
  assert.equal(h.q.snapshot().history[0].status, 'timeout');
});

test('biết độ dài video thì chốt thời gian theo độ dài (không cắt video dài)', () => {
  const h = harness();
  h.q.enqueue(item('A'));
  const id = h.plays()[0].id;
  h.q.meta(id, 120);                           // video 2 phút
  // watchdog mặc định đã bị thay: chỉ còn một hẹn giờ, đúng 130 giây
  const pending = [...h.timers.values()];
  assert.equal(pending.length, 1);
  assert.equal(pending[0].ms, 130000);
  h.q.done(id);
  assert.equal(h.timers.size, 0);              // xong thì huỷ hẹn giờ
});

test('reset (sân khấu tải lại): bỏ video đang phát và phát tiếp hàng đợi', () => {
  const h = harness();
  h.q.enqueue(item('A'));
  h.q.enqueue(item('B'));
  h.q.reset();
  assert.equal(h.plays()[1].gift, 'B');
});

test('nhật ký ghi trạng thái từng video: đã phát, bỏ qua', () => {
  const h = harness();
  h.q.enqueue(item('A'));
  h.q.enqueue(item('B'));
  h.q.done(h.plays()[0].id);
  h.q.skip();
  const hist = h.q.snapshot().history;
  assert.deepEqual(hist.map(x => x.status), ['skipped', 'played']);
});

// Nghỉ giữa hai video: video kế chỉ bắt đầu sau khi nghỉ xong, và nghỉ được báo cho giao diện
test('nghỉ giữa hai video: chưa phát video kế cho tới khi nghỉ xong', async () => {
  const calls = [];
  let release;
  const h = harness();
  const q = createVideoQueue({
    send: (ch, p) => { if (ch === 'stage:videoPlay') calls.push(p.gift); return true; },
    getLimit: () => 10, getVolume: () => 80, now: () => 0,
    setTimer: () => 1, clearTimer: () => {}, onChange: () => {},
    interlude: hasNext => new Promise(r => { calls.push(hasNext ? 'nghỉ(có tiếp)' : 'nghỉ(hết)'); release = r; })
  });
  q.enqueue(item('A'));
  q.enqueue(item('B'));
  const first = calls[0];
  q.done(q.snapshot().playing.id);            // A xong → vào nghỉ, chưa phát B
  await new Promise(r => setImmediate(r));    // interlude được gọi sau một vòng microtask
  assert.equal(first, 'A');
  assert.equal(calls.length, 2);
  assert.equal(calls[1], 'nghỉ(có tiếp)');
  assert.equal(q.snapshot().resting, true);
  assert.equal(q.snapshot().playing, null);
  release();                                  // hết nghỉ
  await new Promise(r => setImmediate(r));
  assert.equal(calls[calls.length - 1], 'B');
  assert.equal(q.snapshot().resting, false);
});

test('hết video thì nghỉ với hasNext = false', async () => {
  const seen = [];
  const q = createVideoQueue({
    send: () => true, getLimit: () => 10, getVolume: () => 80, now: () => 0,
    setTimer: () => 1, clearTimer: () => {}, onChange: () => {},
    interlude: async hasNext => { seen.push(hasNext); }
  });
  q.enqueue(item('A'));
  q.done(q.snapshot().playing.id);
  await new Promise(r => setImmediate(r));
  assert.deepEqual(seen, [false]);
});

test('video bị bỏ qua hoặc hết giờ không kích hoạt nghỉ', () => {
  let rests = 0;
  const q = createVideoQueue({
    send: () => true, getLimit: () => 10, getVolume: () => 80, now: () => 0,
    setTimer: () => 1, clearTimer: () => {}, onChange: () => {},
    interlude: () => { rests++; return Promise.resolve(); }
  });
  q.enqueue(item('A'));
  q.skip();
  assert.equal(rests, 0);
});

test('tạm giữ: không phát video khi đang giữ, nhả ra thì phát tiếp', () => {
  const h = harness();
  h.q.setHold(true);
  h.q.enqueue(item('A'));
  assert.equal(h.plays().length, 0);
  h.q.setHold(false);
  assert.equal(h.plays().length, 1);
});
