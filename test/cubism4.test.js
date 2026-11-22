'use strict';
// Đăng ký tự động biểu cảm (exp3) và motion (motion3) cho model Cubism 4, và nhân vật DeepSeek-chan.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { registerFolderFiles, folderFileList } = require('../src/cubism4');
const { CHARACTERS, CHARACTER_IDS, getCharacter, stageInfo } = require('../src/characters');
const { composeModel3, motionGroupsOf } = require('../src/cubism4');

const RENDERER = path.join(__dirname, '..', 'renderer');
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const D = CHARACTERS.deepseek;
const DIR = path.join(RENDERER, D.dir);
const base = readJson(path.join(RENDERER, D.model));
const tuning = readJson(path.join(DIR, 'tuning.json'));
const composed = composeModel3(base, folderFileList(fs, DIR));

test('registerFolderFiles: thêm biểu cảm từ exp/ và motion từ motions/, IDLE vào nhóm Idle', () => {
  const out = registerFolderFiles({ FileReferences: { Moc: 'a.moc3' } },
    ['exp/a.exp3.json', 'exp/b.exp3.json', 'motions/IDLE.motion3.json', 'motions/raise.motion3.json', 'motions/raise2.motion3.json']);
  assert.deepEqual(out.FileReferences.Expressions, [{ Name: 'a', File: 'exp/a.exp3.json' }, { Name: 'b', File: 'exp/b.exp3.json' }]);
  assert.deepEqual(out.FileReferences.Motions.Idle, [{ File: 'motions/IDLE.motion3.json' }]);
  assert.deepEqual(out.FileReferences.Motions.raise, [{ File: 'motions/raise.motion3.json' }]);
  assert.deepEqual(out.FileReferences.Motions.raise2, [{ File: 'motions/raise2.motion3.json' }]);
});

test('registerFolderFiles: file đã khai báo không đăng ký lần nữa, bản gốc không bị sửa', () => {
  const src = { FileReferences: { Expressions: [{ Name: 'x', File: 'exp/x.exp3.json' }], Motions: { Tap: [{ File: 'motions/t.motion3.json' }] } } };
  const out = registerFolderFiles(src, ['exp/x.exp3.json', 'motions/t.motion3.json', 'exp/y.exp3.json']);
  assert.equal(out.FileReferences.Expressions.length, 2);
  assert.equal(out.FileReferences.Motions.Tap.length, 1);
  assert.equal(src.FileReferences.Expressions.length, 1, 'đối tượng gốc phải còn nguyên');
});

test('DeepSeek-chan là nhân vật Cubism 4 có tính cách riêng, không có dạng để đổi', () => {
  assert.equal(D.kind, 'live2d4');
  assert.equal(D.noForms, true);
  assert.match(D.persona, /DeepSeek-chan/);
  assert.equal(CHARACTER_IDS.length, 1);
  assert.equal(getCharacter('deepseek').id, 'deepseek');
  assert.equal(stageInfo('deepseek').kind, 'live2d4');
});

test('DeepSeek: đủ 23 biểu cảm và 7 nhóm motion (không tính Idle), mọi file có thật', () => {
  assert.equal(composed.FileReferences.Expressions.length, 23);
  assert.deepEqual(motionGroupsOf(composed).sort(),
    ['finger_down', 'finger_up', 'grass_in', 'grass_out', 'lower_hand', 'raise_hand', 'show']);
  const r = composed.FileReferences;
  const files = [r.Moc, ...r.Textures, r.Physics, r.DisplayInfo,
    ...r.Expressions.map(e => e.File), ...Object.values(r.Motions).flat().map(m => m.File)];
  for (const f of files) assert.ok(fs.existsSync(path.join(DIR, f)), 'thiếu ' + f);
  assert.equal(fs.readFileSync(path.join(DIR, r.Moc)).subarray(0, 4).toString(), 'MOC3');
});

