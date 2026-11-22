(() => {
'use strict';

const STORE_KEY = 'kurumi.memory';
const HIST_KEY = 'kurumi.history';
const LOCALE_KEY = 'kurumi.locale';
const IDLE_MS = 90000;

const $ = id => document.getElementById(id);

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

const state = {
  locale: localStorage.getItem(LOCALE_KEY) || 'vi',
  connected: false,
  busy: false,
  idleFired: false,
  idleTimer: null,
  talkTimer: null,
  timerStarted: false,
  startedAt: 0,
  memory: readJson(STORE_KEY, { name: '', likes: '' }),
  history: readJson(HIST_KEY, []).slice(-20),
  attachment: null,
  attachmentUrl: null
};

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.memory));
  localStorage.setItem(HIST_KEY, JSON.stringify(state.history.slice(-20)));
}

/* ---------- Hiển thị ---------- */

let noticeTimer = null;
function showNotice(text) {
  const n = $('notice');
  n.textContent = text || '';
  n.hidden = !text;
  clearTimeout(noticeTimer);
  if (text) noticeTimer = setTimeout(() => { n.hidden = true; }, 6000);
}

function setStatus(text, connected) {
  const s = $('connectionStatus');
  s.textContent = text;
  s.classList.toggle('connected', !!connected);
}

function setSubtitle(ja, vi) {
  $('subtitleJa').textContent = ja || '';
  $('subtitleVi').textContent = vi || '';
}

function setThinking(on) {
  $('voiceLabel').textContent = on ? 'Kurumi đang nghĩ…' : 'Mình ở đây';
  $('wave').classList.toggle('active', on);
  $('sendButton').disabled = on || !state.connected;
}

function addMessage(role, text, mediaUrl, mediaType) {
  $('emptyChat').hidden = true;
  const box = document.createElement('div');
  box.className = 'message ' + role;

  const who = document.createElement('div');
  who.className = 'sender';
  who.textContent = role === 'user' ? 'BẠN' : 'KURUMI';

  const body = document.createElement('div');
  body.className = 'body';
  body.textContent = text || '';

  box.append(who, body);

  if (mediaUrl) {
    const isVideo = String(mediaType || '').startsWith('video/');
    const el = document.createElement(isVideo ? 'video' : 'img');
    el.src = mediaUrl;
    if (isVideo) el.controls = true;
    box.append(el);
  }

  const list = $('messages');
  list.append(box);
  list.scrollTop = list.scrollHeight;
}

function parseVi(content) {
  try { return JSON.parse(content).vi || content; }
  catch { return content; }
}

function renderHistory() {
  for (const h of state.history) {
    addMessage(h.role, h.role === 'assistant' ? parseVi(h.content) : h.content);
  }
}

function clearMessages() {
  document.querySelectorAll('#messages .message').forEach(n => n.remove());
  $('emptyChat').hidden = false;
}

/* ---------- Gọi server ---------- */

async function poll(id) {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 500));
    const res = await fetch('/api/jobs/' + id);
    const job = await res.json();
    if (job.state === 'done') return job.result;
    if (job.state === 'error') throw new Error(job.error || 'Kurumi chưa thể trả lời.');
    if (job.state === 'cancelled') throw new Error('Đã hủy lượt trò chuyện.');
  }
  throw new Error('Kurumi cần thêm thời gian. Bạn thử lại nhé.');
}

function applyMemory(patch) {
  if (!patch) return;
  if (patch.name) state.memory.name = patch.name;
  if (patch.likes) state.memory.likes = patch.likes;
}

function handleResult(result, userEntry) {
  if (result.empty) {
    showNotice(result.notice);
    return;
  }
  if (userEntry) state.history.push(userEntry);
  state.history.push({ role: 'assistant', content: JSON.stringify(result) });
  applyMemory(result.memoryPatch);
  setSubtitle(result.ja, result.vi);
  addMessage('assistant', result.vi);
  speak(result.vi, result.action);
  saveState();
}

