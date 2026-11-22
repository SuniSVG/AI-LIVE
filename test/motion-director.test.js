'use strict';
// Chạy renderer/js/motion-director.js trong môi trường giả (không có Electron/PIXI thật).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load({ reduced = false } = {}) {
  const calls = [];
  const sharedModel = makeModel();
  class Live2DModel {
    static from(url) { return Promise.resolve(sharedModel); }
  }
  function makeModel() {
    const listeners = {};
    const coreParams = {};
    const core = {
      getParamIndex: n => (n.startsWith('PARAM_') ? 1 : -1),
      addToParamFloat: (n, v) => { coreParams[n] = (coreParams[n] || 0) + v; }
    };
    const model = {
      internalModel: {
        coreModel: core,
        motionManager: { definitions: { idle: [{}], id4: [{}, {}], id4_2: [{}] } },
        on: (ev, fn) => { listeners[ev] = fn; }
      },
      motion: (g, i, p) => { calls.push({ g, i, p }); return Promise.resolve(true); },
      _listeners: listeners,
      _params: coreParams
    };
    return model;
  }
  const window = {
    PIXI: { live2d: { Live2DModel, MotionPriority: { IDLE: 1, FORCE: 3 } } }
  };
  const ctx = {
    window, console,
    matchMedia: () => ({ matches: reduced }),
    performance: { now: () => 0 },
    document: { hidden: false },
    Math, Promise, setInterval: () => 0,
    AbortSignal: undefined
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'js', 'motion-director.js'), 'utf8'), ctx);
  return { ctx, window, calls, Live2DModel, model: sharedModel };
}

test('bọc Live2DModel.from: model được nạp đúng và lấy được đối tượng', async () => {
  const { window, Live2DModel } = load();
  const model = await Live2DModel.from('x.json');
  assert.ok(model && model.internalModel);
  assert.equal(typeof window.kurumiMotion.speech, 'function');
});

test('speech: chạy đúng motion AI chọn ở mức FORCE, bỏ qua tên lạ', async () => {
  const { window, Live2DModel, calls } = load();
  await Live2DModel.from('x.json');
  window.kurumiMotion.speech('id4_2');
  assert.deepEqual(calls.at(-1), { g: 'id4_2', i: 0, p: 3 });
  const n = calls.length;
  window.kurumiMotion.speech('nope');
  assert.equal(calls.length, n);
  window.kurumiMotion.speech(null);
  assert.equal(calls.length, n);
});

test('chuyển động thở và lắc thân được cộng vào tham số thật của model', async () => {
  const { Live2DModel, model } = load();
  await Live2DModel.from('x.json');
  // hook beforeModelUpdate được gắn khi attach
  model._listeners.beforeModelUpdate();
  assert.ok('PARAM_BREATH' in model._params);
  assert.ok('PARAM_BODY_ANGLE_X' in model._params);
});

test('giảm chuyển động: không ghi tham số tự nhiên, không chạy motion đoán', async () => {
  const { window, Live2DModel, calls, model } = load({ reduced: true });
  await Live2DModel.from('x.json');
  assert.equal(model._listeners.beforeModelUpdate, undefined);   // không gắn hook chuyển động
  assert.deepEqual({ ...model._params }, {});
  window.kurumiMotion.speech('id4_2');
  assert.equal(calls.length, 0);
});

test('configure: tắt chuyển động tự do là ghi nhận', () => {
  const { window } = load();
  assert.doesNotThrow(() => window.kurumiMotion.configure({ free: false }));
  assert.equal(window.kurumiMotion.catalog().length, 0);
});
