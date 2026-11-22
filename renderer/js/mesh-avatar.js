/* Renderer cho nhân vật lưới (Nam Sĩ): vẽ từng part bằng PIXI.SimpleMesh rồi biến dạng đỉnh mỗi khung hình.
 * Giao diện giống avatar.js của Kurumi (window.kurumiAvatar) để sân khấu dùng chung một cách gọi.
 *
 * Chuyển động:
 *  - lò xo (spring) cho tóc và tay áo: trễ và đung đưa tự nhiên khi nhân vật nghiêng hoặc quay đầu
 *  - nhìn theo con trỏ chuột trên sân khấu, có độ trễ mượt
 *  - thở, chớp mắt ngẫu nhiên (đôi khi chớp đôi), dao động nhẹ khi đứng yên
 *  - biểu cảm chuyển mượt, miệng theo âm lượng giọng đọc
 */
(() => {
'use strict';

const W = 1024, H = 1536;
// Vùng hiển thị: từ trên đầu tới ngang thắt lưng (không hiện chân)
const VIEW = { x: 120, y: 0, w: 800, h: 620 };   // bao trọn tay áo và tua (x 151..897)
const FADE_PX = 70;                                // độ dài mờ dần ở đáy vùng hiển thị
const YAW_MAX = 0.5;       // ~29 độ mỗi bên
const PITCH_MAX = 7;       // px
const ROLL_MAX = 0.06;     // rad
const MODEL_URL = '/models/nam-si/character_mesh.json';
const HOLD_MS = 12000;

const canvas = document.getElementById('live2dCanvas');
const portrait = document.getElementById('portrait');
const notice = document.getElementById('modelNotice');
const imgEl = document.getElementById('avatar');
const MW = window.MeshWarp;

const EXPR = Object.freeze({
  neutral:  { eye: 1.00, smile: 0.05, tilt: 0.00 },
  warm:     { eye: 0.84, smile: 0.45, tilt: 0.05 },
  tease:    { eye: 0.72, smile: 0.30, tilt: -0.09 },
  think:    { eye: 0.82, smile: 0.00, tilt: 0.11 },
  surprise: { eye: 1.12, smile: -0.10, tilt: -0.05 },
  stern:    { eye: 0.80, smile: -0.25, tilt: 0.00 },
  zafkiel:  { eye: 0.72, smile: 0.15, tilt: -0.12 }
});

let app = null, root = null, ready = false;
let parts = [];
let target = EXPR.neutral;
let holdUntil = 0;
let voice = 0;
let look = null;                 // { eyeY, headY } khi cúi nhìn khung comment
let pointer = { x: 0, y: 0 };    // con trỏ trên sân khấu, chuẩn hoá -1..1
const cur = { eye: 1, smile: 0.05, tilt: 0, mouth: 0, pitch: 0, gazeX: 0, gazeY: 0, lookX: 0, lookY: 0, yaw: 0 };
const spring = { hair: { x: 0, v: 0 }, sleeve: { x: 0, v: 0 } };
let blinkAt = 1800, blinkStart = -1, blinkCount = 0;
let lastNow = performance.now();
const t0 = performance.now();
const out = [0, 0];

const ease = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-dt * rate));
// lò xo tắt dần: kéo về 0, có lực đẩy `force`
function stepSpring(s, force, k, c, dt) {
  s.v += (-k * s.x - c * s.v + force) * dt;
  s.x += s.v * dt;
  s.x = Math.max(-14, Math.min(14, s.x));
}

function loadTexture(url) {
  const bt = PIXI.BaseTexture.from(url);
  if (bt.valid) return Promise.resolve(new PIXI.Texture(bt));
  return new Promise((ok, fail) => {
    bt.once('loaded', () => ok(new PIXI.Texture(bt)));
    bt.once('error', () => fail(new Error('Không đọc được ảnh ' + url)));
  });
}

