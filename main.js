'use strict';
const { app, BrowserWindow, ipcMain, safeStorage, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { DEFAULTS, sanitize } = require('./src/settings');
const { createEngine } = require('./src/engine');
const { buildSystem, buildUserText, parseReply } = require('./src/persona');
const { resolveMotion, motionCatalog } = require('./src/motions');
const { emotionCatalog } = require('./src/emotions');
const { askGemini, warmGemini, keyStatus } = require('./src/gemini');
const { createMemory } = require('./src/memory');
const { createMood } = require('./src/mood');
const { createAutonomy } = require('./src/autonomy');
const { buildMemoryBlock, buildIdentityBlock } = require('./src/prompt-v3');
const { createBatcher } = require('./src/batcher');
const { createCooldown } = require('./src/cooldown');
const { trackList, parseMusicRequest, findTrack: L_findTrack } = require('./renderer/js/bgm-logic');
const { screen, isRepetitive, isSafe } = require('./src/moderation');
const { extractFacts, heuristicFacts, FACT_RULE } = require('./src/facts');
const { buildSummaryPrompt, parseSummary } = require('./src/summarize');
const { parseKeys } = require('./src/keypool');
const { quickReply, cannedReply, noVideoGiftReply } = require('./src/quick');
const { CHARACTERS, getCharacter, listCharacters, stageInfo, FORMS, FORM_IDS } = require('./src/characters');
const { createFormTrial } = require('./src/formvote');
const { createHeartCounter } = require('./src/hearts');
const { instantFor, deferFor } = require('./src/instant');
const { SCENES } = require('./src/scenes');
const { folderFileList, composeModel3, motionGroupsOf } = require('./src/cubism4');
const { createDeduper, msgIdOf } = require('./src/dedupe');
const { createVideoQueue } = require('./src/videoqueue');
const { giftIcon } = require('./src/gifticons');
const { findVideoRule, hasLinkedVideo } = require('./src/giftvideo');

// Nhật ký chung (app.log trong thư mục dữ liệu): ghi lỗi không bắt được để chẩn đoán kết nối (học từ Draw Live)
const logApp = msg => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'app.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch (_) {} };
process.on('uncaughtException', e => logApp('uncaughtException: ' + ((e && e.stack) || e)));
process.on('unhandledRejection', e => logApp('unhandledRejection: ' + ((e && e.stack) || e)));
const deduper = createDeduper();   // chống đếm trùng chat/quà khi TikTok gửi lại gói tin
const quickState = {};   // nhớ mẫu vừa dùng để không lặp lại liên tiếp

const GEMINI_TIMEOUT_MS = 25000;   // tổng thời gian cho cả chuỗi dự phòng (câu ngắn nên 25 giây là quá đủ)

// Cho phép phát âm thanh tự động trên sân khấu (không cần người dùng bấm)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const RENDERER = path.join(__dirname, 'renderer');
// Python không đọc được file nằm trong app.asar, nên khi đóng gói phải lấy đường dẫn ở bản unpacked
const TTS_SCRIPT = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'tts', 'tts_server.py')
  : path.join(__dirname, 'tts', 'tts_server.py');
const TTS_PORT = 47831;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.moc': 'application/octet-stream', '.moc3': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac'
};
const VIDEO_MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm' };

let stageWin = null;        // sân khấu: cửa sổ đưa lên live (OBS Window Capture)
let controlWin = null;      // bảng điều khiển
let stagePort = 0;
let quitting = false;
let settings = { ...DEFAULTS };
let apiKeys = [];          // danh sách API key Gemini, chỉ giữ trong main process
let conn = null;
let connected = false;
let username = '';
let status = 'Chưa kết nối';
let demoTimer = null;
let pendingStageDone = null; // hàm đánh thức khi sân khấu báo đã đọc xong
let formOverride = null;     // dạng (model) AI đã đổi sang: null = dạng gốc của nhân vật đang chọn
let trial = null;            // đang thử dạng mới: bỏ phiếu xem khán giả có phản đối không
let lastFormAt = 0;          // lần đổi dạng gần nhất (để không đổi liên tục)
let stageInitWaiter = null;  // hàm đánh thức khi sân khấu vừa tải lại xong
let heartCounter = null;     // đếm tim ẩn (không hiển thị), tạo lại mỗi lần kết nối

const alive = w => !!w && !w.isDestroyed();
const sendStage = (ch, p) => { if (alive(stageWin)) stageWin.webContents.send(ch, p); };
const sendControl = (ch, p) => { if (alive(controlWin)) controlWin.webContents.send(ch, p); };
// Key đã lưu; nếu chưa có thì lấy từ biến môi trường GEMINI_API_KEY (có thể nhiều key, ngăn cách bằng dấu phẩy)
const effectiveKeys = () => (apiKeys.length ? apiKeys : parseKeys(process.env.GEMINI_API_KEY));
// Nền cảnh: chế độ nền xanh (key OBS) thì không vẽ cảnh
const sceneFile = () => (settings.stageBg === 'green' ? null : (SCENES[settings.scene] || SCENES.none).file);
// Model đang hiển thị: dạng AI đã đổi sang (nếu có), không thì model của nhân vật đã chọn
const shownModel = () => {
  const base = stageInfo(settings.character);
  const f = !getCharacter(settings.character).noForms && formOverride && FORMS[formOverride];
  return f ? { ...base, model: f.model, dir: f.dir } : base;
};
const stageConfig = () => ({ bg: settings.stageBg, showBoard: settings.showBoard, scene: sceneFile(), freeMotion: settings.freeMotion, character: shownModel() });

// Danh sách motion thật sự có trong thư mục motions/ của nhân vật đang chọn (không gồm idle).
const motionCache = new Map();   // id nhân vật -> { t, groups }: khỏi đọc ổ đĩa ở mỗi comment
function motionGroupsFor(s) {
  const ch = getCharacter(s.character);
  if (ch.kind !== 'live2d4') return [];
  const hit = motionCache.get(ch.id);
  if (hit && Date.now() - hit.t < 30000) return hit.groups;
  let groups = [];
  try { groups = motionGroupsOf(composedModel3(ch.model)); } catch (_) { groups = []; }
  motionCache.set(ch.id, { t: Date.now(), groups });
  return groups;
}

// Danh mục motion cho AI (nhãn, gợi ý, cảm xúc hợp, vừa dùng gần đây). Đọc tuning.json của nhân vật, có cache.
let lastSpeechMotion = '';   // motion vừa chạy theo câu nói, để AI không lặp lại liên tiếp
function motionCatalogFor(s) {
  const ch = getCharacter(s.character);
  const groups = motionGroupsFor(s);
  if (!groups.length || ch.kind !== 'live2d4') return groups;
  try {
    const tuning = JSON.parse(fs.readFileSync(path.join(RENDERER, ch.dir, 'tuning.json'), 'utf8'));
    return motionCatalog(tuning, groups, lastSpeechMotion);
  } catch (_) { return groups; }
}

// Danh mục cảm xúc của nhân vật đang chọn, đọc từ tuning.json (có cache). null = dùng bảng cảm xúc cũ.
const emotionCache = new Map();
function emotionsFor(s) {
  const ch = getCharacter(s.character);
  if (ch.kind !== 'live2d4' || !ch.dir) return null;
  const hit = emotionCache.get(ch.id);
  if (hit && Date.now() - hit.t < 30000) return hit.list;
  let list = null;
  try {
    list = emotionCatalog(JSON.parse(fs.readFileSync(path.join(RENDERER, ch.dir, 'tuning.json'), 'utf8')));
  } catch (_) { list = null; }
  if (list && !list.length) list = null;
  emotionCache.set(ch.id, { t: Date.now(), list });
  return list;
}
function emotionIdsFor(s) {
  const list = emotionsFor(s);
  return list ? list.map(e => e.id) : undefined;
}

// model3.json của nhân vật Live2D được tạo lúc phục vụ: có đủ biểu cảm và motion trong thư mục model
const live2d4Models = () => Object.values(CHARACTERS).filter(c => c.kind === 'live2d4').map(c => c.model);
function composedModel3(modelPath) {
  const base = JSON.parse(fs.readFileSync(path.join(RENDERER, modelPath), 'utf8'));
  const dirAbs = path.join(RENDERER, path.posix.dirname(modelPath));
  return composeModel3(base, folderFileList(fs, dirAbs));
}
function model3JsonFor(modelPath) {
  return Buffer.from(JSON.stringify(composedModel3(modelPath)), 'utf8');
}

