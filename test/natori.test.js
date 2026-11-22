'use strict';
// Natori: nhân vật thứ 3, Live2D Cubism 4. Kiểm tra file model, hiệu chỉnh riêng (tuning.json),
// tên nhóm motion/vùng chạm do server tạo, và chạy thử avatar4.js / motion-director4.js trong môi trường giả.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { CHARACTERS, getCharacter, stageInfo } = require('../src/characters');
const { sanitize } = require('../src/settings');
const { buildModel3Json, motionGroupsOf, GROUP_ALIASES } = require('../src/natori');

const RENDERER = path.join(__dirname, '..', 'renderer');
const N = CHARACTERS.natori;
const DIR = path.join(RENDERER, N.dir);
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const model3 = readJson(path.join(RENDERER, N.model));
const tuning = readJson(path.join(DIR, 'tuning.json'));

test('Natori là nhân vật Cubism 4, có tính cách riêng và không dùng dạng (form) của Kurumi', () => {
  assert.equal(N.kind, 'live2d4');
  assert.equal(N.noForms, true);
  assert.match(N.persona, /Natori/);
  assert.notEqual(N.persona, CHARACTERS.kurumi.persona);
  assert.notEqual(N.examples, CHARACTERS.kurumi.examples);
  assert.equal(stageInfo('natori').kind, 'live2d4');
  assert.equal(getCharacter('natori').id, 'natori');
  assert.equal(sanitize({ character: 'natori' }).character, 'natori');
});

test('model3.json của Natori trỏ tới file có thật (moc3, texture, physics, pose, cdi, biểu cảm, motion)', () => {
  const r = model3.FileReferences;
  const files = [r.Moc, ...r.Textures, r.Physics, r.Pose, r.DisplayInfo,
    ...r.Expressions.map(e => e.File),
    ...Object.values(r.Motions).flat().map(m => m.File)];
  for (const f of files) assert.ok(fs.existsSync(path.join(DIR, f)), 'thiếu ' + f);
  assert.equal(fs.readFileSync(path.join(DIR, r.Moc)).subarray(0, 4).toString(), 'MOC3');
});

test('model3.json phục vụ cho sân khấu: nhóm motion có tên ngắn, vùng chạm có tên, bản gốc không bị sửa', () => {
  const out = buildModel3Json(model3);
  assert.deepEqual(Object.keys(out.FileReferences.Motions).sort(), ['Idle', ...Object.values(GROUP_ALIASES)].sort());
  assert.deepEqual(out.HitAreas.map(h => h.Name), ['head', 'body']);
  assert.ok(model3.FileReferences.Motions['Tap@Head'], 'bản gốc phải còn nguyên');
  assert.deepEqual(motionGroupsOf(model3), ['body_down', 'body_swing', 'head_pat', 'head_up', 'tap']);
  // mỗi motion gốc vẫn còn đủ sau khi đổi tên nhóm
  const count = o => Object.values(o.FileReferences.Motions).flat().length;
  assert.equal(count(out), count(model3));
});

test('tuning.json: mọi biểu cảm, cử chỉ chạm và hành động đều hợp lệ', () => {
  const exps = model3.FileReferences.Expressions.map(e => e.Name);
  const groups = Object.keys(buildModel3Json(model3).FileReferences.Motions);
  const ACTIONS = ['neutral', 'warm', 'tease', 'think', 'surprise', 'stern', 'zafkiel'];
  for (const a of ACTIONS) {
    assert.ok(tuning.expressions[a] && tuning.expressions[a].length, 'thiếu biểu cảm cho ' + a);
    assert.ok(tuning.pose[a] && tuning.pose[a].length, 'thiếu cử chỉ cho ' + a);
    for (const e of tuning.expressions[a]) assert.ok(exps.includes(e), `biểu cảm ${e} không có trong model`);
  }
  for (const g of Object.values(tuning.touch)) assert.ok(groups.includes(g), 'nhóm chạm lạ: ' + g);
  assert.ok(tuning.frame.zoom > 0.3 && tuning.frame.zoom < 3);
  assert.ok(tuning.breathScale >= 0 && tuning.breathScale <= 1);
});

