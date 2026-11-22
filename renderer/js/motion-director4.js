/*
 * Đạo diễn chuyển động cho nhân vật Live2D Cubism 4 (DeepSeek-chan). Giao diện window.kurumiMotion
 * dùng chung cho sân khấu, dùng API và tên tham số của Cubism 4.
 *  - Nạp TRƯỚC avatar4.js: bọc PIXI.live2d.Live2DModel.from để lấy đối tượng model.
 *  - Lắc thân rất nhẹ cộng lên giá trị hiện tại (thở đã có sẵn trong thư viện, avatar4.js chỉnh nhỏ lại).
 *  - Motion đều có Loop trong file, nên app tự quyết định khi nào dừng:
 *      "once"  : chạy đúng một chu kỳ (Meta.Duration trong file) rồi về Idle
 *      "loop"  : lặp trong vài giây rồi về Idle
 *    Motion tự do chọn ngẫu nhiên giữa hai kiểu; tuning.motionModes ghi đè theo từng nhóm.
 *  - Khi nói, AI có thể chọn một motion: chạy một chu kỳ (tối đa 6 giây) và dừng ngay khi đọc xong.
 *  - Tôn trọng "giảm chuyển động" của hệ điều hành.
 */
(() => {
  'use strict';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T0 = performance.now();
  const PRIORITY_IDLE = 1;     // motion Idle chạy nền
  // motion tự do phải cao hơn Idle (cùng mức thì Cubism từ chối phát). Thấp hơn FORCE nên không đè câu trả lời.
  const PRIORITY_FREE = 2;
  const PRIORITY_FORCE = 3;    // motion theo câu trả lời hoặc chạm: đè mọi thứ
  const FREE_EVERY_MS = 15000; // trung bình 15 giây một motion, thực tế dao động 9–24 giây
  const FREE_LOOP_MIN = 2.5;   // kiểu "lặp theo thời gian": 2,5–6 giây
  const FREE_LOOP_MAX = 6;
  const FORCE_MAX_SEC = 6;     // motion theo câu nói không chạy quá 6 giây

  const state = {
    model: null, free: true, speaking: false, last: '', nextAt: 0, every: FREE_EVERY_MS,
    sway: { bodyX: 0.35, bodyY: 0.25 }, modes: {}, token: 0, curPriority: 0
  };

  const isIdle = g => /^idle$/i.test(g);
  function groups() {
    const defs = state.model?.internalModel?.motionManager?.definitions || {};
    return Object.keys(defs).filter(g => !isIdle(g) && Array.isArray(defs[g]) && defs[g].length);
  }

  // Độ dài một chu kỳ của nhóm motion (giây), đọc Meta.Duration trong file .motion3.json. Mặc định 2 giây.
  const durCache = {};
  function durationOf(group) {
    if (!durCache[group]) durCache[group] = (async () => {
      try {
        const defs = state.model?.internalModel?.motionManager?.definitions?.[group] || [];
        const file = defs[0] && (defs[0].File || defs[0].file);
        const base = String(window.KURUMI_MODEL_URL || '').replace(/[^/]*$/, '');
        if (!file || !base) return 2;
        const j = await (await fetch(base + file, { cache: 'no-cache' })).json();
        const d = Number(j?.Meta?.Duration);
        return d > 0 ? d : 2;
      } catch (_) {
        return 2;
      }
    })();
    return durCache[group];
  }

  // Kiểu chạy cho một motion tự do: tuning.motionModes ghi đè, nếu không thì ngẫu nhiên
  function modeFor(group) {
    const o = String(state.modes[group] || '').trim().toLowerCase();
    if (o === 'once') return { kind: 'once' };
    const m = o.match(/^loop(?::([\d.]+))?$/);
    if (m) return { kind: 'loop', sec: Math.max(1, Math.min(60, Number(m[1]) || FREE_LOOP_MIN)) };
    if (Math.random() < 0.5) return { kind: 'once' };
    return { kind: 'loop', sec: FREE_LOOP_MIN + Math.random() * (FREE_LOOP_MAX - FREE_LOOP_MIN) };
  }

  // Dừng motion hiện tại. Idle tự chạy lại khi không còn motion nào.
  function stopNow() {
    state.token++;
    state.curPriority = 0;
    state.model?.internalModel?.motionManager?.stopAllMotions?.();
  }

  // Chạy một motion theo kiểu đã chọn. Hết thời gian mà không có motion nào mới thì dừng và về Idle.
  function play(group, priority, mode) {
    const m = state.model;
    if (!m || !group) return;
    const mm = m.internalModel.motionManager;
    const defs = mm.definitions[group] || [];
    if (!defs.length) return;
    // motion tự do thường có Loop: dừng motion đang chạy trước để motion mới vào được
    if (priority !== PRIORITY_FORCE) mm.stopAllMotions?.();
    const my = ++state.token;
    state.curPriority = priority;
    Promise.resolve(m.motion(group, Math.floor(Math.random() * defs.length), priority)).catch(() => {});
    durationOf(group).then(dur => {
      if (my !== state.token) return;   // đã có motion mới hoặc đã dừng
      const cap = priority === PRIORITY_FORCE ? FORCE_MAX_SEC : Infinity;
      const span = mode.kind === 'loop' ? mode.sec : Math.min(dur, cap);
      setTimeout(() => { if (my === state.token) stopNow(); }, span * 1000);
    });
  }

  // Lắc thân: hai sóng lệch tần số để không lặp máy móc. Cộng thêm nên không ghi đè motion đang chạy.
  function naturalMotion(core) {
    const t = (performance.now() - T0) / 1000;
    const sway = 1.6 * Math.sin(t * 0.61) + 0.9 * Math.sin(t * 1.37 + 1.3);
    core.addParameterValueById('ParamBodyAngleX', sway * state.sway.bodyX);
    core.addParameterValueById('ParamBodyAngleY', Math.sin(t * 0.43 + 0.7) * state.sway.bodyY);
  }

  // Khoảng chờ ngẫu nhiên (60%–150% của mốc) để nhịp motion không đều máy móc
  const nextGap = () => state.every * (0.6 + Math.random() * 0.9);

  function tickFree() {
    if (!state.model || !state.free || state.speaking || document.hidden) return;
    const now = performance.now();
    if (now < state.nextAt) return;
    state.nextAt = now + nextGap();
    const g = groups();
    if (!g.length) return;
    const pool = g.length > 1 ? g.filter(x => x !== state.last) : g;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    state.last = pick;
    play(pick, PRIORITY_FREE, modeFor(pick));
  }

  function attach(model) {
    state.model = model;
    if (reduced) return;
    model.internalModel.on('beforeModelUpdate', () => naturalMotion(model.internalModel.coreModel));
    state.nextAt = performance.now() + nextGap();
    setInterval(tickFree, 500);
  }

  const Live2DModel = window.PIXI?.live2d?.Live2DModel;
  if (Live2DModel && typeof Live2DModel.from === 'function') {
    const originalFrom = Live2DModel.from;
    Live2DModel.from = function (...args) {
      return originalFrom.apply(this, args).then(model => { attach(model); return model; });
    };
  }

  window.kurumiMotion = {
    speech(name) {
      state.speaking = true;
      if (!reduced && name && groups().includes(name)) play(name, PRIORITY_FORCE, { kind: 'once' });
    },
    speechEnd() {
      state.speaking = false;
      // motion theo câu nói dừng cùng lúc với giọng, rồi Idle chạy tiếp
      if (state.curPriority === PRIORITY_FORCE) stopNow();
      state.nextAt = Math.max(state.nextAt, performance.now() + 4000);
    },
    // chạy đúng một lần rồi về Idle (dùng cho chạm đầu/thân)
    once(group) {
      if (!reduced && group && groups().includes(group)) play(group, PRIORITY_FORCE, { kind: 'once' });
    },
    configure(c) {
      if (c && typeof c.free === 'boolean') state.free = c.free;
      if (c && c.sway) state.sway = { ...state.sway, ...c.sway };
      if (c && c.modes && typeof c.modes === 'object') state.modes = c.modes;
      if (c && Number.isFinite(c.freeEverySec) && c.freeEverySec >= 3) state.every = c.freeEverySec * 1000;
    },
    catalog: groups
  };
})();