/* ---------- lưu cài đặt (key được mã hoá bằng safeStorage nếu hệ điều hành hỗ trợ) ---------- */
const storeFile = () => path.join(app.getPath('userData'), 'kurumi-live.json');
function readStore() {
  try { return JSON.parse(fs.readFileSync(storeFile(), 'utf8')) || {}; } catch (_) { return {}; }
}
const STORE_VERSION = 31;   // v31: mặc định bốc ngẫu nhiên, trả lời mọi comment
function writeStore() {
  const data = { v: STORE_VERSION, settings };
  if (apiKeys.length) {
    const json = JSON.stringify(apiKeys);
    if (safeStorage.isEncryptionAvailable()) data.apiKeysEnc = safeStorage.encryptString(json).toString('base64');
    else data.apiKeys = apiKeys;
  }
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(storeFile(), JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    setStatus('Không lưu được cài đặt: ' + err.message);
    return false;
  }
}
function loadSecret(encKey, plainKey, st) {
  try {
    if (st[encKey] && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(st[encKey], 'base64'));
  } catch (_) {}
  return st[plainKey] || '';
}
// Đọc danh sách key; vẫn đọc được bản cũ chỉ lưu một key
function loadKeys(st) {
  try {
    if (st.apiKeysEnc && safeStorage.isEncryptionAvailable()) {
      const list = JSON.parse(safeStorage.decryptString(Buffer.from(st.apiKeysEnc, 'base64')));
      if (Array.isArray(list)) return parseKeys(list.join('\n'));
    }
  } catch (_) {}
  if (Array.isArray(st.apiKeys)) return parseKeys(st.apiKeys.join('\n'));
  return parseKeys(loadSecret('apiKeyEnc', 'apiKey', st));
}

/* ---------- trạng thái gửi cho bảng điều khiển ---------- */
function uiState() {
  return {
    settings,
    characters: listCharacters(),
    hasKey: effectiveKeys().length > 0,
    keyCount: effectiveKeys().length,
    keyFromEnv: !apiKeys.length && effectiveKeys().length > 0,
    connected,
    username,
    status,
    stageVisible: alive(stageWin) && stageWin.isVisible(),
    demo: !!demoTimer,
    tts: ttsState,
    engine: engine.snapshot(),
    video: videoQueue.snapshot(),
    form: { current: formOverride, trial: trial ? trial.snapshot(Date.now()) : null },
    giftsSeen: [...giftsSeen.values()].sort((a, b) => b.count - a.count).slice(0, 40)
  };
}
function pushState() { sendControl('ctl:state', uiState()); }
function setStatus(text) { status = text; pushState(); }

/* ---------- sân khấu: nói xong thì báo lại để bộ xử lý mới trả lời tiếp ---------- */
function waitStageDone(ms) {
  return new Promise(resolve => {
    const fn = () => { clearTimeout(t); resolve(); };
    const t = setTimeout(() => { if (pendingStageDone === fn) pendingStageDone = null; resolve(); }, ms);
    pendingStageDone = fn;
  });
}
ipcMain.on('stage:done', () => {
  const f = pendingStageDone;
  pendingStageDone = null;
  if (f) f();
});

// Giọng đọc được tạo sẵn ngay khi AI trả lời xong, trong lúc câu đó còn chờ tới lượt đọc
const audioJobs = new Map();   // id comment -> Promise<data URI>
function prefetchAudio(id, text) {
  if (!settings.voiceEnabled || !text) return;
  if (audioJobs.size > 20) audioJobs.delete(audioJobs.keys().next().value);
  audioJobs.set(id, speak(String(text)));
}

// Mọi câu nói trên sân khấu xếp lần lượt, không nói chồng nhau (AI, comment, quà, nghỉ giữa video)
let sayChain = Promise.resolve();
function sayOnStage(p) {
  const run = sayChain.then(() => sayOnStageNow(p));
  sayChain = run.catch(() => {});
  return run;
}

async function sayOnStageNow(p) {
  const text = String(p.text || '');
  const job = audioJobs.get(p.id);
  audioJobs.delete(p.id);
  const audio = settings.voiceEnabled ? await (job || speak(text)) : '';
  const readMs = Math.max(1200, Math.min(12000, text.length * 75));
  const acked = waitStageDone(audio ? 40000 : readMs + 1500);
  sendStage('stage:say', { ...p, audio });
  await acked;
  lastActivityAt = Date.now();
}

/* ---------- bộ xử lý comment ---------- */
/* ---------- trả lời tức thì (lời chào theo luật nhân vật): không xếp hàng, không gọi AI ---------- */
const instantState = {};          // lần cuối mỗi người được chào, để không spam
let instantSeq = 0;
let instantChain = Promise.resolve();   // các câu tức thì nối nhau, không nói chồng lên nhau

function instantSay(item, reply) {
  const id = 'i' + (++instantSeq);
  // đưa comment lên bảng ngay để khán giả thấy đã được đáp
  sendStage('stage:board', { id, kind: 'chat', name: item.name, text: item.text });
  instantChain = instantChain.then(() => sayOnStage({
    id, kind: 'instant', name: item.name, text: reply.text, action: reply.action, subtitleSec: settings.subtitleSec
  })).catch(() => {});
}

// Mọi comment chat đi qua đây (kết nối TikTok, demo, comment thử)
let lastActivityAt = Date.now();   // lần cuối có comment/quà hoặc nhân vật nói (để tự nói khi im lặng)
function handleChat(item) {
  if (!item || !item.text) return;
  if (item.kind === 'chat') chatTimes.push(Date.now());
  lastActivityAt = Date.now();
  brain.onIncoming(item);
  voteOnForm(item);   // khán giả có đang phản đối dạng mới không
  const musicReq = parseMusicRequest(item.text);
  if (musicReq && handleMusicCommand(item, musicReq)) return;   // lệnh nhạc: trả lời ngay, không gọi AI
  const rules = getCharacter(settings.character).rules;
  const hit = instantFor(item, rules, instantState);
  if (hit && hit.kind === 'skip') return;           // đang trong thời gian chờ của người này
  if (hit && hit.kind === 'reply') { instantSay(item, hit); return; }
  // hỏi về cảnh giới cao hơn: đáp ngay, không cần từ khoá hay xếp hàng
  const dfr = deferFor(item, rules);
  if (dfr) { instantSay(item, dfr); return; }
  engine.enqueue(item);
}

async function askReply(item, s) {
  // quà không có video được gắn: cảm ơn và báo sắp nhảy được, không cần AI
  if (item.kind === 'gift' && !hasLinkedVideo(s.giftVideos, item.giftName, s.videoEnabled)) {
    return noVideoGiftReply(item, quickState);
  }
  // lời chào và quà: đáp ngay bằng câu có sẵn, không chờ AI
  if (s.quickReplies) {
    const q = quickReply(item, quickState);
    if (q) return q;
  }
  // câu hỏi về cảnh giới cao hơn của nhân vật: trả lời ngay theo luật của nhân vật
  const d = deferFor(item, getCharacter(s.character).rules);
  if (d) return d;
  let raw;
  try {
    raw = await askGemini({
      apiKeys: effectiveKeys(),
      model: s.model,
      extraModels: s.extraModels,
      system: buildSystem(s, motionCatalogFor(s), formNoteFor(), emotionsFor(s)) + brain.systemSuffix(item),
      userText: buildUserText(item) + contextBlock(),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS)
    });
  } catch (err) {
    // mọi mô hình đều lỗi: dùng câu mẫu để viewer vẫn được đáp, rồi ghi nhật ký
    if (s.cannedFallback) {
      console.warn('[gemini] mọi mô hình lỗi, dùng câu mẫu dự phòng:', String(err && err.message).slice(0, 160));
      return cannedReply(quickState, Math.random, item.name);
    }
    if (err && err.name === 'TimeoutError') throw new Error('Gemini không phản hồi sau 25 giây. Kiểm tra kết nối mạng (hoặc VPN) rồi thử lại.');
    throw err;
  }
  const fx = extractFacts(raw);   // thẻ [fact:...] được tách ra trước khi đọc cảm xúc
  const reply = parseReply(fx.clean, emotionIdsFor(s));
  reply.facts = fx.facts;
  if (!reply.text) throw new Error('AI trả về nội dung rỗng');
  // chỉ giữ tên motion có thật; tên bịa ra thì bỏ
  reply.motion = resolveMotion(reply.motion, motionGroupsFor(s));
  if (reply.motion) lastSpeechMotion = reply.motion;
  remember(item, reply);
  brain.onTurn(item, reply);
  return reply;
}

