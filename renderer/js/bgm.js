'use strict';
// Trình phát nhạc nền của sân khấu.
//  - Âm lượng nền mặc định 30%. Khi Kurumi nói, nhạc tự hạ xuống còn ~35% mức nền (ducking) rồi trở lại.
//  - Hai thẻ audio luân phiên: một thẻ đang phát, thẻ kia tải trước bài kế tiếp (preload),
//    nên chuyển bài gần như tức thì và không khựng khi hết bài.
//  - Hết bài thì sang bài kế, hết vòng thì xáo trộn lại. Lỗi một bài thì bỏ qua, lỗi liên tiếp thì dừng.
//  - Nhận lệnh từ main: đổi bài (next), đổi cấu hình (bật/tắt, âm lượng).
(() => {
  const L = window.BgmLogic;
  const api = window.kurumi && window.kurumi.stage;
  if (!L || !api || !api.music) return;

  const FADE_MS = 500;
  const DUCK_RATIO = 0.35;
  const MAX_FAILS = 3;

  let baseVol = 0.3;         // mức nền, 0..1
  let enabled = true;
  let ducked = false;
  let fails = 0;
  let playlist = null;
  let started = false;       // đã có lệnh phát chưa (tránh tự phát trước khi có bài)
  let playing = 0;           // chỉ số thẻ đang phát: 0 hoặc 1
  const slots = [makeSlot(), makeSlot()];

  function makeSlot() {
    const a = new Audio();
    a.preload = 'auto';
    a.volume = 0;
    a.dataset.id = '';
    return a;
  }

  function trackUrl(t) { return '/music/' + encodeURIComponent(t.id); }
  function target() { return enabled ? (ducked ? baseVol * DUCK_RATIO : baseVol) : 0; }

  // Thay đổi âm lượng từ từ, không giật
  function fadeTo(el, to, ms = FADE_MS) {
    clearInterval(el._fade);
    const from = el.volume;
    const steps = Math.max(1, Math.round(ms / 40));
    let i = 0;
    el._fade = setInterval(() => {
      i++;
      el.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) { clearInterval(el._fade); el._fade = null; if (to === 0) el.pause(); }
    }, 40);
  }

  // Tải bài vào thẻ không phát (chỉ tải lại nếu bài khác)
  function loadInto(slot, t) {
    if (!t || slot.dataset.id === t.id) return;
    slot.dataset.id = t.id;
    slot.src = trackUrl(t);
    slot.load();
  }

  // Tải trước bài kế tiếp vào thẻ đang rảnh
  function preloadNext() {
    if (!playlist) return;
    loadInto(slots[1 - playing], playlist.peek());
  }

  function detach(slot) {
    slot.onended = null;
    slot.onerror = null;
    slot.onplaying = null;
  }

  function playCurrent() {
    if (!playlist || !enabled) return;
    const track = playlist.current();
    if (!track) return;
    const slot = slots[playing];
    loadInto(slot, track);
    slot.onended = onEnded;
    slot.onerror = onError;
    slot.onplaying = () => { fails = 0; };
    slot.volume = 0;
    const p = slot.play();
    if (p && p.then) {
      p.then(() => fadeTo(slot, target())).catch(err => {
        // Trình duyệt chặn tự phát: chờ người xem bấm bất kỳ đâu rồi phát lại
        if (err && err.name === 'NotAllowedError') {
          const again = () => { document.removeEventListener('pointerdown', again); playCurrent(); };
          document.addEventListener('pointerdown', again, { once: true });
        } else onError();
      });
    }
    preloadNext();
  }

  // Sang bài kế: đổi thẻ, phát thẻ đã tải sẵn
  function goNext(fadeOutMs = FADE_MS) {
    if (!playlist) return;
    const old = slots[playing];
    detach(old);
    fadeTo(old, 0, fadeOutMs);
    playlist.advance();
    playing = 1 - playing;
    playCurrent();
  }

  function onEnded() { goNext(0); }

  function onError() {
    fails++;
    if (fails >= MAX_FAILS) { console.warn('[bgm] nhiều bài lỗi liên tiếp, dừng nhạc nền'); stopAll(); return; }
    goNext(0);
  }

  function stopAll() {
    for (const s of slots) { detach(s); fadeTo(s, 0, 300); }
  }

  function start() {
    if (!playlist || playlist.size() === 0) return;
    if (!started) {
      started = true;
      playlist.advance();
    }
    playCurrent();
  }

  function setConfig({ enabled: en, volume }) {
    if (typeof volume === 'number' && Number.isFinite(volume)) baseVol = Math.max(0, Math.min(100, volume)) / 100;
    if (typeof en === 'boolean') enabled = en;
    if (!enabled) { stopAll(); return; }
    if (!started) return start();
    const cur = slots[playing];
    if (cur.paused) playCurrent();
    else fadeTo(cur, target(), 300);
  }

  function duck(on) {
    ducked = !!on;
    const cur = slots[playing];
    if (started && !cur.paused) fadeTo(cur, target(), FADE_MS);
  }

  function next() {
    if (!enabled) return;
    if (!started) return start();
    goNext();
  }

  // Phát đúng một bài theo id (tên file), rồi tiếp tục vòng ngẫu nhiên
  function playById(id) {
    if (!playlist || !enabled) return;
    const t = playlist.jumpTo(id);
    if (!t) return;
    started = true;
    const old = slots[playing];
    detach(old);
    fadeTo(old, 0, FADE_MS);
    playing = 1 - playing;
    playCurrent();
  }

  // Lấy danh sách bài và cấu hình từ main (lúc khởi động, hoặc khi đổi thư mục nhạc)
  function loadList() {
    return api.music.list().then(info => {
      baseVol = Math.max(0, Math.min(100, Number(info.volume) || 30)) / 100;
      enabled = info.enabled !== false;
      stopAll();
      started = false;
      playlist = L.createPlaylist(info.tracks || []);
      if (enabled && playlist.size()) start();
    }).catch(err => console.warn('[bgm] không lấy được danh sách nhạc:', err && err.message));
  }

  loadList();

  api.music.onCmd(p => {
    if (!p) return;
    if (p.action === 'config') setConfig(p);
    else if (p.action === 'next') next();
    else if (p.action === 'play') playById(p.id);
    else if (p.action === 'play') playById(p.id);
    else if (p.action === 'reload') loadList();
  });

  window.kurumiBgm = { duck, next, setConfig };
})();
