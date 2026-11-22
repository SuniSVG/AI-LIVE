'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { GESTURES, ACTION_GESTURES, IDLE_POOL, evaluate } = require('../renderer/js/cute4.js');

const dir = path.join(__dirname, '..', 'renderer', 'models', 'deepseek');
const tuning = JSON.parse(fs.readFileSync(path.join(dir, 'tuning.json'), 'utf8'));

test('mọi cử chỉ về 0 ở đầu và cuối: không bị giật khi bắt đầu hay kết thúc', () => {
  for (const name of Object.keys(GESTURES)) {
    for (const t of [0, 1]) {
      for (const [k, v] of Object.entries(evaluate(name, t))) {
        assert.ok(Math.abs(v) < 1e-9, `${name}.${k} tại t=${t} = ${v}`);
      }
    }
  }
});

test('biên độ luôn hữu hạn và không vượt mức cho phép', () => {
  for (const name of Object.keys(GESTURES)) {
    for (let i = 0; i <= 50; i++) {
      for (const [k, v] of Object.entries(evaluate(name, i / 50))) {
        assert.ok(Number.isFinite(v), `${name}.${k}`);
        assert.ok(Math.abs(v) <= 12, `${name}.${k} quá lớn: ${v}`);
      }
    }
  }
});

test('mọi cử chỉ được nhắc đến đều tồn tại; vòng rảnh chỉ dùng cử chỉ hợp lệ', () => {
  for (const list of Object.values(ACTION_GESTURES)) for (const n of list) assert.ok(GESTURES[n], n);
  for (const n of IDLE_POOL) assert.ok(GESTURES[n], n);
});

test('mỗi cảm xúc của nhân vật đều có một mục cử chỉ (có thể rỗng)', () => {
  for (const id of Object.keys(tuning.expressions)) {
    assert.ok(Object.prototype.hasOwnProperty.call(ACTION_GESTURES, id), `thiếu cử chỉ cho ${id}`);
  }
  assert.deepEqual(ACTION_GESTURES.neutral, []);
});
