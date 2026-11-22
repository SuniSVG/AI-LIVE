/*
 * Đạo diễn chuyển động của Kurumi (v1.9.0).
 *  - Nạp TRƯỚC avatar.js: bọc PIXI.live2d.Live2DModel.from để lấy được đối tượng model
 *    (avatar.js giữ model trong closure nên không truy cập được từ bên ngoài).
 *  - Chuyển động tự nhiên: thở và lắc thân nhẹ theo nhịp không tuần hoàn (cộng dồn lên giá trị motion).
 *  - Chuyển động tự do: khi rảnh, thỉnh thoảng chơi một motion ngẫu nhiên (không lặp nhóm vừa chạy).
 *  - Chuyển động theo câu trả lời: AI có thể chọn một motion cụ thể (đã được kiểm tra tên ở main process).
 *  - Tôn trọng "giảm chuyển động" của hệ điều hành: không chạy gì thêm khi bật.
 * Mọi tên tham số đều kiểm tra tồn tại trước khi ghi, nên model khác không có tham số này cũng không lỗi.
 */
(() => {
  'use strict';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T0 = performance.now();
  const PRIORITY_IDLE = 1;      // motion tự do: bị motion khác đè
  const PRIORITY_FORCE = 3;     // motion theo câu trả lời: đè mọi thứ

  const state = {
    model: null,
    free: true,
    speaking: false,
    last: '',
    nextAt: 0
  };

  const pickFree = (groups, last) => {
    if (!groups.length) return null;
    const pool = groups.length > 1 ? groups.filter(g => g !== last) : groups;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  function groups() {
    const defs = state.model?.internalModel?.motionManager?.definitions || {};
    return Object.keys(defs).filter(g => g !== 'idle' && Array.isArray(defs[g]) && defs[g].length);
  }

  function play(group, priority) {
    const m = state.model;
    if (!m || !group) return;
    const defs = m.internalModel.motionManager.definitions[group] || [];
    if (!defs.length) return;
    const index = Math.floor(Math.random() * defs.length);
    Promise.resolve(m.motion(group, index, priority)).catch(() => {});
  }

  // Chuyển động thở và lắc thân: cộng vào giá trị hiện tại nên không ghi đè motion đang chạy.
  function naturalMotion(core) {
    const t = (performance.now() - T0) / 1000;
    const has = name => core.getParamIndex(name) >= 0;
    const add = (name, v) => { if (has(name)) core.addToParamFloat(name, v); };
    // thở: nhịp ~3.8 giây, biên độ nhỏ
    add('PARAM_BREATH', 0.3 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 3.8)));
    // lắc thân: hai sóng lệch tần số để không lặp máy móc
    const sway = 1.6 * Math.sin(t * 0.61) + 0.9 * Math.sin(t * 1.37 + 1.3);
    add('PARAM_BODY_ANGLE_X', sway * 0.5);
    add('PARAM_BODY_ANGLE_Y', 0.3 * Math.sin(t * 0.43 + 0.7));
  }

  function attach(model) {
    state.model = model;
    if (!reduced) {
      model.internalModel.on('beforeModelUpdate', () => naturalMotion(model.internalModel.coreModel));
      state.nextAt = performance.now() + 6000;
      setInterval(tickFree, 500);
    }
  }

  // Chơi motion tự do khi rảnh: không chạy lúc đang nói, khi tab ẩn, hoặc khi người dùng tắt.
  function tickFree() {
    if (!state.model || !state.free || state.speaking || document.hidden) return;
    const now = performance.now();
    if (now < state.nextAt) return;
    state.nextAt = now + 9000 + Math.random() * 11000;
    const pick = pickFree(groups(), state.last);
    if (pick) { state.last = pick; play(pick, PRIORITY_IDLE); }
  }

  // Bọc hàm nạp model để lấy đối tượng model ngay khi Live2D tải xong.
  const Live2DModel = window.PIXI?.live2d?.Live2DModel;
  if (Live2DModel && typeof Live2DModel.from === 'function') {
    const originalFrom = Live2DModel.from;
    Live2DModel.from = function (...args) {
      return originalFrom.apply(this, args).then(model => { attach(model); return model; });
    };
  }

  window.kurumiMotion = {
    // Gọi khi bắt đầu đọc câu trả lời. `name` là motion AI chọn (đã được kiểm tra) hoặc null.
    speech(name) {
      state.speaking = true;
      if (!reduced && name && groups().includes(name)) play(name, PRIORITY_FORCE);
    },
    // Gọi khi đọc xong: chuyển động tự do được phép tiếp tục sau một khoảng nghỉ ngắn.
    speechEnd() {
      state.speaking = false;
      state.nextAt = Math.max(state.nextAt, performance.now() + 4000);
    },
    configure(c) {
      if (c && typeof c.free === 'boolean') state.free = c.free;
    },
    catalog: groups
  };
})();
