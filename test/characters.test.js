'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CHARACTERS, CHARACTER_IDS, DEFAULT_CHARACTER, FORMS, getCharacter, listCharacters, stageInfo } = require('../src/characters');
const { sanitize, DEFAULTS } = require('../src/settings');
const { buildSystem, personaFor } = require('../src/persona');

const RENDERER = path.join(__dirname, '..', 'renderer');

test('chỉ còn DeepSeek-chan (Live2D Cubism 5), là nhân vật mặc định', () => {
  assert.deepEqual(CHARACTER_IDS, ['deepseek']);
  assert.equal(DEFAULT_CHARACTER, 'deepseek');
  assert.equal(CHARACTERS.deepseek.kind, 'live2d4');
  assert.equal(CHARACTERS.deepseek.name, 'DeepSeek-chan');
  assert.deepEqual(Object.keys(FORMS), []);
});

test('nhân vật lạ hoặc id cũ đều dùng DeepSeek-chan, không bao giờ trả về undefined', () => {
  assert.equal(getCharacter('abc').id, 'deepseek');
  assert.equal(getCharacter(undefined).id, 'deepseek');
  assert.equal(getCharacter('kurumi').id, 'deepseek');
  assert.equal(getCharacter('natori').id, 'deepseek');
});

test('listCharacters đưa tính cách mặc định cho bảng điều khiển nhưng không lộ ví dụ', () => {
  for (const c of listCharacters()) {
    assert.ok(c.name && c.description);
    assert.equal(c.persona, CHARACTERS[c.id].persona);
    assert.equal(c.examples, undefined);
  }
});

test('file model của DeepSeek-chan có thật trong renderer', () => {
  for (const id of CHARACTER_IDS) {
    const file = path.join(RENDERER, CHARACTERS[id].model);
    assert.ok(fs.existsSync(file), 'thiếu ' + file);
  }
});

test('cài đặt: mặc định là DeepSeek-chan, id cũ hoặc id lạ đều đưa về DeepSeek-chan', () => {
  assert.equal(DEFAULTS.character, 'deepseek');
  assert.equal(sanitize({ character: 'deepseek' }).character, 'deepseek');
  assert.equal(sanitize({ character: 'kurumi' }).character, 'deepseek');
  assert.equal(sanitize({ character: 'natori' }).character, 'deepseek');
  assert.equal(sanitize({ character: 'hack' }).character, 'deepseek');
});

test('tính cách: ô tự nhập của DeepSeek-chan được dùng, prompt hệ thống là của DeepSeek-chan', () => {
  const s = sanitize({ character: 'deepseek', personas: { deepseek: 'Tính cách tự nhập', kurumi: 'bỏ qua' } });
  assert.equal(personaFor(s), 'Tính cách tự nhập');
  assert.equal(s.personas.kurumi, undefined);
  assert.match(buildSystem(sanitize({ character: 'deepseek' })), /DeepSeek-chan/);
});

test('sân khấu nhận đúng thông tin để tải renderer DeepSeek-chan', () => {
  const info = stageInfo('deepseek');
  assert.equal(info.kind, 'live2d4');
  assert.equal(info.model, 'models/deepseek/deepseek.model3.json');
});