// ---- Cubism Core thật: mọi tham số mà avatar4/motion-director4 ghi phải có trong moc3 ----
function loadCore() {
  const file = path.join(RENDERER, 'vendor', 'live2dcubismcore.min.js');
  if (!fs.existsSync(file)) return null;
  const sb = { console, performance, setTimeout, clearTimeout, TextDecoder, WebAssembly, Uint8Array, Float32Array, ArrayBuffer };
  sb.window = sb; sb.self = sb; sb.navigator = { userAgent: 'node' }; sb.location = { href: 'file:///x/' };
  sb.document = { currentScript: { src: 'file:///x/' }, createElement: () => ({}), getElementsByTagName: () => [], location: sb.location };
  vm.createContext(sb);
  try { vm.runInContext(fs.readFileSync(file, 'utf8'), sb); } catch (_) { return null; }
  return sb.Live2DCubismCore || null;
}

test('Cubism Core nạp được moc3 của Natori và có đủ tham số/vùng chạm mà code dùng', t => {
  const Core = loadCore();
  if (!Core) return t.skip('không nạp được Cubism Core trong Node');
  const buf = fs.readFileSync(path.join(DIR, model3.FileReferences.Moc));
  const moc = Core.Moc.fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.ok(moc, 'Core không đọc được moc3 (kiểm tra phiên bản Core)');
  const m = Core.Model.fromMoc(moc);
  const used = new Set();
  for (const f of ['avatar4.js', 'motion-director4.js']) {
    const src = fs.readFileSync(path.join(RENDERER, 'js', f), 'utf8');
    for (const x of src.matchAll(/'(Param[A-Za-z0-9]+)'/g)) used.add(x[1]);
  }
  for (const v of Object.values({ a: 'ParamAngleX', b: 'ParamAngleY', c: 'ParamAngleZ', d: 'ParamEyeBallX', e: 'ParamEyeBallY' })) used.add(v);
  for (const id of used) assert.ok(m.parameters.ids.includes(id), 'model không có tham số ' + id);
  for (const h of model3.HitAreas) assert.ok(m.drawables.ids.includes(h.Id), 'model không có vùng chạm ' + h.Id);
  // tham số của biểu cảm cũng phải có thật
  for (const e of model3.FileReferences.Expressions) {
    for (const p of readJson(path.join(DIR, e.File)).Parameters) assert.ok(m.parameters.ids.includes(p.Id), `${e.Name}: thiếu ${p.Id}`);
  }
});

