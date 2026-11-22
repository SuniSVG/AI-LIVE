/*
 * Avatar Live2D Cubism 4 (DeepSeek-chan). Giao diện window.kurumiAvatar dùng chung cho sân khấu (stage.js).
 * Mọi hiệu chỉnh riêng của nhân vật nằm ở models/deepseek/tuning.json:
 *  - biểu cảm: mỗi hành động (neutral, warm, ...) chọn một trong các file .exp3.json của model
 *  - cử chỉ đầu/mắt theo hành động, miệng khớp giọng, nhìn xuống khung comment
 *  - khung hình (sân khấu lấy phần trên của model), chạm đầu/thân để nhân vật phản ứng
 * Nhân vật Cubism 4 dùng tên tham số ParamAngleX, ParamEyeLOpen, ... (khác PARAM_ANGLE_X của Cubism 2 cũ).
 * Mọi giá trị chỉ được CỘNG lên motion/biểu cảm đang chạy (trừ miệng), nên không phá chuyển động gốc.
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('live2dCanvas'), portrait = $('portrait'), notice = $('modelNotice'), still = $('avatar');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = list => list[Math.floor(Math.random() * list.length)];

  const SIZE_BOOST = 1.3;
const DEFAULT_TUNE = {
    frame: { zoom: 1.12, offsetY: 0.02 }, holdSec: 12, breathScale: 0.35, mouth: { open: 0.95, nod: 1.2 },
    expressions: { neutral: ['Normal'] }, pose: {}, touch: {}, lookDown: { eyeY: -0.7, headY: -6 }
  };

  let app = null, model = null, tune = DEFAULT_TUNE, ro = null, ready = false;
  let voice = 0, voiceAt = 0, mouth = 0, mouthForm = 0;
  let action = 'neutral', holdUntil = 0, holding = false, weight = 0;
  let variant = {}, cur = {}, started = 0, lastExp = '', lastT = 0;
  let LOOK = null, LW = 0, lastTouch = -Infinity, lastMotion = '';
  let glanceUntil = 0;
  // ánh mắt tự đảo khi rảnh: đích đổi ngẫu nhiên mỗi 2–5 giây
  const gz = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };

  const PARAMS = { angleX: 'ParamAngleX', angleY: 'ParamAngleY', angleZ: 'ParamAngleZ', gazeX: 'ParamEyeBallX', gazeY: 'ParamEyeBallY' };
  // liếc xuống khung comment khi có comment mới (ngắn, không kéo dài)
  const GLANCE = { eyeY: -0.55, headY: -3 };

  async function loadTuning(modelUrl) {
    try {
      const r = await fetch(modelUrl.replace(/[^/]*$/, '') + 'tuning.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      return { ...DEFAULT_TUNE, ...j, frame: { ...DEFAULT_TUNE.frame, ...(j.frame || {}) }, mouth: { ...DEFAULT_TUNE.mouth, ...(j.mouth || {}) } };
    } catch (e) {
      console.warn('Không đọc được tuning.json, dùng mặc định:', e.message);
      return DEFAULT_TUNE;
    }
  }

  function setExpression(name) {
    const em = model?.internalModel?.motionManager?.expressionManager;
    if (!em || !name) return;
    Promise.resolve(em.setExpression(name)).catch(() => {});
  }

  // chạm: chạy đúng một lần rồi về Idle (không lặp mãi)
  function playMotion(group) {
    if (!ready || reduced || !group) return;
    lastMotion = group;
    window.kurumiMotion?.once(group);
  }

  function perform(a) {
    const names = tune.expressions || {};
    action = names[a] ? a : 'neutral';
    const list = names[action] || ['Normal'];
    const pool = list.length > 1 ? list.filter(n => n !== lastExp) : list;
    lastExp = rnd(pool);
    setExpression(lastExp);
    const poses = (tune.pose || {})[action] || [{}];
    variant = rnd(poses);
    started = performance.now();
    holdUntil = started + (tune.holdSec || 12) * 1000;
    portrait.dataset.action = action;
    window.kurumiCute?.react(action);   // cử chỉ kèm theo cảm xúc (vui nhún, ngại nghiêng...)
  }

  function relax() {
    action = 'neutral';
    holdUntil = 0;
    variant = {};
    lastExp = (tune.expressions.neutral || ['Normal'])[0];
    setExpression(lastExp);
    portrait.dataset.action = 'neutral';
  }

  function fit() {
    if (!app || !model) return;
    const w = Math.max(1, portrait.clientWidth), h = Math.max(1, portrait.clientHeight);
    app.renderer.resize(w, h);
    const mw = model.internalModel.width, mh = model.internalModel.height;
    const f = tune.frame;
    // model rất cao: lấy vừa khít chiều ngang rồi phóng nhẹ, neo ở đỉnh để thấy đầu và thân trên
    // SIZE_BOOST: nhân vật lớn hơn trên sân khấu (đã bỏ bảng comment nên có thêm chỗ)
    const scale = (w / mw) * (f.zoom || 1) * SIZE_BOOST;
    model.scale.set(scale);
    model.anchor.set(0.5, 0);
    model.position.set(w / 2, (f.offsetY || 0) * h);
    void mh;
  }

  // chạy mỗi khung hình, SAU motion/biểu cảm/vật lý và TRƯỚC khi vẽ
  function tick() {
    const core = model.internalModel.coreModel;
    const now = performance.now();
    const dt = Math.min(0.04, Math.max(0.001, (now - (lastT || now - 16)) / 1000));
    lastT = now;
    const add = (id, v) => core.addParameterValueById(id, v);
    const get = id => core.getParameterValueById(id);

    // miệng: đo âm lượng giọng đọc; thả chậm hơn lúc mở
    const target = now - voiceAt > 250 ? 0 : voice;
    mouth += (target - mouth) * (1 - Math.exp(-dt * (target > mouth ? 24 : 13)));
    if (mouth > 0.01) core.setParameterValueById('ParamMouthOpenY', Math.max(get('ParamMouthOpenY'), clamp(mouth * (tune.mouth.open || 0.95), 0, 1)));
    if (mouthForm) add('ParamMouthForm', mouthForm * 0.65);

    // đang nói thì giữ biểu cảm thêm; hết hạn thì về bình thường
    if (holdUntil && now > holdUntil && !holding) relax();
    if (holdUntil && now - voiceAt < 200 && voice > 0.015) holdUntil = Math.max(holdUntil, now + 1200);
    weight += ((holdUntil ? 1 : 0) - weight) * (1 - Math.exp(-4 * dt));

    // cử chỉ đầu/mắt theo hành động (cộng thêm, mềm dần), nhún đầu nhẹ khi nói
    const k = 1 - Math.exp(-4 * dt);
    for (const key of Object.keys(PARAMS)) {
      const want = holdUntil ? (variant[key] || 0) : 0;
      cur[key] = (cur[key] || 0) + (want - (cur[key] || 0)) * k;
    }
    const d = (now - started) / 1000;
    const nod = holdUntil && !reduced ? Math.sin(3.2 * d) * Math.min(0.7, voice) * (tune.mouth.nod || 1.2) : 0;
    if (!reduced) {
      add('ParamAngleZ', cur.angleZ * 0.65 * weight);
      add('ParamAngleY', cur.angleY * 0.65 * weight + nod);
      add('ParamAngleX', cur.angleX * 0.65 * weight);
      add('ParamBodyAngleZ', cur.angleZ * 0.12 * weight);
    }
    // đầu lắc nhẹ khi rảnh: sóng lệch tần số, cộng thêm lên góc đầu (không ghi đè motion)
    if (!reduced && !holdUntil) {
      const hs = tune.headSway || { x: 4, y: 2.5, z: 3 };
      const t = now / 1000;
      add('ParamAngleX', hs.x * (0.7 * Math.sin(t * 0.53) + 0.3 * Math.sin(t * 1.31 + 0.9)));
      add('ParamAngleY', hs.y * (0.6 * Math.sin(t * 0.41 + 1.7) + 0.4 * Math.sin(t * 0.97)));
      add('ParamAngleZ', hs.z * (0.6 * Math.sin(t * 0.37 + 2.2) + 0.4 * Math.sin(t * 1.09 + 0.4)));
    }
    add('ParamEyeBallX', cur.gazeX * 0.8 * weight);
    add('ParamEyeBallY', cur.gazeY * 0.8 * weight);

    // ánh mắt đảo nhẹ khi rảnh (không đang nói, không đang liếc khung comment)
    const idleNow = !reduced && !holdUntil && !LOOK && now >= glanceUntil;
    if (idleNow && now > gz.next) {
      gz.tx = (Math.random() - 0.5) * 0.7;
      gz.ty = (Math.random() - 0.5) * 0.35;
      gz.next = now + 2000 + Math.random() * 3000;
    }
    const gk = 1 - Math.exp(-3 * dt);
    gz.x += ((idleNow ? gz.tx : 0) - gz.x) * gk;
    gz.y += ((idleNow ? gz.ty : 0) - gz.y) * gk;
    add('ParamEyeBallX', gz.x);
    add('ParamEyeBallY', gz.y);

    // nhìn xuống khung comment khi đang chờ AI
    const look = LOOK || (now < glanceUntil ? GLANCE : null);
    LW += ((look ? 1 : 0) - LW) * (1 - Math.exp(-4 * dt));
    if (LW > 0.001) {
      const L = look || { eyeY: 0, headY: 0 };
      const ey = get('ParamEyeBallY'), ay = get('ParamAngleY');
      core.setParameterValueById('ParamEyeBallY', ey + (L.eyeY - ey) * LW);
      core.setParameterValueById('ParamAngleY', ay + (L.headY - ay) * LW);
    }
  }

  function touch(zone) {
    if (performance.now() - lastTouch < 700) return;
    lastTouch = performance.now();
    window.dispatchEvent(new CustomEvent('kurumi-touch', { detail: { zone } }));
    playMotion((tune.touch || {})[zone] || (tune.touch || {}).body);
  }

  window.kurumiAvatar = {
    look(v) { LOOK = v || null; },
    // comment mới: liếc xuống khung comment một lúc rồi nhìn lại khán giả
    glance() { if (!reduced && !LOOK && !holding) glanceUntil = performance.now() + 1300; },
    setVoiceLevel(v) { voice = clamp(v || 0, 0, 1); voiceAt = performance.now(); },
    setMouth(m) { mouthForm = (m && m.form) || 0; },
    perform,
    stopSpeech() { holding = false; relax(); },
    holdStage() { holding = true; },
    releaseStage() { holding = false; perform('tease'); },
    speechProgress() {},
    react: touch,
    get ready() { return ready; }
  };

  window.addEventListener('pagehide', () => {
    ready = false;
    ro?.disconnect();
    app?.destroy(false, { children: true, texture: true, baseTexture: true });
  });

  (async function init() {
    try {
      if (!window.PIXI?.live2d || !window.Live2DCubismCore) throw new Error('Không tải được thư viện Live2D Cubism 4.');
      const url = window.KURUMI_MODEL_URL;
      if (!url) throw new Error('Thiếu đường dẫn model.');
      tune = await loadTuning(url);
      window.kurumiMotion?.configure({ sway: tune.sway, freeEverySec: tune.freeEverySec || 15, modes: tune.motionModes || {} });
      window.kurumiCute?.configure(tune.cute || {});

      app = new PIXI.Application({
        view: canvas, width: Math.max(portrait.clientWidth, 1), height: Math.max(portrait.clientHeight, 1),
        backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true
      });
      app.ticker.maxFPS = 60;
      PIXI.Ticker.shared.maxFPS = 60;

      model = await PIXI.live2d.Live2DModel.from(url, { autoInteract: false, autoUpdate: true, motionPreload: PIXI.live2d.MotionPreloadStrategy.ALL });
      app.stage.addChild(model);

      const im = model.internalModel;
      // thở mặc định của thư viện lắc đầu khá mạnh: thu nhỏ cho hợp nhân vật
      for (const p of im.breath?.getParameters?.() || []) p.peak *= tune.breathScale;
      im.on('beforeModelUpdate', tick);
      // drawable không có tham số điều khiển nhưng vẫn hiện (ví dụ vết trên mũi): ép opacity 0 sau mỗi lần Core cập nhật
      // (coreModel của plugin là lớp bọc; Core model thật nằm ở _model và là nơi chứa drawables)
      try {
        const hide = Array.isArray(tune.hideDrawables) ? tune.hideDrawables : [];
        const wrap = im.coreModel;
        const raw = wrap && (wrap._model || wrap);
        const ids = raw && raw.drawables ? Array.from(raw.drawables.ids) : [];
        const idx = hide.map(n => ids.indexOf(n)).filter(i => i >= 0);
        if (idx.length && typeof wrap.update === 'function') {
          const origUpdate = wrap.update.bind(wrap);
          wrap.update = function () {
            origUpdate();
            for (const i of idx) raw.drawables.opacities[i] = 0;
          };
        }
      } catch (e) {
        console.warn('Không ẩn được drawable thừa:', e.message);
      }

      canvas.hidden = false;
      still.hidden = true;
      notice.textContent = 'DeepSeek-chan đã đến';
      notice.classList.add('ready');
      portrait.classList.add('live2d-ready');
      fit();
      ro = new ResizeObserver(fit);
      ro.observe(portrait);
      ready = true;
      relax();

      // nhìn theo con trỏ chuột (nhẹ) và chạm đầu/thân
      canvas.addEventListener('pointermove', e => {
        if (reduced) return;
        const r = canvas.getBoundingClientRect();
        im.focusController.focus(1.3 * ((e.clientX - r.left) / r.width - 0.5), 1.1 * (0.5 - (e.clientY - r.top) / r.height));
      });
      canvas.addEventListener('pointerleave', () => im.focusController.focus(0, 0));
      let down = null;
      canvas.addEventListener('pointerdown', e => { down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() }; });
      canvas.addEventListener('pointercancel', () => { down = null; });
      canvas.addEventListener('pointerup', e => {
        const s = down; down = null;
        if (!s || s.id !== e.pointerId || performance.now() - s.t > 650 || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) return;
        const r = canvas.getBoundingClientRect();
        const hits = model.hitTest((e.clientX - r.left) * app.screen.width / r.width, (e.clientY - r.top) * app.screen.height / r.height);
        if (hits.includes('head')) touch('head');
        else if (hits.includes('body')) touch('body');
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { app.stop(); model.autoUpdate = false; }
        else { lastT = 0; app.start(); model.autoUpdate = true; }
      });
    } catch (err) {
      console.error('Live2D (Cubism 4) load failed:', err);
      app?.destroy(false, { children: true, texture: true, baseTexture: true });
      app = null;
      canvas.hidden = true;
      still.hidden = false;
      still.classList.add('static-fallback');
      notice.textContent = 'DeepSeek-chan chưa chuyển động được. Bạn thử tải lại trang nhé.';
      notice.classList.add('failed');
    }
  })();
})();