async function runJob(kind, extra = {}, userEntry = null) {
  if (state.busy) return false;
  state.busy = true;
  clearTimeout(state.idleTimer);
  setThinking(true);
  try {
    const payload = {
      locale: state.locale,
      memory: JSON.stringify(state.memory),
      history: state.history.slice(-10),
      ...extra
    };
    const res = await fetch('/api/jobs/' + kind, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const created = await res.json();
    if (!res.ok) throw new Error(created.error || 'Không gửi được tin nhắn.');
    const result = await poll(created.id);
    handleResult(result, userEntry);
    return true;
  } catch (err) {
    showNotice(err.message || 'Có lỗi xảy ra.');
    return false;
  } finally {
    state.busy = false;
    setThinking(false);
    scheduleIdle();
  }
}

/* ---------- Kết nối & bắt chuyện ---------- */

function connect() {
  state.connected = true;
  state.idleFired = false;
  $('connectLabel').textContent = 'Kết thúc cuộc trò chuyện';
  setStatus('Đã kết nối', true);
  $('chatInput').disabled = false;
  $('sendButton').disabled = false;
  $('chatInput').focus();
  runJob('greeting');
}

function disconnect() {
  state.connected = false;
  clearTimeout(state.idleTimer);
  $('connectLabel').textContent = 'Bắt đầu trò chuyện';
  setStatus('Chưa kết nối', false);
  $('chatInput').disabled = true;
  $('sendButton').disabled = true;
}

function scheduleIdle() {
  clearTimeout(state.idleTimer);
  if (!state.connected || state.idleFired || !$('proactive').checked) return;
  state.idleTimer = setTimeout(() => {
    if (state.busy || !state.connected) return;
    state.idleFired = true;
    runJob('idle');
  }, IDLE_MS);
}

/* ---------- Đính kèm ---------- */

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function clearAttachment() {
  state.attachment = null;
  state.attachmentUrl = null;
  const p = $('attachmentPreview');
  p.hidden = true;
  p.replaceChildren();
  $('attachmentInput').value = '';
}

async function onFilePicked() {
  const file = $('attachmentInput').files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showNotice('File tối đa 10MB nhé.');
    $('attachmentInput').value = '';
    return;
  }
  clearAttachment();
  const isImage = file.type.startsWith('image/');
  const url = URL.createObjectURL(file);
  state.attachment = { mimeType: file.type, data: isImage ? await toBase64(file) : '' };
  state.attachmentUrl = url;

  const el = document.createElement(isImage ? 'img' : 'video');
  el.src = url;
  if (!isImage) el.muted = true;

  const label = document.createElement('span');
  label.className = 'muted';
  label.textContent = isImage ? 'Ảnh đã chọn' : 'Video (Kurumi chưa xem được)';

  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'ghost';
  x.textContent = '×';
  x.addEventListener('click', clearAttachment);

  const p = $('attachmentPreview');
  p.replaceChildren(el, label, x);
  p.hidden = false;
}

function setAttachMenu(open) {
  $('attachmentMenu').hidden = !open;
  $('attachButton').setAttribute('aria-expanded', String(open));
}

function openPicker(accept) {
  setAttachMenu(false);
  const input = $('attachmentInput');
  input.accept = accept;
  input.value = '';
  input.click();
}

/* ---------- Nhạc nền (tùy chọn: đặt file renderer/audio/bgm.mp3) ---------- */

const bgm = $('remoteAudio');
bgm.src = 'audio/bgm.mp3';
bgm.loop = true;
bgm.volume = 0.35;

function setMusicButton(on) {
  const b = $('musicButton');
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? 'Tắt nhạc' : 'Nhạc nền';
}

async function toggleMusic(forceOn) {
  const wantOn = forceOn ?? bgm.paused;
  if (!wantOn) {
    bgm.pause();
    setMusicButton(false);
    return;
  }
  try {
    await bgm.play();
    setMusicButton(true);
  } catch {
    setMusicButton(false);
    showNotice('Chưa có file audio/bgm.mp3 nên chưa phát được nhạc nền.');
  }
}

/* ---------- Đồng hồ ---------- */

