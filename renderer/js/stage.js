(() => {
'use strict';

// Sân khấu: nhân vật, bảng comment và câu trả lời (có giọng đọc). Không có ô nhập liệu.
const api = window.kurumi.stage;
const $ = id => document.getElementById(id);
const IDLE = 'Đang chờ comment…';
const BOARD_MAX = 6;

let hideTimer = null;      // ẩn phụ đề
let speechTimer = null;    // nói bằng chữ (khi không có giọng)
let talkTimer = null;      // mấp máy miệng (khi không có giọng)
let rafId = null;
let audioEl = null;
let ctx = null;
let analyser = null;
let awaitingAck = false;   // còn một câu trả lời chưa báo "đã đọc xong"

const avatar = () => window.kurumiAvatar;
const readMsFor = text => Math.max(1200, Math.min(12000, String(text).length * 75));

/* ---------- báo cho máy chủ biết đã đọc xong (đúng một lần cho mỗi câu) ---------- */
function ack() {
  if (!awaitingAck) return;
  awaitingAck = false;
  api.done();
}

/* ---------- miệng nhân vật ---------- */
function stopMouth() {
  clearInterval(talkTimer);
  talkTimer = null;
  cancelAnimationFrame(rafId);
  rafId = null;
  avatar()?.setVoiceLevel(0);
}
function talkFallback(ms) {
  clearInterval(talkTimer);
  const end = performance.now() + ms;
  talkTimer = setInterval(() => {
    if (performance.now() > end) { stopMouth(); return; }
    avatar()?.setVoiceLevel(0.3 + Math.random() * 0.45);
  }, 110);
}
// Đo âm lượng của giọng đọc để miệng khớp với tiếng
function lipSync() {
  if (!analyser) return;
  const buf = new Uint8Array(analyser.fftSize);
  const loop = () => {
    if (!analyser) return;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
    avatar()?.setVoiceLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    rafId = requestAnimationFrame(loop);
  };
  loop();
}

/* ---------- phát giọng đọc ---------- */
function stopAudio() {
  if (audioEl) {
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl.pause();
    audioEl = null;
  }
  analyser = null;
  stopMouth();
}
function playAudio(src, onEnd) {
  stopAudio();
  const a = new Audio(src);
  audioEl = a;
  a.onended = onEnd;
  a.onerror = onEnd;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const node = ctx.createMediaElementSource(a);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    node.connect(analyser);
    analyser.connect(ctx.destination);
    lipSync();
  } catch (_) {
    analyser = null;   // không đo được âm lượng thì dùng miệng mấp máy theo thời gian
  }
  a.play().catch(onEnd);
}

/* ---------- phụ đề ---------- */
function hideSubtitle() {
  clearTimeout(hideTimer);
  hideTimer = null;
  $('subtitle').classList.remove('show');
  $('idleLabel').textContent = IDLE;
}

function clearAll() {
  clearTimeout(speechTimer);
  speechTimer = null;
  stopAudio();
  window.kurumiBgm?.duck(false);   // câu bị xoá thì nhạc nền trở lại mức bình thường
  hideSubtitle();
  ack();
}

/* ---------- bảng comment ---------- */
function addBoard(e) {
  // bảng comment đã bỏ khỏi sân khấu: không hiển thị gì
  const board = $('board');
  if (!board) return;
  const row = document.createElement('div');
  row.className = 'brow' + (e.kind === 'gift' ? ' gift' : '');
  row.dataset.id = String(e.id);
  const who = document.createElement('span');
  who.className = 'bname';
  who.textContent = e.name;
  row.append(who, document.createTextNode(e.kind === 'gift' ? `🎁 tặng ${e.diamonds} kim cương` : e.text));
  board.append(row);
  while (board.children.length > BOARD_MAX) board.firstElementChild.remove();
}
function highlight(id) {
  document.querySelectorAll('#board .brow.on').forEach(n => n.classList.remove('on'));
  if (id == null) return;
  const row = document.querySelector(`#board [data-id="${CSS.escape(String(id))}"]`);
  if (row) row.classList.add('on');
}

/* ---------- đang chờ AI: nhân vật cúi nhìn khung comment để đọc ---------- */
let speakingNow = false;
let readingIds = [];
function markReading() {
  document.querySelectorAll('#board .brow.reading').forEach(n => n.classList.remove('reading'));
  for (const id of readingIds) {
    const row = document.querySelector(`#board [data-id="${CSS.escape(String(id))}"]`);
    if (row) row.classList.add('reading');
  }
}
function applyLook() {
  // đang đọc câu trả lời thì nhìn thẳng ra khán giả; đang chờ AI thì cúi xuống khung comment
  const look = !speakingNow && readingIds.length > 0 ? { eyeY: -0.75, headY: -6 } : null;
  avatar()?.look(look);
  if (!speakingNow && readingIds.length > 0) $('idleLabel').textContent = 'Nhân vật đang đọc comment…';
  else if (!speakingNow) $('idleLabel').textContent = IDLE;
}
function setReading(r) {
  readingIds = r.on ? (r.ids || []) : [];
  markReading();
  applyLook();
}

/* ---------- câu trả lời ---------- */
function say(p) {
  ack();                                   // câu trước (nếu còn) coi như đã xong
  stopAudio();
  clearTimeout(speechTimer);
  awaitingAck = true;
  speakingNow = true;
  applyLook();

  const text = String(p.text || '');
  const subtitleMs = (p.subtitleSec || 8) * 1000;
  const started = performance.now();
  const sub = p.kind === 'gift' ? `Cảm ơn ${p.name}`
    : p.kind === 'heart' ? '❤ Cảm ơn tim của các bạn'
    : (p.kind === 'video-break' || p.kind === 'form') ? p.name
    : `Trả lời ${p.name}`;
  $('subName').textContent = sub;
  $('subText').textContent = text;
  $('subtitle').classList.add('show');
  $('idleLabel').textContent = '';
  highlight(p.id);
  avatar()?.perform(p.action || 'neutral');
  window.kurumiMotion?.speech(p.motion || null);   // motion AI chọn cho câu này (đã kiểm tra tên ở main)

  let finished = false;
  window.kurumiBgm?.duck(true);   // hạ nhạc nền khi Kurumi nói
  const endSpeech = () => {
    if (finished) return;
    finished = true;
    speakingNow = false;
    window.kurumiBgm?.duck(false);
    window.kurumiMotion?.speechEnd();
    applyLook();
    stopAudio();
    // phụ đề ở lại ít nhất subtitleSec kể từ lúc bắt đầu
    const left = Math.max(0, subtitleMs - (performance.now() - started));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideSubtitle, left);
    ack();
  };

  if (p.audio) {
    playAudio(p.audio, endSpeech);
  } else {
    talkFallback(readMsFor(text));
    speechTimer = setTimeout(endSpeech, readMsFor(text));
  }
}