// ---- chạy thử bộ điều khiển trong môi trường giả (không có PIXI, WebGL thật) ----
function harness() {
  const calls = { expr: [], motions: [], params: {}, set: {}, focus: [] };
  const listeners = {};
  const core = {
    values: { ParamMouthOpenY: 0, ParamEyeBallY: 0, ParamAngleY: 0 },
    addParameterValueById(id, v) { calls.params[id] = (calls.params[id] || 0) + v; },
    setParameterValueById(id, v) { calls.set[id] = v; this.values[id] = v; },
    getParameterValueById(id) { return this.values[id] || 0; }
  };
  const defs = {
    Idle: [{ File: 'a' }], tap: [{ File: 'b' }], head_pat: [{ File: 'c' }, { File: 'd' }], body_swing: [{ File: 'e' }]
  };
  const im = {
    width: 4000, height: 7000, coreModel: core,
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    breath: { _p: [{ peak: 15 }, { peak: 8 }], getParameters() { return this._p; } },
    focusController: { focus: (x, y) => calls.focus.push([x, y]) },
    motionManager: { definitions: defs, expressionManager: { setExpression: n => { calls.expr.push(n); return Promise.resolve(true); } } }
  };
  const mdl = {
    internalModel: im, autoUpdate: true,
    scale: { set: v => { mdl.s = v; } }, anchor: { set: () => {} }, position: { set: (x, y) => { mdl.pos = [x, y]; } },
    motion: (g, i, p) => { calls.motions.push([g, i, p]); return Promise.resolve(true); },
    hitTest: () => ['head']
  };
  const els = {};
  const el = id => (els[id] = els[id] || { id, dataset: {}, hidden: false, textContent: '', clientWidth: 800, clientHeight: 900,
    classList: { add() {}, remove() {} }, addEventListener(ev, fn) { (el.l = el.l || {})[id + ev] = fn; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 900 }), append() {} });
  const tuningText = fs.readFileSync(path.join(DIR, 'tuning.json'), 'utf8');
  const events = [];
  const win = {
    KURUMI_MODEL_URL: '/models/natori/natori_pro_t06.model3.json', Live2DCubismCore: {},
    PIXI: {
      Application: class { constructor() { this.renderer = { resize() {} }; this.stage = { addChild() {} }; this.ticker = {}; this.screen = { width: 800, height: 900 }; } stop() {} start() {} destroy() {} },
      Ticker: { shared: {} },
      live2d: { Live2DModel: { from: () => Promise.resolve(mdl) }, MotionPriority: { FORCE: 3, IDLE: 1 }, MotionPreloadStrategy: { ALL: 'ALL' } }
    },
    addEventListener() {}, dispatchEvent: e => { events.push(e.detail); }
  };
  const sb = {
    window: win, console, performance, setInterval: () => 0, clearInterval() {}, setTimeout, clearTimeout, Math, Promise, Object, Array, String, Number, JSON,
    document: { getElementById: el, hidden: false, addEventListener() {} },
    matchMedia: () => ({ matches: false }),
    fetch: async () => ({ ok: true, json: async () => JSON.parse(tuningText) }),
    ResizeObserver: class { observe() {} disconnect() {} },
    CustomEvent: class { constructor(n, o) { this.detail = o && o.detail; } },
    devicePixelRatio: 1
  };
  sb.globalThis = sb;
  Object.assign(sb, win);
  sb.window = sb;
  return { sb, calls, listeners, mdl, im, els, events };
}
const run = (h, file) => vm.runInNewContext(fs.readFileSync(path.join(RENDERER, 'js', file), 'utf8'), h.sb, { filename: file });
const settle = () => new Promise(r => setTimeout(r, 30));

test('avatar4.js: nạp model, đặt khung hình, thu nhỏ nhịp thở, trả về giao diện kurumiAvatar đầy đủ', async () => {
  const h = harness();
  run(h, 'motion-director4.js');
  run(h, 'avatar4.js');
  await settle();
  const a = h.sb.kurumiAvatar;
  assert.equal(a.ready, true);
  for (const k of ['look', 'setVoiceLevel', 'setMouth', 'perform', 'stopSpeech', 'holdStage', 'releaseStage', 'speechProgress', 'react']) {
    assert.equal(typeof a[k], 'function', 'thiếu ' + k);
  }
  assert.ok(Math.abs(h.mdl.s - (800 / 4000) * tuning.frame.zoom) < 1e-9);
  assert.ok(Math.abs(h.im.breath.getParameters()[0].peak - 15 * tuning.breathScale) < 1e-9);
  assert.equal(h.els.live2dCanvas.hidden, false);
});