const engine = createEngine({
  getSettings: () => settings,
  ask: async (item, s) => {
    const reply = await askReply(item, s);
    const sc = screen(reply.text);   // lọc từ cấm, làm sạch link và số điện thoại
    reply.text = sc.text;
    if (item.kind === 'self' && isRepetitive(reply.text, brain.recentSelf())) throw new Error('lượt tự nói lặp lại nội dung gần đây, bỏ qua');
    if (item.kind === 'self') brain.noteSelf(reply.text);
    prefetchAudio(item.id, reply && reply.text);   // tạo giọng đọc sớm, không chờ tới lượt
    return reply;
  },
  // nói xong câu có yêu cầu đổi dạng thì mới đổi (để câu hỏi "thấy ổn không" được nói trước)
  say: async p => { await sayOnStage(p); if (p.form) await requestForm(p.form); },
  onBoard: entry => sendStage('stage:board', entry),
  onChange: snap => { pushState(); sendReading(snap); }
});

// Báo sân khấu biết đang chờ AI cho những comment nào: nhân vật cúi nhìn khung comment để "đọc"
let lastReadingKey = '';
function sendReading(snap) {
  const ids = snap.asking.map(a => a.id);
  const key = ids.join(',');
  if (key === lastReadingKey) return;
  lastReadingKey = key;
  sendStage('stage:reading', { on: ids.length > 0, ids });
}

/* ---------- giọng đọc VieNeu (tts/tts_server.py chạy nền, app gọi qua 127.0.0.1) ---------- */
let ttsProc = null;
let ttsState = { state: 'off', msg: '' };
let ttsLog = null;
const setTts = (state, msg = '') => { ttsState = { state, msg }; pushState(); };

function ttsStart() {
  if (ttsProc) return;
  const py = settings.pythonPath || (process.platform === 'win32' ? 'python' : 'python3');
  const dataDir = app.getPath('userData');
  const models = path.join(dataDir, 'models-v2');
  try {
    fs.mkdirSync(models, { recursive: true });
    ttsLog = fs.createWriteStream(path.join(dataDir, 'tts.log'), { flags: 'a' });
  } catch (_) { ttsLog = null; }
  const env = { ...process.env, HF_HOME: models, HF_HUB_DISABLE_SYMLINKS: '1', PYTHONNOUSERSITE: '1', PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' };
  setTts('loading', 'Đang khởi động giọng đọc… (lần đầu sẽ tải mô hình, hơi lâu)');
  let proc;
  try {
    proc = spawn(py, [TTS_SCRIPT, '--port', String(TTS_PORT), '--voice', settings.voiceName], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  } catch (e) {
    ttsProc = null;
    setTts('error', 'Không chạy được Python: ' + e.message);
    return;
  }
  ttsProc = proc;
  let lastErr = '';
  const onData = d => {
    const t = d.toString();
    if (ttsLog) ttsLog.write(t);
    if (t.includes('VieNeu sẵn sàng')) { if (ttsProc === proc) setTts('ready', 'Giọng đọc sẵn sàng'); }
    else if (t.trim()) lastErr = t.trim().split('\n').pop().slice(0, 300);
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  const fail = msg => {
    if (ttsProc !== proc) return;   // đã chủ động dừng
    ttsProc = null;
    setTts('error', msg + (lastErr ? ' — ' + lastErr : '') + ' (chi tiết trong tts.log)');
  };
  proc.on('error', e => fail('Không chạy được Python: ' + e.message));
  proc.on('exit', code => fail(`Giọng đọc đã dừng (mã ${code}). Cần Python 3.10+ và lệnh: pip install vieneu`));
}

// Dừng tiến trình Python và toàn bộ cây con. Trên Windows, python có thể là shim chạy python.exe thật
// bằng tiến trình con; p.kill() chỉ giết shim nên python.exe vẫn sống. Dùng taskkill /T để giết cả cây.
function killTts() {
  return new Promise(resolve => {
    const p = ttsProc;
    ttsProc = null;
    if (!p || p.exitCode !== null || p.signalCode) { setTts('off'); return resolve(); }
    let finished = false;
    const done = () => { if (finished) return; finished = true; setTts('off'); resolve(); };
    p.once('exit', done);
    setTimeout(done, 3000);   // không chờ quá 3 giây
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
      } catch (_) { try { p.kill(); } catch (__) {} }
    } else {
      try { p.kill('SIGTERM'); } catch (_) {}
      setTimeout(() => { try { p.kill('SIGKILL'); } catch (_) {} }, 1500);
    }
  });
}

function ttsStop() { killTts(); }

async function waitTtsReady(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ttsState.state === 'ready') return true;
    if (ttsState.state === 'error' || ttsState.state === 'off') return false;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

// Trả về data URI WAV, hoặc chuỗi rỗng nếu không đọc được (khi đó sân khấu chỉ hiện chữ)
async function speak(text, force = false) {
  if (!settings.voiceEnabled && !force) return '';
  if (!ttsProc && (ttsState.state !== 'error' || force)) ttsStart();
  if (!(await waitTtsReady(60000))) return '';
  try {
    const r = await fetch(`http://127.0.0.1:${TTS_PORT}/speak`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: String(text).slice(0, 160) }),
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) return '';
    return 'data:audio/wav;base64,' + Buffer.from(await r.arrayBuffer()).toString('base64');
  } catch (_) {
    return '';
  }
}

/* ---------- TikTok Live (cách kết nối giống Draw Live) ---------- */
async function loadConnector() {
  const mod = await import('tiktok-live-connector');
  const lib = { ...(mod.default && typeof mod.default === 'object' ? mod.default : {}), ...mod };
  const Conn = lib.TikTokLiveConnection || lib.WebcastPushConnection;
  if (!Conn) throw new Error('Không tìm thấy class kết nối trong tiktok-live-connector (kiểm tra lại phiên bản đã cài)');
  return { Conn, lib };
}
const errName = err => String((err && (err.constructor?.name || err.name)) || '');
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
const strOrNull = v => (v === undefined || v === null || v === '' ? null : String(v));
const idOf = d => { const u = d.user || {}; return strOrNull(d.uniqueId ?? u.uniqueId ?? u.displayId ?? d.userId ?? u.userId ?? u.nickname ?? d.nickname); };
const nameOf = d => { const u = d.user || {}; return strOrNull(d.nickname ?? u.nickname ?? d.uniqueId ?? u.uniqueId); };
function commentOf(d) {
  const pick = o => { if (!o || typeof o !== 'object') return ''; for (const k of ['comment', 'content', 'text', 'message', 'msg']) { const v = o[k]; if (typeof v === 'string' && v.trim()) return v; } return ''; };
  return pick(d) || pick(d.data) || pick(d.chat) || pick(d.message) || '';
}