async function build(data) {
  const base = '/models/nam-si/';
  const texs = await Promise.all(data.textures.map(f => loadTexture(base + f)));
  root = new PIXI.Container();
  app.stage.addChild(root);
  const order = [...data.parts].sort((a, b) => a.draw_order - b.draw_order);
  for (const p of order) {
    const n = p.points_px.length;
    const rest = new Float32Array(n * 2);
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      rest[2 * i] = p.points_px[i][0];
      rest[2 * i + 1] = p.points_px[i][1];
      uv[2 * i] = p.uv[i][0];
      uv[2 * i + 1] = 1 - p.uv[i][1];
    }
    const mesh = new PIXI.SimpleMesh(texs[p.texture], new Float32Array(rest), uv,
      new Uint16Array(p.triangles), PIXI.DRAW_MODES.TRIANGLES);
    root.addChild(mesh);
    parts.push({ mesh, rest, vtx: mesh.vertices, buf: mesh.geometry.getBuffer('aVertexPosition') });
  }
}

function fit() {
  if (!app || !root) return;
  const w = Math.max(1, portrait.clientWidth), h = Math.max(1, portrait.clientHeight);
  app.renderer.resize(w, h);
  const s = Math.min(w / VIEW.w, h / VIEW.h) * 0.98;   // phóng to: lấp đầy khung theo chiều hẹp hơn
  root.scale.set(s);
  root.position.set(w / 2 - (VIEW.x + VIEW.w / 2) * s, h / 2 - (VIEW.y + VIEW.h / 2) * s);
  // mờ dần ở đáy (theo toạ độ màn hình) để nhân vật không bị cắt ngang sắc
  const bottom = root.position.y + (VIEW.y + VIEW.h) * s;
  canvas.style.setProperty('--fade-end', Math.round(bottom) + 'px');
  canvas.style.setProperty('--fade-len', FADE_PX + 'px');
}

function tick() {
  if (!ready) return;
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
  lastNow = now;
  const t = (now - t0) / 1000;

  if (holdUntil && now > holdUntil) { target = EXPR.neutral; holdUntil = 0; }

  // biểu cảm
  cur.eye = ease(cur.eye, target.eye, 7, dt);
  cur.smile = ease(cur.smile, target.smile, 5, dt);
  cur.tilt = ease(cur.tilt, target.tilt, 4, dt);
  const mouthTarget = Math.min(1, voice) * 0.4;
  cur.mouth = ease(cur.mouth, mouthTarget, mouthTarget > cur.mouth ? 22 : 12, dt);

  // nhìn theo con trỏ (hoặc cúi xuống khung comment khi đang đợi AI)
  const lookX = look ? 0 : pointer.x;
  const lookY = look ? -0.6 : pointer.y;          // đang đọc comment: cúi xuống khung
  cur.lookX = ease(cur.lookX, lookX, 2.6, dt);
  cur.lookY = ease(cur.lookY, lookY, 2.6, dt);
  cur.yaw = ease(cur.yaw, cur.lookX * YAW_MAX, 3.2, dt);   // quay đầu theo con trỏ, có độ trễ
  const headDrop = look ? (look.headY || 0) * 0.8 : 0;

  cur.pitch = ease(cur.pitch, headDrop - cur.lookY * PITCH_MAX, 4, dt);
  cur.gazeX = ease(cur.gazeX, cur.lookX * 3, 6, dt);
  cur.gazeY = ease(cur.gazeY, cur.lookY * 2.2, 6, dt);

  // lò xo: tóc và tay áo bị kéo theo khi đầu/thân nghiêng và khi con trỏ đổi hướng
  const drive = cur.lookX * 60 + Math.sin(t * 1.3) * 12;
  stepSpring(spring.hair, drive, 14, 2.6, dt);
  stepSpring(spring.sleeve, drive * 0.6 + Math.sin(t * 0.9 + 1) * 8, 9, 2.2, dt);

  // chớp mắt: 150ms; thỉnh thoảng chớp đôi
  let blink = 0;
  if (blinkStart < 0 && now >= blinkAt) blinkStart = now;
  if (blinkStart >= 0) {
    const b = (now - blinkStart) / 150;
    if (b >= 1) {
      blinkStart = -1;
      if (blinkCount === 0 && Math.random() < 0.2) { blinkCount = 1; blinkAt = now + 180; }
      else { blinkCount = 0; blinkAt = now + 2600 + Math.random() * 2800; }
    } else blink = Math.sin(b * Math.PI);
  }

  const pose = {
    eye: cur.eye * (1 - 0.94 * blink),
    smile: cur.smile,
    mouth: cur.mouth,
    tilt: cur.tilt + cur.lookX * ROLL_MAX + 0.01 * Math.sin(t * 0.9),
    yaw: cur.yaw,
    pitch: cur.pitch,
    lean: cur.lookX * 3,
    gazeX: cur.gazeX,
    gazeY: cur.gazeY,
    hair: spring.hair.x,
    sleeve: spring.sleeve.x,
    breath: Math.sin(t * 1.6)
  };

  for (const p of parts) {
    const { rest, vtx } = p;
    for (let i = 0; i < rest.length; i += 2) {
      MW.displace(rest[i], rest[i + 1], pose, out);
      vtx[i] = out[0];
      vtx[i + 1] = out[1];
    }
    p.buf.update();
  }
}

