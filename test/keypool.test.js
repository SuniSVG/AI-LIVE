'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseKeys, cooldownFor, createKeyPool, raceKeys } = require('../src/keypool');

test('parseKeys: tách theo dòng/dấu phẩy, bỏ trùng và rác', () => {
  assert.deepEqual(parseKeys('AAAAAAAAAA\nBBBBBBBBBB, CCCCCCCCCC ;AAAAAAAAAA\n\nx'), ['AAAAAAAAAA', 'BBBBBBBBBB', 'CCCCCCCCCC']);
  assert.deepEqual(parseKeys(''), []);
  assert.deepEqual(parseKeys(null), []);
});

test('pick: mỗi lần 2 key khác nhau, xoay vòng đều', () => {
  const p = createKeyPool();
  const keys = ['a', 'b', 'c', 'd'];
  assert.deepEqual(p.pick(keys), ['a', 'b']);
  assert.deepEqual(p.pick(keys), ['c', 'd']);
  assert.deepEqual(p.pick(keys), ['a', 'b']);
  const three = ['a', 'b', 'c'];
  const q = createKeyPool();
  assert.deepEqual(q.pick(three), ['a', 'b']);
  assert.deepEqual(q.pick(three), ['c', 'a']);
  assert.deepEqual(q.pick(three), ['b', 'c']);
});

test('pick: một key thì dùng một key; không có key thì rỗng', () => {
  const p = createKeyPool();
  assert.deepEqual(p.pick(['a']), ['a']);
  assert.deepEqual(p.pick(['a']), ['a']);
  assert.deepEqual(p.pick([]), []);
});

test('key bị 429 được cho nghỉ rồi tự quay lại', () => {
  let t = 1000;
  const p = createKeyPool({ now: () => t });
  const err = Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
  assert.ok(p.penalize('a', err) > 0);
  assert.ok(p.isCooling('a'));
  assert.deepEqual(p.pick(['a', 'b', 'c']), ['b', 'c']);
  t += 31000;
  assert.ok(!p.isCooling('a'));
});

test('mọi key đều nghỉ: vẫn dùng (còn hơn không trả lời)', () => {
  const p = createKeyPool({ now: () => 0 });
  const err = Object.assign(new Error('x'), { status: 429 });
  p.penalize('a', err); p.penalize('b', err);
  assert.equal(p.pick(['a', 'b']).length, 2);
});

test('cooldownFor: lỗi khoá sai nghỉ lâu, lỗi khác không nghỉ', () => {
  assert.ok(cooldownFor(Object.assign(new Error('API key not valid'), { status: 400 })) >= 60000);
  assert.ok(cooldownFor({ status: 403, message: 'x' }) >= 60000);
  assert.equal(cooldownFor(new Error('mô hình trả về rỗng')), 0);
  assert.equal(cooldownFor({ status: 503, message: 'overloaded' }), 0);
});

test('raceKeys: key nhanh hơn thắng, key chậm bị huỷ', async () => {
  let abortedSlow = false;
  const text = await raceKeys({
    keys: ['slow', 'fast'],
    call: (k, sig) => k === 'fast' ? Promise.resolve('nhanh') : new Promise((res, rej) => { sig.addEventListener('abort', () => { abortedSlow = true; rej(new Error('abort')); }); setTimeout(() => res('chậm'), 500); })
  });
  assert.equal(text, 'nhanh');
  await new Promise(r => setTimeout(r, 20));
  assert.ok(abortedSlow);
});

test('raceKeys: một key lỗi, key kia vẫn trả lời; báo key lỗi', async () => {
  const failed = [];
  const text = await raceKeys({
    keys: ['bad', 'good'],
    call: async k => { if (k === 'bad') throw Object.assign(new Error('429'), { status: 429 }); return 'ok'; },
    onFail: (k) => failed.push(k)
  });
  assert.equal(text, 'ok');
  assert.deepEqual(failed, ['bad']);
});

test('raceKeys: mọi key lỗi thì ném lỗi, ưu tiên lỗi cho phép thử mô hình khác', async () => {
  const e1 = new Error('API key not valid');
  const e2 = Object.assign(new Error('503'), { status: 503 });
  await assert.rejects(
    raceKeys({ keys: ['a', 'b'], call: async k => { throw k === 'a' ? e1 : e2; }, shouldTryNext: e => e === e2 }),
    e => e === e2
  );
});

test('raceKeys: trả về rỗng ở một key thì chờ key còn lại', async () => {
  const text = await raceKeys({ keys: ['a', 'b'], call: async k => (k === 'a' ? '  ' : 'có chữ') });
  assert.equal(text, 'có chữ');
});
