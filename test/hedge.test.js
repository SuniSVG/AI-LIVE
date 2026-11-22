'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hedgedRun } = require('../src/hedge');

const base = { isTransient: () => false, shouldTryNext: () => true, hedgeMs: 30, retryDelayMs: 5, perAttemptMs: 2000 };
const wait = (ms, sig) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  sig && sig.addEventListener('abort', () => { clearTimeout(t); rej(sig.reason || new Error('abort')); }, { once: true });
});

test('mô hình chính nhanh: trả về ngay, không gọi mô hình khác', async () => {
  const calls = [];
  const text = await hedgedRun({ ...base, chain: ['a', 'b'], call: async m => { calls.push(m); return 'ok-' + m; } });
  assert.equal(text, 'ok-a');
  await wait(60);
  assert.deepEqual(calls, ['a']);
});

test('mô hình chính chậm: mô hình kế tiếp được bắn song song và thắng', async () => {
  const calls = [];
  const text = await hedgedRun({
    ...base, chain: ['slow', 'fast'],
    call: async (m, sig) => { calls.push(m); if (m === 'slow') { await wait(500, sig); return 'slow'; } return 'fast'; }
  });
  assert.equal(text, 'fast');
  assert.deepEqual(calls, ['slow', 'fast']);
});

test('mô hình lỗi: sang mô hình kế tiếp ngay, không chờ hedgeMs', async () => {
  const t0 = Date.now();
  const text = await hedgedRun({
    ...base, hedgeMs: 5000, chain: ['bad', 'good'],
    call: async m => { if (m === 'bad') throw new Error('503 UNAVAILABLE'); return 'good'; }
  });
  assert.equal(text, 'good');
  assert.ok(Date.now() - t0 < 500);
});

test('lỗi tạm thời được thử lại cùng mô hình một lần', async () => {
  let n = 0;
  const text = await hedgedRun({
    ...base, isTransient: () => true, chain: ['a'],
    call: async () => { if (++n === 1) throw new Error('429'); return 'lại ok'; }
  });
  assert.equal(text, 'lại ok');
  assert.equal(n, 2);
});

test('lỗi cố định (khoá API sai): dừng hẳn, không thử mô hình khác', async () => {
  const calls = [];
  await assert.rejects(
    hedgedRun({ ...base, shouldTryNext: () => false, chain: ['a', 'b'], call: async m => { calls.push(m); throw new Error('API key not valid'); } }),
    /Gemini lỗi sau 1 lần thử: API key not valid/
  );
  assert.deepEqual(calls, ['a']);
});

test('mọi mô hình đều lỗi: báo lỗi tổng hợp', async () => {
  await assert.rejects(
    hedgedRun({ ...base, chain: ['a', 'b'], call: async () => { throw new Error('boom'); } }),
    /Gemini lỗi sau 2 lần thử: boom/
  );
});

test('trả về rỗng thì coi như lỗi và thử mô hình kế tiếp', async () => {
  const text = await hedgedRun({ ...base, chain: ['a', 'b'], call: async m => (m === 'a' ? '  ' : 'có chữ') });
  assert.equal(text, 'có chữ');
});

test('huỷ từ bên ngoài: dừng và huỷ các request đang chạy', async () => {
  const ctl = new AbortController();
  let aborted = false;
  const p = hedgedRun({
    ...base, chain: ['a'], signal: ctl.signal,
    call: async (m, sig) => { sig.addEventListener('abort', () => { aborted = true; }); await wait(1000, sig); return 'x'; }
  });
  setTimeout(() => ctl.abort(new Error('người dùng huỷ')), 20);
  await assert.rejects(p, /người dùng huỷ/);
  await wait(10);
  assert.ok(aborted);
});
