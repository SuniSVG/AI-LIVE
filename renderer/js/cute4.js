/*
 * Cử chỉ "cute" và tự nhiên cho DeepSeek-chan (Cubism 4). Không cần art mới: mỗi cử chỉ là một đường cong
 * cộng thêm lên các tham số (góc đầu, thân, mắt), chạy cùng motion, thở và physics nên không đè chuyển động gốc.
 *  - react(cảm xúc): mỗi cảm xúc có cử chỉ riêng (vui nhún nhẹ, ngại nghiêng người, giật mình ngả ra sau...).
 *  - Lúc rảnh: thỉnh thoảng nghiêng đầu tò mò, gật nhẹ, lắc người như đang ngân nga (chọn ngẫu nhiên, lệch nhịp).
 *  - tuning.json "cute": amp (cường độ chung) và idleMinSec / idleMaxSec (khoảng giữa hai cử chỉ rảnh).
 * Mọi cử chỉ có biên độ về 0 ở hai đầu nên không bị giật khi bắt đầu hay kết thúc.
 */
(() => {
  'use strict';

  const PARAM = {
    angleX: 'ParamAngleX', angleY: 'ParamAngleY', angleZ: 'ParamAngleZ',
    bodyX: 'ParamBodyAngleX', bodyY: 'ParamBodyAngleY', bodyZ: 'ParamBodyAngleZ',
    eyeX: 'ParamEyeBallX', eyeY: 'ParamEyeBallY'
  };

  // env = sin(pi*t): 0 ở hai đầu, 1 ở giữa. Mọi cử chỉ nhân với env để mềm đầu và cuối.
  const GESTURES = {
    // nhún nhẹ theo nhịp, như đang vui
    bounce: { dur: 1.1, f: (t, e) => ({ bodyY: 4.5 * Math.sin(2 * Math.PI * 1.4 * t) * e, angleY: 2.5 * Math.sin(2 * Math.PI * 1.4 * t) * e }) },
    // gật nhẹ hai ba lần, như đồng ý
    nod: { dur: 0.9, f: (t, e) => ({ angleY: 7 * Math.sin(2 * Math.PI * 1.5 * t) * e }) },
    // nghiêng đầu sang trái/phải, tò mò hoặc tinh nghịch
    tiltL: { dur: 1.6, f: (t, e) => ({ angleZ: 9 * e, angleX: -2 * e, eyeX: 0.25 * e }) },
    tiltR: { dur: 1.6, f: (t, e) => ({ angleZ: -9 * e, angleX: 2 * e, eyeX: -0.25 * e }) },
    // ngại: cúi đầu nghiêng người, nhìn đi chỗ khác
    shy: { dur: 2.0, f: (t, e) => ({ angleZ: -7 * e, angleY: -4 * e, bodyZ: -4 * e, bodyX: -2.5 * e, eyeX: -0.35 * e }) },
    // lắc người nhẹ, như đang ngân nga
    wiggle: { dur: 1.8, f: (t, e) => ({ bodyX: 5 * Math.sin(2 * Math.PI * t) * e, angleZ: 4 * Math.sin(2 * Math.PI * t + 0.8) * e, bodyY: 1.5 * e }) },
    // giật mình: ngả đầu ra sau rồi bật lên nhanh
    startle: { dur: 0.8, f: (t, e) => ({ angleY: -9 * Math.sin(Math.PI * t) * (1 - 0.5 * t), bodyY: 3 * e }) },
    // buồn, rũ xuống
    droop: { dur: 2.2, f: (t, e) => ({ angleY: -7 * e, bodyY: -3 * e, angleZ: 3 * e }) }
  };

  // cảm xúc -> các cử chỉ chạy kèm (mảng rỗng = không có cử chỉ thêm)
  const ACTION_GESTURES = {
    neutral: [],
    warm: ['nod'],
    happy: ['bounce', 'nod'],
    shy: ['shy'],
    love: ['wiggle'],
    tease: ['tiltL'],
    think: ['tiltR'],
    flustered: ['shy'],
    surprise: ['startle'],
    sad: ['droop'],
    sleepy: ['droop'],
    stern: [],
    zafkiel: ['nod']
  };

  const IDLE_POOL = ['tiltR', 'tiltL', 'nod', 'wiggle'];
  const MAX_ACTIVE = 3;
  const CLAMP = 12;

  function evaluate(name, t) {
    const g = GESTURES[name];
    return g.f(t, Math.sin(Math.PI * t));
  }

  // Chạy trong Node (test): chỉ xuất dữ liệu, không đụng tới trình duyệt
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PARAM, GESTURES, ACTION_GESTURES, IDLE_POOL, evaluate };
    return;
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { amp: 1, active: [], nextIdleAt: 0, minSec: 9, maxSec: 16 };
  const own = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

  function start(name, now) {
    if (!own(GESTURES, name)) return;
    state.active.push({ name, t0: now, dur: GESTURES[name].dur * 1000 });
    if (state.active.length > MAX_ACTIVE) state.active.shift();
  }

  // Cộng các cử chỉ đang chạy lên tham số. Chạy trước khi Cubism cập nhật (cùng chỗ với lắc thân).
  function apply(core) {
    const now = performance.now();
    if (!state.active.length && now >= state.nextIdleAt && !document.hidden) {
      start(IDLE_POOL[Math.floor(Math.random() * IDLE_POOL.length)], now);
      state.nextIdleAt = now + (state.minSec + Math.random() * (state.maxSec - state.minSec)) * 1000;
    }
    state.active = state.active.filter(g => now - g.t0 < g.dur);
    if (!state.active.length || state.amp <= 0) return;
    const sum = {};
    for (const g of state.active) {
      const v = evaluate(g.name, (now - g.t0) / g.dur);
      for (const k of Object.keys(v)) sum[k] = (sum[k] || 0) + v[k];
    }
    for (const k of Object.keys(sum)) {
      const val = Math.max(-CLAMP, Math.min(CLAMP, sum[k])) * state.amp;
      core.addParameterValueById(PARAM[k], val);
    }
  }

  function attach(model) {
    if (reduced) return;
    model.internalModel.on('beforeModelUpdate', () => apply(model.internalModel.coreModel));
    state.nextIdleAt = performance.now() + 6000;
  }

  const Live2DModel = window.PIXI?.live2d?.Live2DModel;
  if (Live2DModel && typeof Live2DModel.from === 'function') {
    const originalFrom = Live2DModel.from;
    Live2DModel.from = function (...args) {
      return originalFrom.apply(this, args).then(model => { attach(model); return model; });
    };
  }

  window.kurumiCute = {
    react(action) {
      if (reduced || state.amp <= 0) return;
      const now = performance.now();
      const list = own(ACTION_GESTURES, action) ? ACTION_GESTURES[action] : [];
      for (const n of list) start(n, now);
    },
    configure(c) {
      if (!c) return;
      if (Number.isFinite(c.amp)) state.amp = Math.max(0, Math.min(1.5, c.amp));
      if (Number.isFinite(c.idleMinSec) && c.idleMinSec >= 2) state.minSec = c.idleMinSec;
      if (Number.isFinite(c.idleMaxSec) && c.idleMaxSec >= state.minSec) state.maxSec = c.idleMaxSec;
    }
  };
})();