test('avatar4.js: perform đổi biểu cảm đúng bảng tuning, tránh lặp, hết giờ thì về Normal', async () => {
  const h = harness();
  run(h, 'motion-director4.js');
  run(h, 'avatar4.js');
  await settle();
  h.sb.kurumiAvatar.perform('stern');
  assert.equal(h.calls.expr.at(-1), 'Angry');
  h.sb.kurumiAvatar.perform('warm');
  const first = h.calls.expr.at(-1);
  assert.ok(tuning.expressions.warm.includes(first));
  h.sb.kurumiAvatar.perform('warm');
  assert.notEqual(h.calls.expr.at(-1), first, 'không lặp lại biểu cảm vừa dùng');
  h.sb.kurumiAvatar.perform('không-có-hành-động-này');
  assert.equal(h.calls.expr.at(-1), 'Normal');
  h.sb.kurumiAvatar.stopSpeech();
  assert.equal(h.calls.expr.at(-1), 'Normal');
});

test('avatar4.js: mỗi khung hình ghi đúng tham số Cubism 4, miệng theo giọng, nhìn xuống khi chờ AI', async () => {
  const h = harness();
  run(h, 'motion-director4.js');
  run(h, 'avatar4.js');
  await settle();
  const a = h.sb.kurumiAvatar;
  const tick = () => h.listeners.beforeModelUpdate.forEach(f => f());
  a.perform('think');
  a.setVoiceLevel(0.8);
  for (let i = 0; i < 20; i++) tick();
  assert.ok(h.calls.set.ParamMouthOpenY > 0.05, 'miệng phải mở khi có giọng');
  assert.ok(h.calls.set.ParamMouthOpenY <= 1);
  assert.ok('ParamAngleZ' in h.calls.params && 'ParamEyeBallX' in h.calls.params);
  assert.ok(!Object.keys({ ...h.calls.params, ...h.calls.set }).some(k => k.startsWith('PARAM_')), 'không dùng tên tham số Cubism 2');
  a.look(tuning.lookDown);
  h.calls.set.ParamEyeBallY = undefined;
  for (let i = 0; i < 120; i++) tick();
  assert.ok(h.calls.set.ParamEyeBallY < -0.3, 'phải liếc xuống khung comment');
});

test('avatar4.js: chạm đầu phát motion head_pat và báo kurumi-touch (chống bấm dồn)', async () => {
  const h = harness();
  run(h, 'motion-director4.js');
  run(h, 'avatar4.js');
  await settle();
  h.sb.kurumiAvatar.react('head');
  assert.deepEqual(h.calls.motions.at(-1).slice(0, 1), ['head_pat']);
  assert.equal(h.calls.motions.at(-1)[2], 3);
  assert.equal(h.events.at(-1).zone, 'head');
  const n = h.calls.motions.length;
  h.sb.kurumiAvatar.react('body');
  assert.equal(h.calls.motions.length, n, 'cú chạm thứ hai trong 0,7 giây bị bỏ qua');
});

test('motion-director4.js: chỉ cho chọn nhóm có thật (không phải Idle), motion theo câu trả lời đè mọi thứ', async () => {
  const h = harness();
  run(h, 'motion-director4.js');
  run(h, 'avatar4.js');
  await settle();
  const m = h.sb.kurumiMotion;
  assert.deepEqual(m.catalog().sort(), ['body_swing', 'head_pat', 'tap']);
  m.speech('Idle');
  m.speech('khong_co');
  assert.equal(h.calls.motions.length, 0);
  m.speech('body_swing');
  assert.deepEqual(h.calls.motions.at(-1), ['body_swing', 0, 3]);
  // lắc thân dùng tham số Cubism 4
  h.listeners.beforeModelUpdate.forEach(f => f());
  assert.ok('ParamBodyAngleX' in h.calls.params);
});

test('avatar4.js: thiếu Cubism Core thì báo lỗi nhẹ nhàng, không ném lỗi ra ngoài', async () => {
  const h = harness();
  h.sb.Live2DCubismCore = undefined;
  run(h, 'avatar4.js');
  await settle();
  assert.equal(h.sb.kurumiAvatar.ready, false);
  assert.match(h.els.modelNotice.textContent, /Natori chưa chuyển động được/);
});