test('DeepSeek tuning.json: mọi biểu cảm, cử chỉ chạm và hành động đều hợp lệ', () => {
  const exps = composed.FileReferences.Expressions.map(e => e.Name);
  const groups = Object.keys(composed.FileReferences.Motions);
  for (const a of ['neutral', 'warm', 'tease', 'think', 'surprise', 'stern', 'zafkiel']) {
    assert.ok(tuning.expressions[a] && tuning.expressions[a].length, 'thiếu biểu cảm cho ' + a);
    assert.ok(tuning.pose[a] && tuning.pose[a].length, 'thiếu cử chỉ cho ' + a);
    for (const e of tuning.expressions[a]) assert.ok(exps.includes(e), `biểu cảm ${e} không có`);
  }
  for (const g of Object.values(tuning.touch)) assert.ok(groups.includes(g), 'nhóm chạm lạ: ' + g);
});

// Nạp moc3 thật bằng Cubism Core (chạy trong Node). Core khởi tạo WebAssembly bất đồng bộ nên phải chờ.
function loadCore() {
  const file = path.join(RENDERER, 'vendor', 'live2dcubismcore.min.js');
  if (!fs.existsSync(file)) return null;
  const sb = { console, performance, setTimeout, clearTimeout, TextDecoder, WebAssembly, Uint8Array, Float32Array, ArrayBuffer, atob, btoa };
  sb.window = sb; sb.self = sb; sb.navigator = { userAgent: 'node' }; sb.location = { href: 'file:///x/' };
  sb.document = { currentScript: { src: 'file:///x/' }, createElement: () => ({}), getElementsByTagName: () => [], location: sb.location };
  vm.createContext(sb);
  try { vm.runInContext(fs.readFileSync(file, 'utf8'), sb); } catch (_) { return null; }
  return sb.Live2DCubismCore || null;
}
async function waitMoc(Core, buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  for (let i = 0; i < 50; i++) {
    try { const m = Core.Moc.fromArrayBuffer(ab); if (m) return m; } catch (_) { /* chưa sẵn sàng */ }
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

test('Cubism Core (5.x) nạp được moc3 của DeepSeek và mọi tham số biểu cảm/motion đều có trong model', async t => {
  const Core = loadCore();
  if (!Core) return t.skip('không tìm thấy Cubism Core trong renderer/vendor/');
  const buf = fs.readFileSync(path.join(DIR, composed.FileReferences.Moc));
  const moc = await waitMoc(Core, buf);
  assert.ok(moc, 'Core không đọc được moc3');
  const m = Core.Model.fromMoc(moc);
  for (const e of composed.FileReferences.Expressions) {
    for (const p of readJson(path.join(DIR, e.File)).Parameters) assert.ok(m.parameters.ids.includes(p.Id), `${e.Name}: thiếu ${p.Id}`);
  }
  for (const f of Object.values(composed.FileReferences.Motions).flat()) {
    for (const c of readJson(path.join(DIR, f.File)).Curves) {
      if (c.Target === 'Parameter') assert.ok(m.parameters.ids.includes(c.Id), `${f.File}: thiếu ${c.Id}`);
    }
  }
});

test('DeepSeek tuning: drawable ẩn và chuyển động đầu tồn tại trong moc', async t => {
  const tune = readJson(path.join(DIR, 'tuning.json'));
  assert.ok(Array.isArray(tune.hideDrawables) && tune.hideDrawables.length > 0);
  const Core = loadCore();
  if (!Core) return t.skip('không tìm thấy Cubism Core');
  const buf = fs.readFileSync(path.join(DIR, composed.FileReferences.Moc));
  const moc = await waitMoc(Core, buf);
  const m = Core.Model.fromMoc(moc);
  for (const id of tune.hideDrawables) assert.ok(Array.from(m.drawables.ids).includes(id), 'không có drawable ' + id);
  for (const p of ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ']) assert.ok(Array.from(m.parameters.ids).includes(p), 'thiếu ' + p);
});
