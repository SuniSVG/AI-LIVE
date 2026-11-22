'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { groupOf, buildMotions, buildModelJson } = require('../src/motions');
const { SCENES, SCENE_IDS } = require('../src/scenes');
const { sanitize, DEFAULTS } = require('../src/settings');
const fs = require('fs');
const path = require('path');

test('tên file thành nhóm: idle* vào nhóm idle, các file khác giữ tên', () => {
  assert.equal(groupOf('idle.mtn'), 'idle');
  assert.equal(groupOf('idle_02.mtn'), 'idle');
  assert.equal(groupOf('id4_1.MTN'), 'id4_1');
});

test('gom motion theo nhóm, bỏ file không phải .mtn', () => {
  const m = buildMotions(['id4.mtn', 'id4_2.mtn', 'idle_02.mtn', 'idle.mtn', 'readme.txt']);
  assert.deepEqual(Object.keys(m).sort(), ['id4', 'id4_2', 'idle'].sort());
  assert.deepEqual(m.idle.map(x => x.file), ['motions/idle.mtn', 'motions/idle_02.mtn']);
  assert.deepEqual(m.id4, [{ file: 'motions/id4.mtn' }]);
});

test('không có file motion thì model.json giữ nguyên', () => {
  const base = { model: 'model.moc' };
  assert.equal(buildModelJson(base, []), base);
  assert.deepEqual(buildModelJson(base, ['x.mtn']).motions.x, [{ file: 'motions/x.mtn' }]);
});

test('nền sân khấu: có file thật cho mọi nền; cài đặt nhận đúng giá trị', () => {
  for (const id of SCENE_IDS) {
    const f = SCENES[id].file;
    if (f) assert.ok(fs.existsSync(path.join(__dirname, '..', 'renderer', f)), f);
  }
  assert.equal(DEFAULTS.scene, 'thien-cung');
  assert.equal(sanitize({ scene: 'none' }).scene, 'none');
  assert.equal(sanitize({ scene: 'hack' }).scene, 'thien-cung');
});

const { freeGroupNames, pickFreeGroup, resolveMotion } = require('../src/motions');
const { parseReply, buildSystem } = require('../src/persona');

test('chuyển động tự do: bỏ idle, sắp xếp, không có file thì rỗng', () => {
  assert.deepEqual(freeGroupNames(['id4_2.mtn', 'idle.mtn', 'id4.mtn', 'x.txt']), ['id4', 'id4_2']);
  assert.deepEqual(freeGroupNames([]), []);
});

test('chọn ngẫu nhiên nhóm nhưng không lặp nhóm vừa chạy khi còn lựa chọn', () => {
  assert.equal(pickFreeGroup([], ''), null);
  assert.equal(pickFreeGroup(['a'], 'a'), 'a');                // chỉ còn một nhóm thì vẫn chạy
  assert.equal(pickFreeGroup(['a', 'b'], 'a', () => 0), 'b');  // tránh 'a'
  assert.equal(pickFreeGroup(['a', 'b'], 'b', () => 0), 'a');
});

test('tên motion AI đưa ra phải có thật, tên bịa thì bỏ', () => {
  assert.equal(resolveMotion('id4_2', ['id4', 'id4_2']), 'id4_2');
  assert.equal(resolveMotion('dance99', ['id4']), null);
  assert.equal(resolveMotion(null, ['id4']), null);
});

test('parseReply: đọc thẻ motion sau biểu cảm, thứ tự tự do', () => {
  assert.deepEqual(parseReply('[warm][motion:id4_2]\nChào bạn!'), { text: 'Chào bạn!', action: 'warm', motion: 'id4_2' });
  assert.deepEqual(parseReply('[motion:id4] [tease]\nHihi'), { text: 'Hihi', action: 'tease', motion: 'id4' });
  assert.deepEqual(parseReply('[dance]\nok'), { text: 'ok', action: 'neutral', motion: null });
  assert.deepEqual(parseReply('{"text":"ok","action":"warm","motion":"id4"}'), { text: 'ok', action: 'warm', motion: 'id4' });
});

test('buildSystem: chỉ nhắc chuyển động khi nhân vật có motion', () => {
  const { sanitize } = require('../src/settings');
  assert.doesNotMatch(buildSystem(sanitize({ character: 'deepseek' })), /motion:/);
  const withMotion = buildSystem(sanitize({ character: 'deepseek' }), ['id4', 'id4_2']);
  assert.match(withMotion, /\[motion:TÊN\]/);
  assert.match(withMotion, /id4, id4_2/);
});

test('cài đặt: chuyển động tự do mặc định bật', () => {
  const { sanitize, DEFAULTS } = require('../src/settings');
  assert.equal(DEFAULTS.freeMotion, true);
  assert.equal(sanitize({ freeMotion: false }).freeMotion, false);
});

test('parseReply: thẻ [form:TÊN] được đọc, không có thì không có trường form', () => {
  assert.deepEqual(parseReply('[warm][form:kurumi3]\nMình đổi dạng nè!'), { text: 'Mình đổi dạng nè!', action: 'warm', motion: null, form: 'kurumi3' });
  assert.equal(parseReply('[warm]\nhi').form, undefined);
});

test('buildSystem: có hướng dẫn đổi dạng khi được phép, nhắc không đổi khi đang trong thời gian chờ', () => {
  const s = sanitize({ character: 'deepseek' });
  assert.match(buildSystem(s, [], { current: null, canChange: true }), /\[form:TÊN\]/);
  assert.match(buildSystem(s, [], { current: 'kurumi2', canChange: false }), /không đổi thêm/);
  assert.doesNotMatch(buildSystem(s), /\[form:/);
});