function onVisibility() {
  if (!app) return;
  if (document.hidden) app.stop();
  else { lastNow = performance.now(); app.start(); }
}

// Con trỏ: đổi về toạ độ -1..1 so với khung nhân vật
function onPointer(e) {
  const r = canvas.getBoundingClientRect();
  pointer = {
    x: Math.max(-1, Math.min(1, ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1)),
    y: Math.max(-1, Math.min(1, ((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1))
  };
}
function onPointerLeave() { pointer = { x: 0, y: 0 }; }

window.kurumiAvatar = {
  look(l) { look = l || null; },
  setVoiceLevel(v) { voice = Math.max(0, Math.min(1, v || 0)); },
  setMouth(m) { if (m && typeof m.form === 'number') target = Object.assign({}, target, { smile: m.form * 0.5 }); },
  perform(action) {
    target = EXPR[action] || EXPR.neutral;
    holdUntil = performance.now() + HOLD_MS;
    portrait.dataset.action = EXPR[action] ? action : 'neutral';
  },
  stopSpeech() { target = EXPR.neutral; holdUntil = 0; voice = 0; portrait.dataset.action = 'neutral'; },
  holdStage() {},
  releaseStage() { target = EXPR.tease; holdUntil = performance.now() + 1500; },
  react() {},
  speechProgress() {},
  get ready() { return ready; }
};

(async function boot() {
  try {
    if (!window.PIXI || !MW) throw new Error('Thiếu thư viện hiển thị lưới.');
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error('Không tải được mô hình Nam Sĩ (' + res.status + ').');
    const data = await res.json();
    app = new PIXI.Application({
      view: canvas,
      width: Math.max(portrait.clientWidth, 1),
      height: Math.max(portrait.clientHeight, 1),
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(devicePixelRatio || 1, 2),
      autoDensity: true
    });
    app.ticker.maxFPS = 60;
    await build(data);
    canvas.hidden = false;
    imgEl.hidden = true;
    notice.textContent = 'Nam Sĩ đã đến';
    notice.classList.add('ready');
    portrait.classList.add('live2d-ready');
    fit();
    new ResizeObserver(fit).observe(portrait);
    canvas.addEventListener('pointermove', onPointer);
    canvas.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    app.ticker.add(tick);
    ready = true;
  } catch (err) {
    console.error('Mesh avatar failed:', err);
    canvas.hidden = true;
    notice.textContent = 'Nam Sĩ chưa chuyển động được. Bạn thử tải lại trang nhé.';
    notice.classList.add('failed');
  }
})();
})();