function startTimer() {
  if (state.timerStarted) return;
  state.timerStarted = true;
  state.startedAt = Date.now();
  setInterval(() => {
    const s = Math.floor((Date.now() - state.startedAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('timer').textContent = mm + ':' + ss;
  }, 1000);
}

/* ---------- Avatar ---------- */

// avatar.js tự khởi tạo Live2D và đặt window.kurumiAvatar.
// Hàm này cho nhân vật đổi biểu cảm và mấp máy miệng theo độ dài câu.
function speak(text, action) {
  const avatar = window.kurumiAvatar;
  if (!avatar) return;
  avatar.perform?.(action || 'neutral');
  const ms = Math.min(7000, 1200 + (text || '').length * 65);
  const started = Date.now();
  clearInterval(state.talkTimer);
  state.talkTimer = setInterval(() => {
    const t = Date.now() - started;
    if (t > ms) {
      clearInterval(state.talkTimer);
      avatar.setVoiceLevel(0);
      return;
    }
    avatar.setVoiceLevel(0.35 + 0.35 * Math.abs(Math.sin(t / 90)));
  }, 60);
}

/* ---------- Gắn sự kiện ---------- */

function bind() {
  $('languageSelect').value = state.locale;
  $('languageSelect').addEventListener('change', e => {
    state.locale = e.target.value;
    localStorage.setItem(LOCALE_KEY, state.locale);
  });

  $('enterButton').addEventListener('click', () => {
    document.body.classList.remove('at-entrance');
    $('entrance').hidden = true;
    $('room').inert = false;
    startTimer();
    toggleMusic(true);
  });

  $('connectButton').addEventListener('click', () => (state.connected ? disconnect() : connect()));

  $('micButton').addEventListener('click', () => {
    showNotice('Nhận diện giọng nói chưa có trong bản này. Bạn nhắn chữ giúp mình nhé.');
  });

  $('musicButton').addEventListener('click', () => toggleMusic());

  $('proactive').addEventListener('change', scheduleIdle);

  $('chatForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!state.connected || state.busy) return;
    const text = $('chatInput').value.trim();
    const att = state.attachment;
    if (!text && !att) return;

    $('chatInput').value = '';
    state.idleFired = false;

    const userEntry = { role: 'user', content: text || '[đã gửi ảnh/video]' };
    addMessage('user', text, att ? state.attachmentUrl : null, att && att.mimeType);

    const extra = { message: text || 'Mình gửi bạn xem này.' };
    if (att) extra.attachment = att;
    clearAttachment();

    await runJob('chat', extra, userEntry);
  });

  $('attachButton').addEventListener('click', () => {
    setAttachMenu($('attachmentMenu').hidden);
  });
  $('chooseImage').addEventListener('click', () => openPicker('image/*'));
  $('chooseVideo').addEventListener('click', () => openPicker('video/*'));
  $('attachmentInput').addEventListener('change', onFilePicked);

  document.addEventListener('click', e => {
    if (!e.target.closest('.attach-wrap')) setAttachMenu(false);
  });

  $('memoryButton').addEventListener('click', () => {
    $('memoryName').value = state.memory.name || '';
    $('memoryLikes').value = state.memory.likes || '';
    $('memoryDialog').showModal();
  });
  $('closeMemory').addEventListener('click', () => $('memoryDialog').close());
  $('saveMemory').addEventListener('click', () => {
    state.memory = {
      name: $('memoryName').value.trim(),
      likes: $('memoryLikes').value.trim()
    };
    saveState();
    $('memoryDialog').close();
  });
  $('clearMemory').addEventListener('click', () => {
    if (!confirm('Xóa toàn bộ kỷ niệm và lịch sử trò chuyện?')) return;
    state.memory = { name: '', likes: '' };
    state.history = [];
    saveState();
    clearMessages();
    $('memoryDialog').close();
  });
  // Chạm vào nhân vật: avatar.js phát sự kiện, Kurumi phản ứng nếu đang kết nối.
  window.addEventListener('kurumi-touch', e => {
    if (state.connected && !state.busy) runJob('touch', { zone: e.detail?.zone });
  });

  $('forgetMedia').addEventListener('click', () => {
    clearAttachment();
    showNotice('Đã bỏ ảnh/video đang chọn.');
  });
}

function init() {
  bind();
  renderHistory();
}

init();
})();
