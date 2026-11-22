'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSummaryPrompt, parseSummary } = require('../src/summarize');
const { createMemory } = require('../src/memory');

test('parseSummary: đọc JSON có rào markdown và lọc sự thật nhạy cảm', () => {
  const raw = '```json\n{"summary":"Lan hay hỏi về học y.","facts":["đang học y khoa","bị bệnh tim","thích mèo"]}\n```';
  const r = parseSummary(raw);
  assert.equal(r.summary, 'Lan hay hỏi về học y.');
  assert.deepEqual(r.facts, ['đang học y khoa', 'thích mèo']);
});

test('parseSummary: rác hoặc JSON hỏng thì trả về null', () => {
  assert.equal(parseSummary('xin lỗi, không làm được'), null);
  assert.equal(parseSummary('{"summary": '), null);
});

test('buildSummaryPrompt: bao gồm lượt của khán giả và yêu cầu chỉ trả JSON', () => {
  const p = buildSummaryPrompt('Lan', [{ kind: 'chat', text: 'mình thích mèo', reply: 'mèo dễ thương quá!' }]);
  assert.match(p.system, /JSON/);
  assert.match(p.userText, /mình thích mèo/);
});

test('memory: đếm lượt mới, cần tóm tắt khi đủ ngưỡng, setSummary reset và lưu sự thật', () => {
  const m = createMemory();
  const who = { uid: 'u1', name: 'Lan' };
  for (let i = 0; i < 8; i++) m.addEpisode({ kind: 'chat', who, text: 'dòng ' + i, reply: 'ok' });
  assert.deepEqual(m.needingSummary(8).map(x => x.uid), ['u1']);
  m.setSummary(who, 'Lan thích mèo.', ['thích mèo']);
  assert.equal(m.needingSummary(8).length, 0);
  const v = m.viewer(who);
  assert.equal(v.summary, 'Lan thích mèo.');
  assert.deepEqual(v.facts.map(f => f.text), ['thích mèo']);
  assert.equal(m.episodesOf(who, 3).length, 3);
});

test('recall: trả về tóm tắt của khán giả để đưa vào prompt', () => {
  const m = createMemory();
  const who = { uid: 'u2', name: 'Minh' };
  m.addEpisode({ kind: 'chat', who, text: 'chào' });
  m.setSummary(who, 'Minh hay đến sớm.', []);
  assert.equal(m.recall({ who, query: '' }).viewer.summary, 'Minh hay đến sớm.');
});
