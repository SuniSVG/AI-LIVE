'use strict';

const { createCooldown } = require('./cooldown');

// Tự tương tác: khi live vắng comment, nhân vật tự mở lời theo một "hạt giống" chủ đề.
// Module này chỉ quyết định KHI NÀO và NÓI GÌ về chủ đề. Engine nhận kết quả và đưa vào hàng chờ
// như một mục kind 'self', nên vẫn đi qua cùng luật đọc lần lượt và không nói chồng với comment.
//
// Luật an toàn:
//  - Chỉ tự nói khi không có comment chờ, không đang bận, không có video quà, không bị tạm dừng.
//  - Phải im lặng đủ lâu (idleSec) và cách lần tự nói trước đủ lâu (minGapSec).
//  - Giới hạn số lần tự nói trong một giờ (maxPerHour).

const SEEDS = Object.freeze([
  'kể một chuyện vặt vừa nghĩ ra hôm nay',
  'hỏi khán giả một câu hỏi vui về sở thích của họ',
  'chia sẻ một cảm nhận nhỏ về buổi live tới giờ',
  'than đói hoặc khoe món ăn đang nghĩ đến',
  'đố vui nhẹ nhàng cho khán giả đoán',
  'nhắc lại một điều một khán giả đã kể trong trí nhớ, nếu có',
  'nói về một ước mơ nhỏ của mình trong ngày'
]);

const RECAP_SEED = 'tóm tắt ngắn những điều vui đã xảy ra trong live tới giờ, rồi hỏi khán giả thích chủ đề gì tiếp theo';

const DEFAULTS = Object.freeze({
  idleSec: 45,
  minGapSec: 60,
  maxPerHour: 20,
  recapEveryMin: 15,
  topicCooldownMin: 30,
  // Khi ít người xem hoặc ít comment (quiet): nhân vật tự nói sớm và thường hơn
  quietIdleSec: 15,
  quietMinGapSec: 25,
  quietMaxPerHour: 40
});

function createAutonomy(opts = {}) {
  const now = opts.now || (() => Date.now());
  const rand = opts.rand || Math.random;
  const cfg = { ...DEFAULTS, ...(opts.config || {}) };
  const seeds = opts.seeds && opts.seeds.length ? opts.seeds : SEEDS;
  let topicCd = createCooldown({ ms: cfg.topicCooldownMin * 60 * 1000 });

  let lastActivity = now();
  let lastSelfAt = null;
  let lastRecapAt = now();
  let lastSeedIdx = -1;
  const selfTimes = [];

  function noteActivity() {
    lastActivity = now();
  }

  // Chọn chủ đề chưa dùng gần đây; nếu đều đã dùng thì chọn ngẫu nhiên
  function pickSeed(t) {
    const fresh = seeds.map((_, i) => i).filter(i => topicCd.canAcquire(seeds[i], t));
    const pool = fresh.length ? fresh : seeds.map((_, i) => i);
    let idx = pool[Math.floor(rand() * pool.length)];
    if (pool.length > 1 && idx === lastSeedIdx) idx = pool[(pool.indexOf(idx) + 1) % pool.length];
    lastSeedIdx = idx;
    topicCd.tryAcquire(seeds[idx], t);
    return seeds[idx];
  }

  function countLastHour(t) {
    while (selfTimes.length && t - selfTimes[0] > 60 * 60 * 1000) selfTimes.shift();
    return selfTimes.length;
  }

  // state: { queueLength, busy, videoHeld, paused, aiEnabled }
  // Trả về null (chưa tới lúc) hoặc { kind: 'self', seed, reason }
  function evaluate(state = {}) {
    if (!state.aiEnabled || state.paused || state.videoHeld || state.busy) return null;
    if ((state.queueLength || 0) > 0) return null;
    const t = now();
    const q = !!state.quiet;
    const idleSec = q ? cfg.quietIdleSec : cfg.idleSec;
    const gapSec = q ? cfg.quietMinGapSec : cfg.minGapSec;
    const perHour = q ? cfg.quietMaxPerHour : cfg.maxPerHour;
    if (t - lastActivity < idleSec * 1000) return null;
    if (lastSelfAt !== null && t - lastSelfAt < gapSec * 1000) return null;
    if (countLastHour(t) >= perHour) return null;

    if (cfg.recapEveryMin > 0 && t - lastRecapAt >= cfg.recapEveryMin * 60 * 1000) {
      return { kind: 'self', seed: RECAP_SEED, reason: 'recap' };
    }
    return { kind: 'self', seed: pickSeed(t), reason: 'idle' };
  }

  // Gọi khi một lượt tự nói đã được đưa vào hàng chờ (không phải khi đã đọc xong)
  function markSpoken(reason = 'idle') {
    const t = now();
    lastSelfAt = t;
    selfTimes.push(t);
    if (reason === 'recap') lastRecapAt = t;
    lastActivity = t;
  }

  // Đổi cấu hình khi người dùng chỉnh cài đặt (không cần tạo lại bộ lập lịch)
  function setConfig(patch = {}) {
    for (const k of Object.keys(DEFAULTS)) if (typeof patch[k] === 'number' && Number.isFinite(patch[k])) cfg[k] = patch[k];
    if (typeof patch.topicCooldownMin === 'number') topicCd = createCooldown({ ms: cfg.topicCooldownMin * 60 * 1000 });
  }

  return { noteActivity, evaluate, markSpoken, setConfig, config: () => ({ ...cfg }) };
}

module.exports = { createAutonomy, SEEDS, RECAP_SEED, DEFAULTS };
