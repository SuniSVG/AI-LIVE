'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { VIENEU_VOICES, VIENEU_DEFAULT, canonicalVoice } = require('../renderer/js/voices.js');
const { DEFAULTS } = require('../src/settings');

test('danh sách giọng VieNeu: 25 giọng, 10 giọng nổi bật đứng đầu, không trùng tên', () => {
  assert.equal(VIENEU_VOICES.length, 25);
  assert.equal(VIENEU_VOICES.filter(v => v.featured).length, 10);
  assert.ok(VIENEU_VOICES.slice(0, 10).every(v => v.featured));
  assert.equal(new Set(VIENEU_VOICES.map(v => v.name)).size, 25);
});

test('giọng mặc định của app nằm trong danh sách', () => {
  assert.equal(DEFAULTS.voiceName, VIENEU_DEFAULT);
  assert.ok(VIENEU_VOICES.some(v => v.name === VIENEU_DEFAULT));
});

test('tên cũ đổi về tên chuẩn; tên lạ giữ nguyên', () => {
  assert.equal(canonicalVoice('Minh Quân'), 'Hải Đăng');
  assert.equal(canonicalVoice('Mạnh Dũng'), 'Quốc Tuấn');
  assert.equal(canonicalVoice('Trúc Ly'), 'Trúc Ly');
  assert.equal(canonicalVoice('Ai đó'), 'Ai đó');
});
