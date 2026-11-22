(() => {
'use strict';

const api = window.kurumi.control;
const $ = id => document.getElementById(id);

// Tính cách không nằm trong FORM: mỗi nhân vật có ô riêng (xem personasDraft)
const FORM = ['character', 'aiEnabled', 'model', 'pickMode', 'triggerMode', 'keywords', 'replyToGifts', 'quickReplies', 'giftMinDiamonds',
  'cooldownUserSec', 'minIntervalSec', 'maxQueue', 'parallel', 'subtitleSec', 'locale', 'stageBg', 'scene', 'freeMotion',
  'voiceEnabled', 'voiceName', 'pythonPath', 'extraModels', 'cannedFallback', 'videoEnabled', 'videoVolume', 'maxVideoQueue', 'videoGapSec', 'videoBreakTalk', 'heartStep',
  'selfTalkEnabled', 'factMemory', 'selfIdleSec', 'selfMinGapSec', 'selfMaxPerHour', 'recapEveryMin',
  'musicEnabled', 'musicVolume', 'musicDir', 'selfQuietBoost', 'selfQuietViewers', 'selfQuietCommentsPerMin'];
const FEED_LABEL = { replied: 'Đã trả lời', skipped: 'Bỏ qua', error: 'Lỗi' };
const BOARD_LABEL = { new: 'Mới', queued: 'Đang chờ', replied: 'Đã trả lời', skipped: 'Bỏ qua', error: 'Lỗi' };
const TTS_LABEL = { off: 'tắt', loading: 'đang khởi động', ready: 'sẵn sàng', error: 'lỗi' };

/* ---------- bảng quà → video ---------- */
// Danh mục quà TikTok (tên đúng như TikTok hiển thị, giá tính bằng xu). icon = tên file trong assets/gifts.
// Quà chưa rõ giá để coins = null. Quà đã thấy trong live được thêm vào gợi ý tự động.
const GIFT_CATALOG = [
  { name: 'GG', coins: 1, icon: 'gg' }, { name: 'Heart', coins: 1, icon: 'heart' },
  { name: 'Heart Me', coins: 1, icon: 'heart_me' }, { name: 'Ice Cream Cone', coins: 1, icon: 'ice_cream_cone' },
  { name: 'Love you', coins: 1, icon: 'love_you' }, { name: 'Rose', coins: 1, icon: 'rose' },
  { name: 'Thumbs Up', coins: 1, icon: 'thumbs_up' }, { name: 'TikTok', coins: 1, icon: 'tiktok' },
  { name: 'Team Bracelet', coins: 2, icon: 'team_bracelet' }, { name: 'Finger Heart', coins: 5, icon: 'finger_heart' },
  { name: 'Cheer You Up', coins: 9, icon: 'cheer_you_up' }, { name: 'Friendship Necklace', coins: 10, icon: 'friendship_necklace' },
  { name: 'Rosa', coins: 10, icon: 'rosa' }, { name: 'Perfume', coins: 20, icon: 'perfume' },
  { name: 'Doughnut', coins: 30, icon: 'doughnut' }, { name: 'Bubble Gum', coins: 99, icon: 'bubble_gum' },
  { name: 'Cap', coins: 99, icon: 'cap' }, { name: 'Hat and Mustache', coins: 99, icon: 'hat_and_mustache' },
  { name: 'Level-up Sparks', coins: 99, icon: 'levelup_sparks' }, { name: 'Like-Pop', coins: 99, icon: 'like_pop' },
  { name: 'Little Crown', coins: 99, icon: 'little_crown' }, { name: 'Love Painting', coins: 99, icon: 'love_painting' },
  { name: 'Paper Crane', coins: 99, icon: 'paper_crane' }, { name: 'Confetti', coins: 100, icon: 'confetti' },
  { name: 'Shamrock', coins: null, icon: 'shamrock' }, { name: 'Bouquet', coins: null, icon: 'bouquet' },
  { name: 'Hand Heart', coins: null, icon: 'hand_heart' }, { name: 'Ice Cream', coins: null, icon: 'ice_cream' }
];
// tên quà (chữ thường) -> tên file icon
const GIFT_ICON = Object.fromEntries(GIFT_CATALOG.map(g => [g.name.trim().replace(/\s+/g, ' ').toLowerCase(), g.icon]));
const VIDEO_LABEL = { played: 'Đã phát', skipped: 'Bỏ qua', timeout: 'Quá giờ', error: 'Lỗi', dropped: 'Bỏ vì hàng đợi đầy', cleared: 'Đã xoá khỏi hàng đợi' };
const VIDEO_CLS = { played: 'replied', skipped: 'skipped', cleared: 'skipped', dropped: 'skipped', timeout: 'error', error: 'error' };
const normGift = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const baseName = p => String(p || '').split(/[\\/]/).pop();

let vDraft = [];           // bảng đang sửa: [{ id, gift, path }]
let vLoaded = false;       // đã nạp bảng từ cài đặt lần đầu chưa
let vDirty = false;        // bảng có thay đổi chưa lưu
let giftListKey = '';
let vTestBtns = [];        // các nút "Phát thử" của bảng đang hiện: { btn, row }

let formLoaded = false;
let last = null;
let toastTimer = null;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function readForm() {
  const v = {};
  for (const f of FORM) {
    const node = $(f);
    if (node.type === 'checkbox') v[f] = node.checked;
    else if (node.type === 'number') v[f] = Number(node.value);
    else v[f] = node.value;
  }
  return v;
}
// Dropdown giọng VieNeu: đổ danh sách một lần (10 giọng nổi bật trước)
function fillVoices() {
  const sel = $('voiceName');
  if (sel.options.length) return;
  const { VIENEU_VOICES } = window.VIENEU;
  for (const [label, list] of [
    ['Nổi bật', VIENEU_VOICES.filter(v => v.featured)],
    ['Giọng khác', VIENEU_VOICES.filter(v => !v.featured)]
  ]) {
    const g = document.createElement('optgroup');
    g.label = label;
    for (const v of list) {
      const o = document.createElement('option');
      o.value = v.name;
      o.textContent = v.label;
      g.append(o);
    }
    sel.append(g);
  }
}
// Giữ đúng giọng đã lưu, kể cả tên cũ (đổi về tên chuẩn); giọng lạ thì thêm vào để không mất
function ensureVoice(name) {
  const sel = $('voiceName');
  const want = window.VIENEU.canonicalVoice(String(name || '').trim()) || window.VIENEU.VIENEU_DEFAULT;
  if (![...sel.options].some(o => o.value === want)) {
    const o = document.createElement('option');
    o.value = want;
    o.textContent = want + ' (không có trong danh sách)';
    sel.append(o);
  }
  sel.value = want;
}
function fillForm(s) {
  fillVoices();
  for (const f of FORM) {
    const node = $(f);
    if (f === 'voiceName') ensureVoice(s[f]);
    else if (node.type === 'checkbox') node.checked = !!s[f];
    else node.value = s[f] ?? '';
  }
}

// Tính cách theo từng nhân vật: ô đang hiện là của nhân vật `shownChar`
let personasDraft = {};
let shownChar = '';
function charName(id) {
  const c = (last && last.characters || []).find(x => x.id === id);
  return c ? c.name : id;
}
// Ô tính cách hiện sẵn tính cách mặc định của nhân vật; chỉ lưu khi người dùng đã sửa khác mặc định
function defaultPersonaOf(id) {
  const c = (last && last.characters || []).find(x => x.id === id);
  return c && c.persona ? c.persona : '';
}
function commitPersona() {
  if (!shownChar) return;
  const text = $('persona').value;
  if (text.trim() === defaultPersonaOf(shownChar).trim()) delete personasDraft[shownChar];
  else personasDraft[shownChar] = text;
}
function showPersona(id) {
  shownChar = id;
  $('persona').value = personasDraft[id] || defaultPersonaOf(id);
  $('personaName').textContent = charName(id);
}
function fillCharacters(s) {
  const sel = $('character');
  if (sel.options.length || !s.characters) return;
  for (const c of s.characters) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.name;
    sel.append(o);
  }
}
function updateCharacterNote(id) {
  const c = (last && last.characters || []).find(x => x.id === id);
  $('characterNote').textContent = c ? c.description : '';
}

function toast(text, ms = 2200) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// Bấm "Trả lời": luôn báo kết quả, không để người dùng đoán
async function pick(id) {
  try {
    const r = await api.pick(id);
    toast((r && r.message) || (r && r.ok ? 'Đã chọn comment.' : 'Không chọn được comment.'), 4000);
  } catch (err) {
    toast('Lỗi khi chọn comment: ' + (err && err.message ? err.message : err), 4000);
  }
}

function renderQueue(items) {
  const box = $('queue');
  if (!items.length) { box.replaceChildren(el('li', 'empty', 'Chưa có comment nào đang chờ')); return; }
  box.replaceChildren(...items.map(q => {
    const li = el('li', 'qitem qrow');
    const txt = el('div', 'txt');
    txt.append(el('b', '', q.name), el('span', '', ' ' + (q.kind === 'gift' ? `tặng ${q.diamonds} kim cương` : q.text)));
    const btn = el('button', 'ghost', 'Trả lời ngay');
    btn.addEventListener('click', () => pick(q.id));
    li.append(txt, btn);
    return li;
  }));
}

function renderBoard(items) {
  $('bCount').textContent = String(items.length);
  const box = $('board');
  if (!items.length) { box.replaceChildren(el('div', 'empty', 'Chưa có comment nào')); return; }
  box.replaceChildren(...items.map(b => {
    const row = el('div', 'crow ' + b.state);
    const body = el('div', 'body');
    body.append(el('span', 'who', b.name), el('span', '', b.kind === 'gift' ? `🎁 tặng ${b.diamonds} kim cương` : b.text));
    const right = el('div', '');
    right.append(el('div', 'st', BOARD_LABEL[b.state] || b.state));
    if (b.state === 'queued') {
      const btn = el('button', 'ghost', 'Trả lời');
      btn.addEventListener('click', () => pick(b.id));
      right.append(btn);
    }
    row.append(body, right);
    return row;
  }));
}

function renderFeed(items) {
  const box = $('feed');
  if (!items.length) { box.replaceChildren(el('div', 'empty', 'Chưa có hoạt động nào')); return; }
  box.replaceChildren(...items.map(f => {
    const row = el('div', 'frow ' + f.status);
    const head = el('div', '');
    head.append(el('span', 'tag', FEED_LABEL[f.status] || f.status), el('span', '', '  '), el('span', 'who', f.name));
    row.append(head, el('div', '', f.kind === 'gift' ? `🎁 Quà ${f.diamonds} kim cương` : f.text));
    if (f.status === 'replied') row.append(el('div', 'reply', '→ ' + f.reply));
    else if (f.detail) row.append(el('div', 'detail', f.detail));
    return row;
  }));
}

// Dòng trạng thái lớn: đang gọi AI cho ai, đã chờ bao lâu, hoặc comment đang chờ đến lượt
function renderAiStatus(e) {
  const box = $('aiStatus');
  const parts = [];
  let cls = '';
  if (e.asking && e.asking.length) {
    const oldest = Math.min(...e.asking.map(a => a.since));
    const sec = Math.max(0, Math.floor((Date.now() - oldest) / 1000));
    const names = e.asking.map(a => a.name).join(', ');
    let t = `⏳ Đang gọi Gemini song song cho ${names} (${sec}s)`;
    if (sec >= 10) t += ' — chờ hơi lâu, có thể đang chuyển sang mô hình dự phòng';
    parts.push(t);
    cls = 'busy';
  }
  if (e.speaking) {
    parts.push(`🔊 Đang đọc cho ${e.speaking.name}`);
    cls = 'busy';
  }
  if (e.readyCount) parts.push(`${e.readyCount} câu trả lời đã sẵn, chờ đọc lần lượt`);
  if (e.pendingPick && !cls) {
    parts.push(`Đã chọn ${e.pendingPick.name}, sẽ được trả lời tiếp.`);
    cls = 'wait';
  }
  if (!parts.length) { box.hidden = true; return; }
  box.hidden = false;
  box.className = 'ai-status ' + cls;
  box.textContent = parts.join(' · ');
}

// Cập nhật số giây mỗi giây trong lúc đang chờ
setInterval(() => { if (last) renderAiStatus(last.engine); }, 1000);

/* ---------- dạng (model) do AI đổi ---------- */
function renderForm(f) {
  if (!f) return;
  let t = f.current ? `Dạng: ${f.current}.` : 'Dạng: gốc.';
  if (f.trial) t += ` Đang thử dạng mới, phản đối ${f.trial.neg} · tán thành ${f.trial.pos} (còn ${f.trial.leftSec}s).`;
  $('formNote').textContent = t;
  $('btnFormReset').disabled = !f.current && !f.trial;
}

/* ---------- video quà tặng ---------- */
function renderGiftList(seen) {
  const items = GIFT_CATALOG.map(g => ({ name: g.name, coins: g.coins }));
  for (const g of seen || []) if (!items.some(n => normGift(n.name) === normGift(g.name))) items.push({ name: g.name, coins: g.diamonds });
  const key = items.map(i => i.name).join('|');
  if (key === giftListKey) return;      // không dựng lại danh sách gợi ý nếu không đổi
  giftListKey = key;
  $('giftList').replaceChildren(...items.map(i => {
    const o = document.createElement('option');
    o.value = i.name;
    o.label = i.coins ? `${i.coins} xu` : '';
    return o;
  }));
}

function renderVideo(s) {
  const v = s.video || { playing: null, queue: [], history: [] };
  renderGiftList(s.giftsSeen);

  $('vCount').textContent = String(v.queue.length);
  const now = v.playing
    ? `▶ Đang phát: ${v.playing.name} tặng ${v.playing.gift}` + (v.queue.length ? ` · còn ${v.queue.length} video chờ` : '')
    : v.resting
      ? `⏸ Nghỉ giữa video, ${v.queue.length ? `còn ${v.queue.length} video chờ` : 'hết video'}…`
      : (v.queue.length ? `Đang chờ ${v.queue.length} video đến lượt.` : 'Chưa có video nào đang phát.');
  $('vNow').textContent = now;
  $('btnVSkip').disabled = !v.playing;
  $('btnVClear').disabled = !v.queue.length;

  const q = $('vQueue');
  if (!v.queue.length) q.replaceChildren(el('li', 'empty', 'Hàng đợi video trống'));
  else q.replaceChildren(...v.queue.map((w, i) => {
    const li = el('li', 'qitem');
    li.append(el('div', 'txt', `${i + 1}. ${w.name} tặng ${w.gift}`));
    return li;
  }));

  const h = $('vHist');
  if (!v.history.length) h.replaceChildren(el('div', 'empty', 'Chưa có video nào được phát'));
  else h.replaceChildren(...v.history.map(x => {
    const row = el('div', 'frow ' + (VIDEO_CLS[x.status] || ''));
    const head = el('div', '');
    head.append(el('span', 'tag', VIDEO_LABEL[x.status] || x.status), el('span', '', '  '), el('span', 'who', x.name));
    row.append(head, el('div', '', `tặng ${x.gift}`));
    return row;
  }));

  renderVideoNote();
  if (!vLoaded && s.settings) {
    vDraft = (s.settings.giftVideos || []).map(r => ({ ...r }));
    vLoaded = true;
    renderVTable();
  }
}

function renderVTable() {
  const box = $('vTable');
  vTestBtns = [];
  if (!vDraft.length) { box.replaceChildren(el('div', 'empty', 'Chưa có dòng nào. Bấm "+ Thêm dòng" để thêm quà.')); return; }
  box.replaceChildren(...vDraft.map((r, i) => {
    const row = el('div', 'vrow');

    const icon = el('span', 'vicon');   // grid-area: i
    const file = GIFT_ICON[normGift(r.gift)];
    if (file) {
      const img = document.createElement('img');
      img.src = `assets/gifts/${file}.png`;
      img.alt = '';
      icon.append(img);
    }

    const gift = document.createElement('input');
    gift.type = 'text';
    gift.setAttribute('list', 'giftList');
    gift.placeholder = 'Tên quà hoặc *';
    gift.value = r.gift;
    gift.addEventListener('input', () => { r.gift = gift.value; vDirty = true; renderVideoNote(); });

    const fileName = el('span', 'vfile' + (r.path ? ' set' : ''), r.path ? baseName(r.path) : 'chưa chọn file');
    fileName.title = r.path || '';

    const pick = el('button', 'ghost vpick', 'Chọn file');
    pick.addEventListener('click', async () => {
      const p = await api.pickVideo();
      if (!p) return;
      r.path = p; vDirty = true; renderVTable(); renderVideoNote();
    });

    const test = el('button', 'ghost vtest', 'Phát thử');
    vTestBtns.push({ btn: test, row: r });
    test.addEventListener('click', async () => {
      const res = await api.videoTest(r.id);
      toast(res && res.ok ? 'Đã xếp video thử vào hàng đợi' : ((res && res.message) || 'Không phát thử được'), 3000);
    });

    const del = el('button', 'ghost danger vdel', '✕');
    del.title = 'Xoá dòng';
    del.addEventListener('click', () => { vDraft.splice(i, 1); vDirty = true; renderVTable(); renderVideoNote(); });

    row.append(icon, gift, fileName, pick, test, del);
    return row;
  }));
}

// Ghi chú dưới bảng + trạng thái nút "Phát thử" (chỉ phát thử khi bảng đã lưu)
function renderVideoNote() {
  const off = !!(last && last.settings && !last.settings.videoEnabled);
  $('vNote').textContent = (off ? 'Đang tắt: quà không phát video. ' : '') + (vDirty ? 'Bảng đã sửa nhưng chưa lưu.' : '');
  for (const t of vTestBtns) t.btn.disabled = vDirty || !t.row.id || !t.row.path;
}

async function saveVTable() {
  const rows = vDraft.filter(r => String(r.gift || '').trim() && r.path);
  const dropped = vDraft.length - rows.length;
  const res = await api.saveSettings({ giftVideos: rows.map(({ id, gift, path }) => ({ id, gift, path })) });
  if (res && res.settings) vDraft = (res.settings.giftVideos || []).map(r => ({ ...r }));
  vDirty = false;
  renderVTable();
  renderVideoNote();
  toast(dropped ? `Đã lưu bảng. ${dropped} dòng thiếu tên quà hoặc file nên bị bỏ.` : 'Đã lưu bảng quà → video', 3500);
}

function render(s) {
  last = s;
  const e = s.engine;
  renderAiStatus(e);

  const tik = $('pillTik');
  tik.textContent = s.connected ? `TikTok: @${s.username}` : 'TikTok: chưa kết nối';
  tik.className = 'pill' + (s.connected ? ' ok' : '');

  let aiText = 'AI: sẵn sàng', aiCls = 'ok';
  if (!s.settings.aiEnabled) { aiText = 'AI: đang tắt'; aiCls = ''; }
  else if (!s.hasKey) { aiText = 'AI: thiếu API key'; aiCls = 'bad'; }
  else if (e.paused) { aiText = 'AI: tạm dừng'; aiCls = 'warn'; }
  else if (e.busy) { aiText = 'AI: đang trả lời…'; aiCls = 'ok'; }
  const ai = $('pillAi');
  ai.textContent = aiText;
  ai.className = 'pill' + (aiCls ? ' ' + aiCls : '');

  $('status').textContent = s.status + (s.demo ? ' · đang chạy demo' : '');
  const n = s.keyCount || 0;
  $('keyNote').textContent = s.hasKey
    ? (s.keyFromEnv ? `Đang dùng ${n} key từ biến môi trường GEMINI_API_KEY.` : `Đã lưu ${n} key (được mã hoá trên máy này).`)
      + (n >= 2 ? ' Mỗi câu gọi 2 key cùng lúc, key nào trả lời trước thì dùng.' : ' Thêm key thứ 2 trở đi để trả lời nhanh hơn và đỡ bị giới hạn.')
    : 'Chưa có key: AI sẽ không trả lời được.';

  const tts = s.tts || { state: 'off', msg: '' };
  const ttsPill = $('ttsPill');
  ttsPill.textContent = TTS_LABEL[tts.state] || tts.state;
  ttsPill.className = 'pill' + (tts.state === 'ready' ? ' on' : tts.state === 'error' ? ' bad' : '');
  $('ttsNote').textContent = tts.msg || 'Cần Python 3.10+ và chạy: pip install vieneu';

  $('btnPause').textContent = e.paused ? 'Tiếp tục' : 'Tạm dừng';
  $('btnDemo').textContent = s.demo ? 'Tắt demo' : 'Bật demo comment';
  $('btnStage').textContent = s.stageVisible ? 'Ẩn sân khấu' : 'Hiện sân khấu';
  $('qCount').textContent = String(e.queueLength);
  $('btnPickRandom').disabled = e.queueLength === 0;
  $('stats').textContent = `Đã trả lời ${e.stats.replied} · bỏ qua ${e.stats.skipped} · lỗi ${e.stats.errors}`;

  renderQueue(e.queue);
  renderBoard(e.board);
  renderFeed(e.feed);

  renderVideo(s);
  renderForm(s.form);

  if (!formLoaded) {
    fillCharacters(s);
    fillForm(s.settings);
    personasDraft = { ...(s.settings.personas || {}) };
    showPersona(s.settings.character);
    updateCharacterNote(s.settings.character);
    if (s.username) $('user').value = s.username;
    formLoaded = true;
  }
}

async function save() {
  commitPersona();
  await api.saveSettings({ ...readForm(), personas: { ...personasDraft } });
  toast('Đã lưu cài đặt');
}

// Đổi nhân vật: lưu ngay (sân khấu sẽ tải lại), các ô khác giữ nguyên cho tới khi bấm Lưu cài đặt
$('character').addEventListener('change', async () => {
  commitPersona();
  const id = $('character').value;
  showPersona(id);
  updateCharacterNote(id);
  await api.saveSettings({ character: id, personas: { ...personasDraft } });
  toast(`Đang chuyển sang ${charName(id)}…`);
});

$('btnConnect').addEventListener('click', async () => {
  const r = await api.connect($('user').value);
  if (r && !r.ok) $('status').textContent = r.error;
});
$('btnDisconnect').addEventListener('click', () => api.disconnect());
$('btnKey').addEventListener('click', async () => {
  const key = $('apiKey').value.trim();
  if (!key) { toast('Chưa nhập key'); return; }
  await api.saveKey(key);
  $('apiKey').value = '';
  toast('Đã lưu danh sách key');
});
$('btnSave').addEventListener('click', save);
$('musicNext').addEventListener('click', () => api.musicNext());
$('aiEnabled').addEventListener('change', save);
$('videoEnabled').addEventListener('change', save);
$('videoBreakTalk').addEventListener('change', save);
$('btnVAdd').addEventListener('click', () => { vDraft.push({ id: '', gift: '', path: '' }); vDirty = true; renderVTable(); renderVideoNote(); });
$('btnVSave').addEventListener('click', saveVTable);
$('btnVSkip').addEventListener('click', () => api.videoSkip());
$('btnFormReset').addEventListener('click', () => api.formReset());
$('btnVClear').addEventListener('click', () => api.videoClear());
$('voiceEnabled').addEventListener('change', save);
$('voiceName').addEventListener('change', save);
$('btnPause').addEventListener('click', () => api.togglePause());
$('btnPickRandom').addEventListener('click', () => pick(null));
$('btnClearQ').addEventListener('click', () => api.clearQueue());
$('btnVoiceTest').addEventListener('click', async () => {
  toast('Đang tạo giọng đọc…');
  const r = await api.voiceTest();
  if (!r.ok) toast('Chưa đọc được: ' + (r.error || ''));
});
$('btnStage').addEventListener('click', () => api.toggleStage());
$('btnClearStage').addEventListener('click', () => api.clearStage());
$('btnDemo').addEventListener('click', () => api.demo(!(last && last.demo)));
$('testForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('testText').value.trim();
  if (!text) return;
  await api.test({ name: $('testName').value.trim() || 'Khán giả thử', text });
  $('testText').value = '';
});

api.onState(render);
api.get().then(render);
})();