// Đổi lỗi kỹ thuật của thư viện thành hướng dẫn cụ thể
function friendlyConnectError(err) {
  const raw = String((err && err.message) || (err && err.exception && err.exception.message) || err || '');
  const short = raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
  if (/sign request|status code 403|403/i.test(raw)) {
    return 'TikTok từ chối yêu cầu (403). Hãy: (1) kiểm tra username có đang live không; '
      + '(2) đợi vài phút rồi kết nối lại. Chi tiết: ' + short;
  }
  if (/cursor/i.test(raw)) {
    return 'TikTok trả về dữ liệu phòng thiếu thông tin (Missing cursor). Thường do TikTok thay đổi hoặc chặn yêu cầu không có ký. '
      + 'Hãy: (1) cập nhật tiktok-live-connector (npm install); (2) kiểm tra username đang live. Chi tiết: ' + short;
  }
  if (/UserOffline|offline|not live|isn't live/i.test(raw) || /UserOffline/.test(errName(err))) return 'Tài khoản này hiện không live. ' + short;
  if (/SignatureRateLimit|rate limit|429/i.test(raw) || /SignatureRateLimit/.test(errName(err))) {
    return 'Bị giới hạn tốc độ ký của TikTok/Euler. Đợi vài phút rồi thử lại, hoặc đặt biến môi trường EULER_API_KEY (key miễn phí tại eulerstream.com). Chi tiết: ' + short;
  }
  if (/ConnectTimeout|timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND/i.test(raw) || /ConnectTimeout/.test(errName(err))) {
    return 'Kết nối TikTok bị quá thời gian hoặc mạng gián đoạn. Kiểm tra mạng/VPN rồi thử lại. Chi tiết: ' + short;
  }
  if (/not found|does not exist|INVALID_UNIQUE_ID/i.test(raw)) return 'Không tìm thấy username này. Kiểm tra lại tên (không có khoảng trắng). ' + short;
  if (/Failed to retrieve Room ID/i.test(raw)) {
    return 'Không lấy được phòng live của username này. Kiểm tra: (1) tên đúng và không có khoảng trắng; (2) tài khoản đang live; (3) mạng/VPN không chặn TikTok. Chi tiết: ' + short;
  }
  return short;
}

// Trạng thái kết nối: wantLive = username đang muốn giữ kết nối (null = không muốn)
let wantLive = null;
let reconnectTimer = null;
let reconnectTries = 0;
const MAX_RECONNECT = 5;
const MAX_CONNECT_TRIES = 3;

// Giống Draw Live: để thư viện dùng tuỳ chọn mặc định (chỉ thêm key Euler nếu có). Truyền object rỗng vì bản 2.x bắt buộc có tham số options.
// Chat cũ trong gói dữ liệu đầu tiên được bỏ qua bằng cờ `live` (xem attempt), không cần đổi tuỳ chọn của thư viện.
const connectOptions = () => (process.env.EULER_API_KEY ? { signApiKey: process.env.EULER_API_KEY } : {});

// Số liệu chẩn đoán, hiện trên thanh trạng thái mỗi 2 giây (học từ Draw Live)
let liveStats = null;
let liveViewers = null;          // số người xem trực tiếp (từ TikTok), null khi chưa biết
const chatTimes = [];            // thời điểm các comment gần đây, để đo độ "vắng"
function isQuietAudience(s) {
  if (!s.selfQuietBoost) return false;
  const now = Date.now();
  while (chatTimes.length && now - chatTimes[0] > 5 * 60 * 1000) chatTimes.shift();
  const perMin = chatTimes.length / 5;
  const fewViewers = liveViewers !== null && liveViewers < s.selfQuietViewers;
  const fewComments = perMin < s.selfQuietCommentsPerMin;
  return fewViewers || fewComments;
}
let statsTimer = null;
function stopStats() { if (statsTimer) { clearInterval(statsTimer); statsTimer = null; } }
function startStats(user, roomId) {
  stopStats();
  statsTimer = setInterval(() => {
    const st = liveStats;
    if (!st || !connected) return;
    let t = `Đang nghe live @${user} (room ${roomId}) · comment ${st.chat} · quà ${st.gift} · gói tin ${st.raw}${st.ws ? '' : ' · WebSocket: chưa mở'}`;
    if (st.emptyChat) t += ` · ${st.emptyChat} comment rỗng (trường: ${st.chatKeys})`;
    if (st.skipped) t += ` · bỏ qua ${st.skipped} sự kiện thiếu id (${st.sample})`;
    if (st.dup) t += ` · trùng ${st.dup}`;
    const es = engine.snapshot();
    const ks = keyStatus(effectiveKeys());
    if (ks.total) t += ` · key ${ks.total - ks.cooling}/${ks.total} sẵn sàng`;
    t += ` · đã trả lời ${es.stats.replied} · bỏ qua ${es.stats.skipped} · lỗi ${es.stats.errors}`;
    const lastSkip = es.feed.find(f => f.status === 'skipped');
    const lastErr = es.feed.find(f => f.status === 'error');
    if (lastSkip) t += ` · bỏ qua gần nhất: ${lastSkip.detail}`;
    if (lastErr) t += ` · lỗi gần nhất: ${String(lastErr.detail).slice(0, 120)}`;
    setStatus(t);
  }, 2000);
}

// Các lỗi này thử lại cũng vô ích, dừng ngay
const FATAL_ERRORS = /UserOffline|InvalidUniqueId|AlreadyConnected|AlreadyConnecting/;
const isFatal = err => FATAL_ERRORS.test(errName(err)) || /UserOffline|không tồn tại|INVALID_UNIQUE_ID/i.test(String((err && err.message) || ''));

function clearReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

async function disconnectTikTok() {
  stopStats();
  liveViewers = null;
  clearReconnect();
  wantLive = null;
  reconnectTries = 0;
  if (conn) { const c = conn; conn = null; try { c.disconnect(); } catch (_) {} }
  connected = false;
}

function scheduleReconnect(user) {
  clearReconnect();
  if (reconnectTries >= MAX_RECONNECT) {
    wantLive = null;
    setStatus('Mất kết nối và không nối lại được sau ' + MAX_RECONNECT + ' lần thử. Bấm Kết nối để thử lại.');
    return;
  }
  reconnectTries++;
  const delay = Math.min(30000, 3000 * 2 ** (reconnectTries - 1));
  setStatus(`Mất kết nối. Sẽ nối lại @${user} sau ${Math.round(delay / 1000)} giây (lần ${reconnectTries}/${MAX_RECONNECT})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (wantLive === user) attempt(user, 1);
  }, delay);
}

// Một lần kết nối. Lỗi tạm thời được thử lại vài lần, lỗi cố định thì dừng.
async function attempt(user, n) {
  let c = null;
  try {
    const { Conn, lib } = await loadConnector();
    const WE = lib.WebcastEvent || {}, CE = lib.ControlEvent || {};
    c = new Conn(user, connectOptions());
    conn = c;
    let ended = false;   // live đã kết thúc: không nối lại
    let live = false;    // false trong lúc connect(): gói dữ liệu đầu tiên chứa chat cũ, không trả lời
    const st = liveStats = { chat: 0, gift: 0, raw: 0, skipped: 0, dup: 0, ws: false, sample: null, emptyChat: 0, chatKeys: '' };
    c.on(WE.CHAT || 'chat', d => {
      if (conn !== c || !live) return;
      st.chat++;
      const text = commentOf(d);
      if (!text && !st.chatKeys) st.chatKeys = Object.keys(d || {}).join(',');
      if (!text) { st.emptyChat++; return; }
      const uid = idOf(d);
      if (!uid) { st.skipped++; if (!st.sample) st.sample = 'keys: ' + Object.keys(d || {}).join(','); return; }
      if (deduper.seenBefore(msgIdOf(d))) { st.dup++; return; }   // gói tin gửi lại: bỏ qua
      handleChat({ kind: 'chat', uid, name: nameOf(d) || uid, text });
    });
    c.on(WE.GIFT || 'gift', d => {
      // quà chuỗi (streak) chỉ tính khi chuỗi kết thúc: bản 1.x repeatEnd là boolean, bản 2.x là số 0/1
      if (conn !== c || !live || d.repeatEnd === false || Number(d.repeatEnd) === 0) return;
      const uid = idOf(d);
      if (!uid) { st.skipped++; if (!st.sample) st.sample = 'keys: ' + Object.keys(d || {}).join(','); return; }
      const each = Number(d.giftDetails?.diamondCount ?? d.diamondCount ?? (d.gift && (d.gift.diamond_count ?? d.gift.diamondCount)) ?? 1) || 1;
      if (deduper.seenBefore(msgIdOf(d))) { st.dup++; return; }
      st.gift++;
      lastActivityAt = Date.now();
      const giftName = strOrNull(d.giftName ?? (d.giftDetails && d.giftDetails.giftName) ?? (d.gift && d.gift.name)) || '';
      const diamonds = each * (Number(d.repeatCount) || 1);
      if (!giftName && !giftKeysLogged) { giftKeysLogged = true; logApp('gift không có tên quà, các trường: ' + Object.keys(d || {}).join(',')); }
      rememberGift(giftName, each);
      engine.enqueue({ kind: 'gift', uid, name: nameOf(d) || uid, diamonds, giftName });
      onGiftVideo({ giftName, name: nameOf(d) || uid, diamonds });
    });
    c.on(WE.ROOM_USER || 'roomUser', d => {
      if (conn !== c) return;
      const n = Number(d.viewerCount);
      if (Number.isFinite(n) && n >= 0) liveViewers = n;
    });
    c.on(WE.LIKE || 'like', d => {
      if (conn !== c || !live) return;
      if (deduper.seenBefore(msgIdOf(d))) return;   // gói tin gửi lại: không đếm trùng
      addHearts(Number(d.likeCount) || 1);
    });
    c.on(CE.DECODED_DATA || 'decodedData', () => { st.raw++; });
    c.on(CE.WEBSOCKET_CONNECTED || 'websocketConnected', () => { st.ws = true; live = true; });   // gói dữ liệu đầu đã xử lý xong trước khi mở WebSocket: từ đây nhận chat
    c.on(CE.ERROR || 'error', err => {
      if (conn !== c) return;
      const msg = (err && (err.info || err.message || (err.exception && err.exception.message))) || err;
      logApp('connector error: ' + String(msg));
      setStatus('Lỗi từ thư viện: ' + String(msg).slice(0, 200));
    });
    c.on(CE.DISCONNECTED || 'disconnected', () => {
      if (conn !== c) return;             // ngắt do chính app (disconnectTikTok) thì bỏ qua
      stopStats();
      conn = null; connected = false;
      if (ended) { setStatus('Live đã kết thúc'); wantLive = null; return; }
      if (wantLive === user) scheduleReconnect(user);
      else setStatus('Đã ngắt kết nối live');
    });
    c.on(WE.STREAM_END || 'streamEnd', () => {
      if (conn !== c) return;
      stopStats();
      ended = true; wantLive = null; connected = false;
      setStatus('Live đã kết thúc');
    });

    const state = await c.connect();
    live = true;         // từ đây mới nhận chat/quà
    connected = true;
    username = user;
    reconnectTries = 0;
    setStatus(`Đang nghe live @${user} (room ${state.roomId})`);
    startStats(user, state.roomId);
    return { ok: true, roomId: state.roomId };
  } catch (err) {
    if (c) { const f = c; if (conn === f) conn = null; try { f.disconnect(); } catch (_) {} }
    stopStats();
    connected = false;
    const msg = friendlyConnectError(err);
    logApp(`connect @${user} lần ${n} lỗi: ${String((err && (err.stack || err.message)) || err).slice(0, 600)}`);
    if (isFatal(err)) { wantLive = null; reconnectTries = 0; setStatus('Không kết nối được: ' + msg); return { ok: false, error: msg }; }
    if (wantLive !== user) return { ok: false, error: 'Đã huỷ kết nối' };
    if (reconnectTries > 0) {                       // đang nối lại: thử tiếp theo lịch
      scheduleReconnect(user);
      return { ok: false, error: msg };
    }
    if (n < MAX_CONNECT_TRIES) {
      setStatus(`Chưa kết nối được (lần ${n}/${MAX_CONNECT_TRIES}), thử lại… ${msg}`);
      await sleepMs(2000 * n);
      if (wantLive !== user) return { ok: false, error: 'Đã huỷ kết nối' };
      return attempt(user, n + 1);
    }
    wantLive = null;
    setStatus('Không kết nối được: ' + msg);
    return { ok: false, error: msg };
  }
}

async function connectTikTok(name) {
  await disconnectTikTok();
  const user = String(name || '').replace(/^@/, '').trim();
  if (!user) return { ok: false, error: 'Chưa nhập username TikTok' };
  wantLive = user;
  return attempt(user, 1);
}

/* ---------- chế độ demo: comment giả để thử khi chưa live ---------- */
const DEMO_NAMES = ['Mây Hồng', 'Bé Gấu', 'Minh Nhật', 'An Nhiên', 'Linh Chi', 'Hải Long'];
const DEMO_TEXTS = [
  '{bot} ơi, hôm nay bạn thế nào?', '{bot} thích màu gì nhất?', 'Chào {bot} nha!',
  '? bạn đã ăn tối chưa', '{bot} hát một câu đi', 'mình thích giọng bạn quá', 'trời đẹp quá hôm nay',
  '{bot} có nhớ mình không?', 'hôm nay live vui quá'
];
const botName = () => getCharacter(settings.character).name;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function startDemo() {
  if (demoTimer) return;
  const tick = () => {
    const name = pick(DEMO_NAMES);
    if (Math.random() < 0.3) addHearts(pick([1, 5, 20]));   // demo: thả tim giả để thử lời cảm ơn tim
    if (Math.random() < 0.15) {
      const diamonds = pick([1, 10, 100]);
      const names = (settings.giftVideos || []).map(r => r.gift).filter(g => g !== '*');
      const giftName = names.length && Math.random() < 0.7 ? pick(names) : pick(['Rose', 'Doughnut']);
      rememberGift(giftName, diamonds);
      engine.enqueue({ kind: 'gift', uid: 'demo:' + name, name, diamonds, giftName });
      onGiftVideo({ giftName, name, diamonds });
    }
    else handleChat({ kind: 'chat', uid: 'demo:' + name, name, text: pick(DEMO_TEXTS).replace(/\{bot\}/g, botName()) });
    demoTimer = setTimeout(tick, 2500 + Math.random() * 4500);
  };
  demoTimer = setTimeout(tick, 300);
  pushState();
}
function stopDemo() { clearTimeout(demoTimer); demoTimer = null; pushState(); }

/* ---------- cửa sổ ---------- */
const prefs = preloadName => ({
  preload: path.join(__dirname, preloadName),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  backgroundThrottling: false
});

// Phát video quà: chỉ phục vụ file đã khai báo trong bảng quà (theo id), có hỗ trợ tua (Range)
function serveVideo(req, res, id) {
  const rule = (settings.giftVideos || []).find(r => r.id === id);
  const file = rule && rule.path;
  if (!file) { res.writeHead(404); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
    const size = st.size;
    const type = VIDEO_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    let start = 0, end = size - 1, code = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
      else { start = Math.max(0, size - Number(m[2])); }
      if (start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
      code = 206;
    }
    const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-cache' };
    if (code === 206) headers['content-range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(code, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

/* ---------- nhạc nền sân khấu ---------- */
// Thư mục nhạc: nếu người dùng chỉ định thì dùng, không thì dùng thư mục đi kèm app.
function musicRoot() {
  return settings.musicDir && fs.existsSync(settings.musicDir) ? settings.musicDir : path.join(RENDERER, 'assets', 'music');
}
function musicTracks() {
  try { return trackList(fs.readdirSync(musicRoot())); } catch (_) { return []; }
}
// Chỉ phục vụ đúng các file đã liệt kê trong thư mục nhạc (không cho đường dẫn tuỳ ý)
function serveMusic(req, res, name) {
  if (!musicTracks().some(t => t.id === name)) { res.writeHead(404); return res.end(); }
  const file = path.join(musicRoot(), name);
  fs.stat(file, (err, st) => {
    if (err) { res.writeHead(404); return res.end(); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    let start = 0, end = st.size - 1, status = 200;
    const m = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (m) {
      if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), st.size - 1); }
      else if (m[2]) start = Math.max(0, st.size - Number(m[2]));
      status = 206;
    }
    if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'max-age=3600' };
    if (status === 206) headers['content-range'] = `bytes ${start}-${end}/${st.size}`;
    res.writeHead(status, headers);
    fs.createReadStream(file, { start, end }).pipe(res);
  });
}
function musicConfig() {
  return { action: 'config', enabled: settings.musicEnabled, volume: settings.musicVolume };
}

// Lệnh nhạc từ comment: đổi bài, bật nhạc, hoặc bật một bài theo tên. Trả lời ngay, không qua AI.
// Không có lệnh tắt nhạc trong comment (tắt nhạc chỉ làm được trong bảng điều khiển).
// Chống spam: mỗi người 15 giây, cả sân 5 giây.
const musicPerUser = createCooldown({ ms: 15000 });
const musicGlobal = createCooldown({ ms: 5000 });
const MUSIC_MISSING = 'Bài {q} tạm thời chưa có nha {name}, bạn chọn bài khác thử nhé!';
function handleMusicCommand(item, req) {
  const now = Date.now();
  const key = String(item.uid || item.name || '?');
  if (!musicGlobal.canAcquire('g', now) || !musicPerUser.canAcquire(key, now)) return true;   // im lặng, không spam
  musicGlobal.tryAcquire('g', now);
  musicPerUser.tryAcquire(key, now);
  const name = String(item.name || 'bạn').slice(0, 30);
  let text;
  if (req.kind === 'off') {
    text = `Mình thích nghe nhạc lắm, không muốn tắt đâu nha ${name}~`;
  } else if (req.kind === 'play') {
    const found = L_findTrack(musicTracks(), req.query);
    if (!found || !isSafe(req.query)) {
      text = MUSIC_MISSING.replace('{q}', `"${req.query.slice(0, 30)}"`).replace('{name}', name);
    } else {
      sendStage('stage:music', { action: 'play', id: found.id });
      text = `Okee ${name}, mình bật bài ${found.title} nha!`;
    }
  } else if (req.kind === 'on') {
    text = settings.musicEnabled ? `Nhạc đang phát rồi nè ${name}~` : `Nhạc đang nghỉ một chút nha ${name}, đợi mình xíu nhé!`;
  } else {   // next
    if (!settings.musicEnabled) text = `Nhạc đang nghỉ một chút nha ${name}, đợi mình xíu nhé!`;
    else { sendStage('stage:music', { action: 'next' }); text = `Okee ${name}, đổi bài nha!`; }
  }
  instantSay(item, { text, action: 'warm' });
  return true;
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let rel;
      try {
        const p = new URL(req.url, 'http://127.0.0.1').pathname;
        if (p.startsWith('/video/')) return serveVideo(req, res, decodeURIComponent(p.slice(7)));
        if (p.startsWith('/music/')) return serveMusic(req, res, decodeURIComponent(p.slice(7)));
        rel = p === '/' ? 'stage.html' : decodeURIComponent(p).replace(/^\/+/, '');
      } catch (_) { res.writeHead(400); return res.end(); }
      const file = path.resolve(RENDERER, rel);
      if (!file.startsWith(RENDERER + path.sep)) { res.writeHead(403); return res.end(); }
      const relPosix = rel.replace(/\\/g, '/');
      if (live2d4Models().includes(relPosix)) {
        try {
          res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-cache' });
          return res.end(model3JsonFor(relPosix));
        } catch (err) { res.writeHead(500); return res.end('model error'); }
      }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        // model, motion và nền: cache 1 giờ; html/js/css/json luôn kiểm tra lại (để thêm motion là thấy ngay)
        const heavy = /^(models|vendor|backgrounds)\//.test(rel.replace(/\\/g, '/')) && !/\.json$/i.test(file);
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': heavy ? 'max-age=3600' : 'no-cache' });
        res.end(data);
      });
    });
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
  });
}

/* ---------- video quà tặng: hàng đợi, mỗi lúc một video trên sân khấu ---------- */
// Lời nói giữa hai video (chọn ngẫu nhiên, không lặp lại câu vừa nói)
const VIDEO_TIRED = [
  'Ôi mệt ghê đi~ Để em thở chút xíu nha!',
  'Trời ơi mệt quá đi mất, em xỉu luôn á...',
  'Hừ, mệt ghê luôn á, nghỉ tí nha mọi người~'
];
const VIDEO_MORE = [
  'Trời ơi, còn nữa không vậy?? Em hơi mệt rồi nè...',
  'Ơ, hết rồi hả? Còn nữa không vậy mọi người?'
];
const VIDEO_RESUME = [
  'Được rồi, tiếp tục nào!',
  'Thôi được rồi, tiếp tục nào nha~'
];
const lastBreakLine = {};
function pickBreakLine(list, key) {
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastBreakLine[key]) i = (i + 1) % list.length;
  lastBreakLine[key] = i;
  return list[i];
}
const sleepFor = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
let breakSeq = 0;

// Nghỉ giữa hai video. Có video kế: than mệt, ở khoảng 60% thời gian nghỉ thì nói "được rồi, tiếp tục nào",
// rồi chờ đủ thời gian nghỉ mới phát video kế. Hết video: chỉ hỏi còn nữa không.
async function videoInterlude(hasNext) {
  const gapMs = Math.max(0, Number(settings.videoGapSec) || 0) * 1000;
  const talk = !!settings.videoBreakTalk && alive(stageWin);
  const t0 = Date.now();
  const say = (text, kind) => {
    breakSeq++;
    return sayOnStage({ id: 'vb' + breakSeq, kind: 'video-break', name: botName(), text, action: 'neutral', subtitleSec: settings.subtitleSec, tag: kind });
  };
  if (!hasNext) {
    if (talk) await say(pickBreakLine(VIDEO_MORE, 'more'), 'more');
    return;
  }
  if (talk) {
    await say(pickBreakLine(VIDEO_TIRED, 'tired'), 'tired');
    await sleepFor(gapMs * 0.6 - (Date.now() - t0));
    if (videoQueue.pendingCount() > 0) await say(pickBreakLine(VIDEO_RESUME, 'resume'), 'resume');
  }
  await sleepFor(gapMs - (Date.now() - t0));
}

const GIFT_HOLD_MS = 5000;       // chờ sau khi hàng chờ comment đã ngắt
const GIFT_FX_MS = 5000;         // icon bùng nổ rồi biến mất sau 5 giây
let introSeq = 0;
async function giftIntro(item) {
  await sayChain;                                   // câu đang nói phải nói hết trước
  if (item.introDone) return;                       // đã cảm ơn rồi (hàng chờ được giữ lại và thử lại)
  await sleepFor(GIFT_HOLD_MS);
  introSeq++;
  sendStage('stage:giftFx', { icon: '/assets/gifts/' + giftIcon(item.gift) + '.png', count: 24, durationMs: GIFT_FX_MS });
  const thanks = sayOnStage({
    id: 'gt' + introSeq, kind: 'gift', name: item.name, text: `Cảm ơn ${item.name} đã tặng ${item.gift} nha!`,
    action: 'happy', subtitleSec: settings.subtitleSec
  });
  await sleepFor(GIFT_FX_MS);                       // icon chạy đúng 5 giây rồi biến mất
  item.introDone = true;
  await thanks;                                     // câu cảm ơn nói hết rồi mới tới video
}

const videoQueue = createVideoQueue({
  interlude: videoInterlude,
  // video quà: câu đang nói nói hết -> chờ 5 giây -> cảm ơn + icon bùng nổ 5 giây -> mới phát video
  beforeStart: giftIntro,
  // trong lúc có video (kể cả các video nối tiếp), hàng chờ trả lời tạm giữ, xong thì tiếp tục
  onBusy: on => engine.setVideoHold(on),
  send: (ch, payload) => {
    // sân khấu chưa tải xong thì không gửi được: báo lỗi để bỏ qua video này
    if (!alive(stageWin) || stageWin.webContents.isLoading()) return false;
    sendStage(ch, payload);
    return true;
  },
  getLimit: () => settings.maxVideoQueue,
  getVolume: () => settings.videoVolume,
  onChange: () => pushState()
});

// Quà đã thấy trong phiên này (để gợi ý tên quà khi lập bảng)
const giftsSeen = new Map();
let giftKeysLogged = false;   // chỉ ghi nhật ký một lần nếu TikTok không gửi tên quà (để chẩn đoán)
function rememberGift(giftName, diamonds) {
  const name = String(giftName || '').trim().slice(0, 60);
  if (!name) return;
  const prev = giftsSeen.get(name);
  giftsSeen.set(name, { name, diamonds: Number(diamonds) || 0, count: (prev ? prev.count : 0) + 1 });
}

// Quà vào: nếu có trong bảng quà thì xếp video vào hàng đợi
function onGiftVideo({ giftName, name, diamonds }) {
  if (!settings.videoEnabled) return;
  const rule = findVideoRule(settings.giftVideos, giftName);
  if (!rule) return;
  videoQueue.enqueue({ rule: rule.id, gift: giftName || rule.gift, name, diamonds });
}

/* ---------- trí nhớ ngắn: vài lượt trò chuyện gần nhất để AI nối tiếp câu chuyện ---------- */
const recentTurns = [];
function remember(item, reply) {
  const said = item.kind === 'gift' ? `[quà ${item.diamonds} kim cương]` : String(item.text || '').slice(0, 80);
  recentTurns.push({ name: item.name, said, reply: String(reply.text || '').slice(0, 120) });
  if (recentTurns.length > 6) recentTurns.shift();
}
/* ---------- trí nhớ dài hạn, tâm trạng, tự tương tác (v3) ---------- */
const memoryFile = () => path.join(app.getPath('userData'), 'kurumi-memory.json');
const memory = createMemory();
const mood = createMood();
const autonomy = createAutonomy({ config: { idleSec: 45, minGapSec: 60, maxPerHour: 20, recapEveryMin: 15 } });
const brain = {
  load() { try { memory.load(JSON.parse(fs.readFileSync(memoryFile(), 'utf8'))); } catch (_) { /* lần đầu chưa có file */ } },
  save() { try { fs.writeFileSync(memoryFile(), JSON.stringify(memory.dump())); } catch (err) { logApp('lưu trí nhớ lỗi: ' + err.message); } },
  onIncoming(item) {
    autonomy.noteActivity();
    if (item.kind === 'gift') mood.onGift(item.diamonds);
    else mood.onChat();
  },
  onTurn(item, reply) {
    const isSelf = item.kind === 'self';
    if (!isSelf && item.uid && settings.factMemory) {
      const who = { uid: item.uid, name: item.name };
      const found = [...(reply.facts || []), ...heuristicFacts(item.text)];
      for (const f of found) memory.rememberFact(who, f);
    }
    saver.push(1);
    memory.addEpisode({
      kind: item.kind === 'gift' ? 'gift' : isSelf ? 'self' : 'chat',
      who: isSelf ? null : { uid: item.uid, name: item.name },
      text: item.kind === 'gift' ? `[quà ${item.diamonds} kim cương]` : item.text,
      reply: reply.text,
      diamonds: item.diamonds
    });
  },
  systemSuffix(item) {
    const who = item.kind === 'self' ? null : { uid: item.uid, name: item.name };
    const block = buildMemoryBlock(memory.recall({ who, query: item.text || '' }), mood.describe());
    const rules = settings.factMemory ? '\n\n' + FACT_RULE : '';
    return '\n\n' + buildIdentityBlock() + rules + (block ? '\n\n' + block : '');
  },
  noteSelf(text) { recentSelfTexts.push(text); if (recentSelfTexts.length > 5) recentSelfTexts.shift(); },
  recentSelf: () => recentSelfTexts
};
const recentSelfTexts = [];
const saver = createBatcher({ maxWaitMs: 3000, maxItems: 50, flush: () => brain.save() });

function contextBlock() {
  if (!recentTurns.length) return '';
  return '\n\nLịch sử gần đây (để nối tiếp câu chuyện, đừng lặp lại nguyên văn):\n' +
    recentTurns.map(t => `- ${t.name}: ${t.said} → bạn: ${t.reply}`).join('\n');
}

/* ---------- đổi dạng (model) do AI quyết định, khán giả có thể phản đối để đổi lại ---------- */
const FORM_COOLDOWN_MS = 90000;   // hai lần đổi dạng cách nhau ít nhất 90 giây
const REVERT_LINES = [
  'Thôi được rồi, mình biến về dạng cũ cho mọi người vừa lòng nha~',
  'Hừ, mọi người không thích thì mình về dạng cũ liền nè, hihi!'
];

function formNoteFor() {
  if (getCharacter(settings.character).noForms) return null;   // nhân vật này không có dạng để đổi
  return { current: formOverride, canChange: !trial && Date.now() - lastFormAt >= FORM_COOLDOWN_MS };
}

// Tải lại sân khấu và chờ nó sẵn sàng. Trong lúc tải không phát video; xong thì phát tiếp.
function reloadStage() {
  return new Promise(resolve => {
    if (!alive(stageWin)) return resolve();
    videoQueue.setHold(true);
    videoQueue.reset();
    const t = setTimeout(() => { stageInitWaiter = null; videoQueue.setHold(false); resolve(); }, 15000);
    stageInitWaiter = () => { clearTimeout(t); videoQueue.setHold(false); resolve(); };
    stageWin.webContents.reload();
  });
}

async function setForm(next) {
  if (next === formOverride) return;
  formOverride = next;
  lastFormAt = Date.now();
  trial = next ? createFormTrial({ form: next, now: Date.now() }) : null;
  await reloadStage();
  pushState();
}

// AI yêu cầu đổi dạng: chỉ nhận tên dạng có thật, không đổi quá dày
async function requestForm(name) {
  if (getCharacter(settings.character).noForms) return;
  const next = name === 'base' ? null : name;
  if (next !== null && !FORM_IDS.includes(next)) return;
  if (next === formOverride) return;
  if (next !== null && (Date.now() - lastFormAt < FORM_COOLDOWN_MS || !alive(stageWin))) return;
  await setForm(next);
}

// Mỗi comment trong lúc thử dạng mới là một phiếu. Đủ phản đối thì nhân vật nói rồi về dạng cũ.
function voteOnForm(item) {
  if (!trial || item.kind !== 'chat') return;
  const v = trial.vote(item.uid, item.text, Date.now());
  if (v.revert) { trial = null; revertForm(); }
  else if (v.done) trial = null;   // hết thời gian thử: giữ dạng mới
}

async function revertForm() {
  breakSeq++;
  try {
    await sayOnStage({ id: 'rv' + breakSeq, kind: 'form', name: botName(), text: pickBreakLine(REVERT_LINES, 'revert'), action: 'warm', subtitleSec: settings.subtitleSec });
  } catch (_) {}
  await setForm(null);
}

/* ---------- đếm tim ẩn: không hiển thị, cứ đủ mốc thì cảm ơn tim của các bạn ---------- */
const HEART_LINES = [
  'Ôi tim của các bạn bay tới tấp luôn kìa! Cảm ơn tim của các bạn nhiều lắm nha~',
  'Trời ơi, nhiều tim quá! Mình cảm ơn tim của các bạn nha, thương các bạn quá trời!',
  'Tim của các bạn làm mình vui xỉu luôn á, cảm ơn tim của các bạn nhiều nha!'
];
function addHearts(n) {
  if (!heartCounter) heartCounter = createHeartCounter({ step: settings.heartStep, minGapMs: 60000 });
  const r = heartCounter.add(n, Date.now());
  if (!r.thank) return;
  breakSeq++;
  sayOnStage({ id: 'h' + breakSeq, kind: 'heart', name: botName(), text: pickBreakLine(HEART_LINES, 'heart'), action: 'warm', subtitleSec: settings.subtitleSec }).catch(() => {});
}

function createStageWindow() {
  stageWin = new BrowserWindow({
    width: 540, height: 960, minWidth: 270, minHeight: 480,
    backgroundColor: '#0b0709',
    title: 'Kurumi Live - Sân khấu',
    webPreferences: prefs('preload-stage.js')
  });
  stageWin.setMenuBarVisibility(false);
  stageWin.setAspectRatio(540 / 960);
  stageWin.loadURL(`http://127.0.0.1:${stagePort}/stage.html`);
  stageWin.on('close', e => {
    if (quitting) return;
    e.preventDefault();          // đóng sân khấu = ẩn, mở lại bằng nút trong bảng điều khiển
    stageWin.hide();
    pushState();
  });
  stageWin.on('closed', () => { stageWin = null; });
}

function toggleStage() {
  if (!alive(stageWin)) return;
  if (stageWin.isVisible()) stageWin.hide();
  else { stageWin.show(); stageWin.focus(); }
  pushState();
}

function createControlWindow() {
  const b = alive(stageWin) ? stageWin.getBounds() : { x: 60, y: 60, width: 540 };
  controlWin = new BrowserWindow({
    x: b.x + b.width + 12, y: b.y, width: 1280, height: 920, minWidth: 820, minHeight: 620,
    backgroundColor: '#14110f',
    title: 'Kurumi Live - Bảng điều khiển',
    webPreferences: prefs('preload-control.js')
  });
  controlWin.setMenuBarVisibility(false);
  controlWin.loadFile(path.join(RENDERER, 'control.html'));
  controlWin.on('close', () => { quitting = true; });   // đóng bảng điều khiển = thoát app
  controlWin.on('closed', () => { controlWin = null; });
}

/* ---------- IPC từ bảng điều khiển ---------- */
ipcMain.handle('ctl:get', () => uiState());
ipcMain.handle('ctl:connect', (_e, user) => connectTikTok(user));
ipcMain.handle('stage:musicList', () => ({ tracks: musicTracks(), enabled: settings.musicEnabled, volume: settings.musicVolume }));
ipcMain.handle('ctl:musicNext', () => { sendStage('stage:music', { action: 'next' }); return { ok: true }; });
ipcMain.handle('ctl:disconnect', async () => { await disconnectTikTok(); setStatus('Đã ngắt kết nối'); return { ok: true }; });
ipcMain.handle('ctl:settings', (_e, patch) => {
  const prev = { ...settings };
  settings = sanitize(patch, settings);
  writeStore();
  if (settings.stageBg !== prev.stageBg || settings.showBoard !== prev.showBoard || settings.scene !== prev.scene || settings.freeMotion !== prev.freeMotion) sendStage('stage:config', stageConfig());
  if (settings.character !== prev.character && alive(stageWin)) {
    // câu đang chờ "đã đọc xong" sẽ không bao giờ tới nữa vì trang sẽ tải lại: thả ra ngay
    const f = pendingStageDone; pendingStageDone = null; if (f) f();
    formOverride = null; trial = null;   // đổi nhân vật thì về dạng gốc của nhân vật mới
    reloadStage();
  }
  if (settings.heartStep !== prev.heartStep) heartCounter = null;
  if (settings.musicEnabled !== prev.musicEnabled || settings.musicVolume !== prev.musicVolume) sendStage('stage:music', musicConfig());
  if (settings.musicDir !== prev.musicDir) sendStage('stage:music', { action: 'reload' });
  if (settings.voiceEnabled !== prev.voiceEnabled || settings.voiceName !== prev.voiceName || settings.pythonPath !== prev.pythonPath) {
    if (settings.voiceEnabled) { ttsStop(); ttsStart(); }
    else ttsStop();
  }
  pushState();
  return { ok: true, settings };
});
ipcMain.handle('ctl:formReset', async () => { trial = null; await setForm(null); return { ok: true }; });
ipcMain.handle('ctl:key', (_e, key) => {
  apiKeys = parseKeys(key);   // mỗi dòng một key; lưu là thay toàn bộ danh sách
  writeStore();
  warmGemini(effectiveKeys(), settings.model);
  pushState();
  return { ok: true };
});
ipcMain.handle('ctl:pause', () => { engine.togglePause(); return { ok: true }; });
ipcMain.handle('ctl:clearQueue', () => { engine.clear(); return { ok: true }; });
ipcMain.handle('ctl:pick', (_e, id) => {
  if (!effectiveKeys().length) return { ok: false, message: 'Chưa có API key Gemini nên chưa trả lời được. Hãy lưu key trước.' };
  if (!settings.aiEnabled) return { ok: false, message: 'AI đang tắt. Bật "Bật AI trả lời" rồi thử lại.' };
  return engine.pickNow(id === null || id === undefined ? null : Number(id));
});
ipcMain.handle('ctl:demo', (_e, on) => { if (on) startDemo(); else stopDemo(); return { ok: true }; });
ipcMain.handle('ctl:test', (_e, p) => {
  const name = String((p && p.name) || 'Khán giả thử').slice(0, 40);
  const item = { kind: 'chat', uid: 'test:' + name, name, text: p && p.text };
  voteOnForm(item);   // comment thử cũng là ý kiến khán giả về dạng mới
  const rules = getCharacter(settings.character).rules;
  const hit = instantFor(item, rules, instantState);
  if (hit && hit.kind === 'reply') { instantSay(item, hit); return { ok: true }; }
  const dfr = deferFor(item, rules);
  if (dfr) { instantSay(item, dfr); return { ok: true }; }
  engine.enqueue({ ...item, force: true });
  return { ok: true };
});
ipcMain.handle('ctl:voiceTest', async () => {
  const text = `Xin chào, mình là ${botName()}. Rất vui được gặp bạn!`;
  const audio = await speak(text, true);
  sendStage('stage:say', { id: null, kind: 'test', name: 'Thử giọng', text, action: 'warm', audio, subtitleSec: settings.subtitleSec });
  return { ok: !!audio, error: audio ? '' : (ttsState.msg || 'Không tạo được giọng đọc') };
});
ipcMain.handle('ctl:stage', () => { toggleStage(); return { ok: true }; });

// Chọn file video bằng hộp thoại (chỉ trả đường dẫn; file chỉ được phục vụ khi nằm trong bảng quà)
ipcMain.handle('ctl:pickVideo', async () => {
  const opts = {
    title: 'Chọn video cho quà',
    properties: ['openFile'],
    filters: [{ name: 'Video', extensions: ['mp4', 'm4v', 'webm'] }]
  };
  const r = alive(controlWin) ? await dialog.showOpenDialog(controlWin, opts) : await dialog.showOpenDialog(opts);
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});
ipcMain.handle('ctl:videoSkip', () => ({ ok: videoQueue.skip() }));
ipcMain.handle('ctl:videoClear', () => { videoQueue.clear(); return { ok: true }; });
ipcMain.handle('ctl:videoTest', (_e, id) => {
  const rule = (settings.giftVideos || []).find(r => r.id === id);
  if (!rule) return { ok: false, message: 'Dòng này chưa được lưu. Bấm "Lưu bảng" trước.' };
  videoQueue.enqueue({ rule: rule.id, gift: rule.gift, name: 'Thử video', diamonds: 0 });
  return { ok: true };
});

// Sân khấu báo phát xong / báo độ dài video
ipcMain.on('stage:videoDone', (_e, p) => {
  const id = p && p.id, ok = !(p && p.ok === false);
  videoQueue.done(id, ok);
});
ipcMain.on('stage:videoMeta', (_e, p) => {
  if (p) videoQueue.meta(p.id, p.duration);
});
ipcMain.handle('ctl:clearStage', () => { sendStage('stage:clear'); return { ok: true }; });

ipcMain.handle('stage:init', () => {
  const w = stageInitWaiter;
  stageInitWaiter = null;
  if (w) w();   // sân khấu vừa tải lại xong: báo cho bộ đổi dạng tiếp tục
  return stageConfig();
});


/* ---------- tự nói khi không ai nói hay comment (chỉ nhân vật có idleTalk) ---------- */
// Tự tương tác: khi vắng comment, lượt tự nói được xếp vào hàng chờ của engine,
// nên vẫn đọc lần lượt và không nói chồng lên câu trả lời khác.
function autonomyTick() {
  const s = settings;
  const ch = getCharacter(s.character);
  if (!ch || !s.aiEnabled || !s.selfTalkEnabled || !alive(stageWin)) return;
  autonomy.setConfig({ idleSec: s.selfIdleSec, minGapSec: s.selfMinGapSec, maxPerHour: s.selfMaxPerHour, recapEveryMin: s.recapEveryMin });
  const snap = engine.snapshot();
  const pick = autonomy.evaluate({
    queueLength: snap.queueLength, busy: snap.busy, videoHeld: snap.videoHeld, paused: snap.paused, aiEnabled: s.aiEnabled,
    quiet: isQuietAudience(s)
  });
  if (!pick) return;
  autonomy.markSpoken(pick.reason);
  engine.enqueue({ kind: 'self', name: ch.name, text: pick.seed });
}
const idleTimer = setInterval(autonomyTick, 5000);
const memorySaveTimer = setInterval(() => brain.save(), 60000);

// Tóm tắt trí nhớ bằng mô hình: mỗi 90 giây xử lý tối đa một khán giả có đủ 8 lượt mới.
// Chạy nền, không chen vào hàng chờ trả lời; lỗi thì bỏ qua và thử lại lần sau.
let summarizing = false;
async function summaryTick() {
  if (summarizing || !settings.factMemory || !settings.aiEnabled) return;
  const keys = effectiveKeys();
  const [next] = memory.needingSummary(8);
  if (!next || !keys.length) return;
  summarizing = true;
  try {
    const { system, userText } = buildSummaryPrompt(next.name, memory.episodesOf(next, 20));
    const raw = await askGemini({ apiKeys: keys, model: settings.model, extraModels: settings.extraModels, system, userText, signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS) });
    const parsed = parseSummary(raw);
    if (parsed) memory.setSummary(next, isSafe(parsed.summary) ? parsed.summary : memory.viewer(next).summary, parsed.facts);
    else memory.setSummary(next, memory.viewer(next).summary, []);   // JSON hỏng: giữ tóm tắt cũ, không thử lại liên tục
    saver.push(1);
  } catch (err) {
    memory.setSummary(next, memory.viewer(next).summary, []);
    console.warn('[summary] lỗi tóm tắt:', String(err && err.message).slice(0, 160));
  } finally {
    summarizing = false;
  }
}
const summaryTimer = setInterval(summaryTick, 90000);

/* ---------- khởi động ---------- */
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));   // từ chối mọi quyền
  brain.load();
  const st = readStore();
  settings = sanitize(st.settings || {}, DEFAULTS);
  if (settings.model === 'gemini-3.8-flash') settings.model = DEFAULTS.model;   // mặc định cũ -> mặc định nhanh mới
  if ((st.v || 0) < STORE_VERSION) {   // lần đầu chạy bản này: đưa về mặc định mới một lần, sau đó giữ lựa chọn của người dùng
    settings.triggerMode = DEFAULTS.triggerMode;
    settings.pickMode = DEFAULTS.pickMode;
    writeStore();
  }
  apiKeys = loadKeys(st);
  stagePort = await startStaticServer();
  createStageWindow();
  createControlWindow();
  warmGemini(effectiveKeys(), settings.model);   // mở sẵn kết nối, comment đầu tiên không bị chậm
  if (settings.voiceEnabled) ttsStart();
});

// Dọn dẹp xong mới thoát: giữ sự kiện thoát lại, chờ Python và kết nối đóng hẳn, rồi mới app.quit().
// Nếu không, Python vẫn chạy và bảng điều khiển còn hiện trạng thái giọng đọc cũ.
let cleanupPromise = null;
function cleanupAll() {
  quitting = true;
  clearInterval(idleTimer); clearInterval(memorySaveTimer); clearInterval(summaryTimer);
  stopDemo(); engine.stop(); videoQueue.stop();
  try { brain.save(); } catch (_) {}
  saver.close();
  return Promise.allSettled([disconnectTikTok(), killTts()]);
}
app.on('before-quit', e => {
  quitting = true;
  if (!cleanupPromise) cleanupPromise = cleanupAll();
  if (!cleanupPromise.__finished) {
    e.preventDefault();
    cleanupPromise.then(() => { cleanupPromise.__finished = true; app.quit(); });
  }
});
app.on('window-all-closed', () => app.quit());