function setConfig(c) {
  window.kurumiMotion?.configure({ free: c.freeMotion !== false });
  const green = c.bg === 'green';                 // nền xanh để key ở OBS: không vẽ cảnh
  document.body.classList.toggle('key-green', green);
  const scene = !green && c.scene ? c.scene : null;
  document.body.classList.toggle('has-scene', !!scene);
  if (scene) document.body.style.setProperty('--scene', `url("${scene}")`);
  else document.body.style.removeProperty('--scene');
}

/* ---------- video quà tặng: một video mỗi lúc, máy chủ xếp hàng và ra lệnh ---------- */
const vBox = $('videoBox');
const vEl = $('vid');
const vCap = $('vidCap');
let vidId = null;          // id video đang phát (null = không có)

// Dọn video đang phát. Gỡ handler trước để việc gỡ src không kích hoạt "lỗi" giả.
function stopVideo() {
  vidId = null;
  vEl.onended = null;
  vEl.onerror = null;
  vEl.onloadedmetadata = null;
  try { vEl.pause(); } catch (_) {}
  vEl.removeAttribute('src');
  vEl.load();
  vBox.hidden = true;
  vCap.textContent = '';
}

// Báo máy chủ đã phát xong (đúng một lần cho mỗi video)
function reportVideoDone(ok = true) {
  if (vidId === null) return;
  const id = vidId;
  stopVideo();
  api.videoDone(id, ok);
}

