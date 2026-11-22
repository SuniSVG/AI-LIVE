'use strict';

// Trí nhớ dài hạn của nhân vật (lấy cảm hứng từ cách Neuro-sama nhớ người xem).
// - Nhật ký sự kiện: mỗi comment, quà và lúc tự nói đều được ghi lại (giới hạn MAX_EPISODES, cũ nhất bị bỏ).
// - Hồ sơ khán giả: tên, lần cuối xuất hiện, số lần chat, quà đã tặng, và các "sự thật" về họ
//   (ví dụ "thích mèo", "đang học y"). Hồ sơ không bị xoá khi nhật ký đầy.
// - Truy hồi: ghép theo khán giả + độ trùng từ khoá với câu hỏi hiện tại.
// Module thuần (không đọc/ghi file, không Electron): main process gọi dump() để lưu, load() để khôi phục.

const MAX_EPISODES = 300;
const MAX_FACTS = 20;
const MAX_VIEWERS = 500;

function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(w => w.length > 1)
  );
}

function overlapScore(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

function viewerKeyOf(who) {
  return String((who && (who.uid || who.name)) || '?');
}

function createMemory(opts = {}) {
  const now = opts.now || (() => Date.now());
  let episodes = [];
  const viewers = new Map();

  function touch(who) {
    const key = viewerKeyOf(who);
    let v = viewers.get(key);
    if (!v) {
      if (viewers.size >= MAX_VIEWERS) {
        // bỏ khán giả ít xuất hiện nhất, không bỏ người vừa đến
        let oldest = null;
        for (const x of viewers.values()) if (!oldest || x.lastSeen < oldest.lastSeen) oldest = x;
        if (oldest) viewers.delete(oldest.key);
      }
      v = { key, name: 'Khán giả', firstSeen: now(), lastSeen: now(), chats: 0, gifts: 0, giftDiamonds: 0, facts: [], summary: '', newSince: 0 };
      viewers.set(key, v);
    }
    v.lastSeen = now();
    if (who && who.name) v.name = String(who.name).slice(0, 40);
    return v;
  }

  // ep: { kind: 'chat' | 'gift' | 'self', who: { uid, name }, text, reply, diamonds }
  function addEpisode(ep) {
    const kind = ep.kind === 'gift' || ep.kind === 'self' ? ep.kind : 'chat';
    const who = ep.who || null;
    const v = who ? touch(who) : null;
    if (v && kind === 'chat') v.chats++;
    if (v && (kind === 'chat' || kind === 'gift')) v.newSince++;
    if (v && kind === 'gift') {
      v.gifts++;
      v.giftDiamonds += Number(ep.diamonds) || 0;
    }
    const e = {
      t: now(),
      kind,
      uid: v ? v.key : null,
      name: v ? v.name : 'Kurumi',
      text: String(ep.text || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      reply: String(ep.reply || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    };
    episodes.push(e);
    if (episodes.length > MAX_EPISODES) episodes = episodes.slice(-MAX_EPISODES);
    return e;
  }

  // Lưu một sự thật về khán giả. Trùng (không phân biệt hoa thường) thì bỏ qua.
  function rememberFact(who, fact) {
    const text = String(fact || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!text || !who) return false;
    const v = touch(who);
    const norm = text.toLowerCase();
    if (v.facts.some(f => f.text.toLowerCase() === norm)) return false;
    v.facts.push({ t: now(), text });
    if (v.facts.length > MAX_FACTS) v.facts.shift();
    return true;
  }

  // Tóm tắt do mô hình viết (summarize.js). Ghi đè bản cũ; sự thật là danh sách đã được lọc.
  function setSummary(who, summary, facts = []) {
    const v = who ? touch(who) : null;
    if (!v) return false;
    v.summary = String(summary || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    v.newSince = 0;
    for (const f of facts) rememberFact(who, f);
    return true;
  }

  // Khán giả có đủ lượt mới chưa được tóm tắt (nhiều nhất trước)
  function needingSummary(minNew = 8) {
    return [...viewers.values()]
      .filter(v => v.newSince >= minNew)
      .sort((a, b) => b.newSince - a.newSince)
      .map(v => ({ uid: v.key, name: v.name }));
  }

  // Các lượt gần đây của một người, dùng làm đầu vào cho tóm tắt
  function episodesOf(who, limit = 20) {
    const key = viewerKeyOf(who);
    return episodes.filter(e => e.uid === key).slice(-limit).map(e => ({ kind: e.kind, text: e.text, reply: e.reply }));
  }

  function viewer(who) {
    const v = who ? viewers.get(viewerKeyOf(who)) : null;
    return v ? { ...v, facts: v.facts.map(f => ({ ...f })) } : null;
  }

  // Trả về { viewer, facts, recent, related }:
  //  - viewer: hồ sơ người đang hỏi (có thể null nếu chưa gặp)
  //  - recent: 3 lượt gần nhất của chính người đó
  //  - related: các lượt khác có từ khoá trùng với câu hỏi (tối đa `limit`), kể cả của người khác
  function recall({ who = null, query = '', limit = 4 } = {}) {
    const key = who ? viewerKeyOf(who) : null;
    const qTokens = tokens(query);
    const mine = key ? episodes.filter(e => e.uid === key) : [];
    const recent = mine.slice(-3);
    const scored = episodes
      .map((e, i) => ({ e, i, s: overlapScore(qTokens, tokens(e.text + ' ' + e.reply)) }))
      .filter(x => x.s > 0 && (!key || x.e.uid !== key))
      .sort((a, b) => b.s - a.s || b.i - a.i)
      .slice(0, limit)
      .map(x => x.e);
    const v = key ? viewers.get(key) : null;
    return {
      viewer: v ? { name: v.name, chats: v.chats, gifts: v.gifts, summary: v.summary || '', facts: v.facts.map(f => f.text) } : null,
      recent,
      related: scored
    };
  }

  function stats() {
    return { episodes: episodes.length, viewers: viewers.size };
  }

  function dump() {
    return {
      v: 1,
      episodes: episodes.map(e => ({ ...e })),
      viewers: [...viewers.values()].map(v => ({ ...v, facts: v.facts.map(f => ({ ...f })) }))
    };
  }

  // Khôi phục từ dữ liệu đã lưu. Dữ liệu sai dạng thì bỏ qua phần đó, không ném lỗi.
  function load(data) {
    episodes = [];
    viewers.clear();
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.episodes)) {
      episodes = data.episodes
        .filter(e => e && typeof e.text === 'string')
        .slice(-MAX_EPISODES)
        .map(e => ({ t: Number(e.t) || 0, kind: ['chat', 'gift', 'self'].includes(e.kind) ? e.kind : 'chat', uid: e.uid || null, name: String(e.name || ''), text: e.text, reply: String(e.reply || '') }));
    }
    if (Array.isArray(data.viewers)) {
      for (const v of data.viewers.slice(-MAX_VIEWERS)) {
        if (!v || typeof v.key !== 'string') continue;
        viewers.set(v.key, {
          key: v.key,
          name: String(v.name || 'Khán giả').slice(0, 40),
          firstSeen: Number(v.firstSeen) || 0,
          lastSeen: Number(v.lastSeen) || 0,
          chats: Number(v.chats) || 0,
          gifts: Number(v.gifts) || 0,
          giftDiamonds: Number(v.giftDiamonds) || 0,
          summary: typeof v.summary === 'string' ? v.summary.slice(0, 400) : '',
          newSince: Number(v.newSince) || 0,
          facts: Array.isArray(v.facts) ? v.facts.filter(f => f && typeof f.text === 'string').slice(-MAX_FACTS) : []
        });
      }
    }
  }

  return { addEpisode, rememberFact, setSummary, needingSummary, episodesOf, viewer, recall, stats, dump, load };
}

module.exports = { createMemory, tokens, MAX_EPISODES, MAX_FACTS };