function playVideo(p) {
  if (vidId !== null) stopVideo();   // không bao giờ chồng hai video
  vidId = p.id;
  vCap.textContent = `🎁 ${p.name} tặng ${p.gift}`;
  vEl.volume = Math.max(0, Math.min(1, (Number(p.volume) || 0) / 100));
  vEl.onloadedmetadata = () => api.videoMeta(vidId, vEl.duration);
  vEl.onended = () => reportVideoDone(true);
  vEl.onerror = () => reportVideoDone(false);   // file mất, sai đường dẫn, không giải mã được
  vBox.hidden = false;
  vEl.src = p.src;
  vEl.play().catch(() => reportVideoDone(false));
}

function videoStopped() {
  if (vidId !== null) stopVideo();   // máy chủ đã bỏ qua hoặc hết giờ: không báo lại
}

/* ---------- nạp renderer của nhân vật đang chọn (chỉ tải những gì cần) ---------- */
const CHAR_SCRIPTS = {
  // Cubism 5 (DeepSeek-chan): Cubism Core + plugin Cubism 4. motion-director4 phải nạp trước avatar4 để bắt được đối tượng model
  live2d4: ['vendor/live2dcubismcore.min.js', 'vendor/pixi-live2d4.min.js', 'js/motion-director4.js', 'js/cute4.js', 'js/avatar4.js']
};
function loadScripts(list) {
  return list.reduce((chain, src) => chain.then(() => new Promise((ok, fail) => {
    const sc = document.createElement('script');
    sc.src = src;
    sc.onload = ok;
    sc.onerror = () => fail(new Error('Không tải được ' + src));
    document.head.append(sc);
  })), Promise.resolve());
}
function loadCharacter(ch) {
  const info = ch || { name: 'Nhân vật', kind: 'live2d4' };
  document.title = info.name;
  if (info.model) window.KURUMI_MODEL_URL = '/' + info.model;
  $('avatar').alt = info.name;
  $('modelNotice').textContent = `${info.name} đang đến…`;
  const list = CHAR_SCRIPTS[info.kind] || CHAR_SCRIPTS.live2d4;
  return loadScripts(list).catch(err => {
    console.error('Character load failed:', err);
    $('modelNotice').textContent = `${info.name} chưa chuyển động được. Bạn thử tải lại trang nhé.`;
    $('modelNotice').classList.add('failed');
  });
}

api.onSay(say);
api.onBoard(addBoard);

/* ---------- hiệu ứng quà: icon bùng nổ quanh nhân vật, rồi tự biến mất sau durationMs ---------- */
const fxLayer = $('fxLayer');
let fxTimer = null;
function giftFx(p) {
  clearTimeout(fxTimer);
  fxLayer.replaceChildren();
  const hero = document.createElement('img');
  hero.src = p.icon;
  hero.className = 'fx-hero';
  hero.style.setProperty('--dur', p.durationMs + 'ms');
  fxLayer.append(hero);
  const count = Math.max(0, Math.min(40, Number(p.count) || 0));
  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.src = p.icon;
    img.className = 'fx-ic';
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 220 + Math.random() * 380;
    img.style.setProperty('--dx', Math.round(Math.cos(ang) * dist) + 'px');
    img.style.setProperty('--dy', Math.round(Math.sin(ang) * dist * 0.6) + 'px');
    img.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 540) + 'deg');
    img.style.setProperty('--sz', Math.round(44 + Math.random() * 40) + 'px');
    img.style.setProperty('--delay', Math.round(Math.random() * 350) + 'ms');
    img.style.setProperty('--dur', p.durationMs + 'ms');
    fxLayer.append(img);
  }
  fxLayer.hidden = false;
  window.kurumiCute?.react('happy');   // nhân vật vui nhún theo lúc quà bùng nổ
  fxTimer = setTimeout(() => { fxLayer.replaceChildren(); fxLayer.hidden = true; }, p.durationMs);
}
api.onGiftFx(giftFx);
api.onClear(clearAll);
api.onConfig(setConfig);
api.onReading(setReading);
api.onVideoPlay(playVideo);
api.onVideoStop(videoStopped);
api.init()
  .then(c => { setConfig(c); return loadCharacter(c && c.character); })
  .catch(() => {});
})();
