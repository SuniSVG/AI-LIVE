'use strict';

const { CHARACTER_IDS, DEFAULT_CHARACTER, getCharacter } = require('./characters');
const { SCENE_IDS } = require('./scenes');
const { cleanRules } = require('./giftvideo');

// Cấu hình mặc định. Mọi giá trị đều đi qua sanitize() trước khi dùng.
const DEFAULTS = Object.freeze({
  character: DEFAULT_CHARACTER, // nhân vật đang hiển thị trên sân khấu
  model: 'gemini-3.5-flash-lite', // nhanh nhất; mô hình khác thì đổi ở ô Model Gemini
  locale: 'vi',              // ngôn ngữ câu trả lời: vi | en | ja
  aiEnabled: true,           // bật/tắt AI trả lời
  triggerMode: 'all',        // all: mọi comment (mặc định v1.15) | keyword: chỉ comment có từ khoá
  keywords: 'deepseek, ?', // ngăn cách bằng dấu phẩy, không phân biệt hoa thường (tên nhân vật nên có trong đây)
  pickMode: 'random',        // random: bốc ngẫu nhiên 1 comment trong hàng đợi | fifo: theo thứ tự
  parallel: 3,               // số câu gọi AI cùng lúc (1-3)
  quickReplies: true,        // lời chào và quà được đáp ngay bằng câu có sẵn, không gọi AI
  extraModels: '',          // mô hình dự phòng thêm, cách nhau bằng dấu phẩy (thử sau mô hình chính)
  cannedFallback: true,      // mọi mô hình lỗi thì dùng câu mẫu, viewer vẫn nhận được phản hồi
  replyToGifts: true,        // cảm ơn quà tặng
  giftMinDiamonds: 10,       // quà tối thiểu (kim cương) để được cảm ơn
  cooldownUserSec: 30,       // mỗi người chỉ được trả lời sau N giây
  minIntervalSec: 2,         // khoảng cách tối thiểu giữa 2 câu trả lời
  maxQueue: 20,              // hàng đợi tối đa, quá thì bỏ comment cũ nhất
  subtitleSec: 8,            // thời gian tối thiểu hiện phụ đề trên sân khấu
  showBoard: true,           // hiện bảng comment trên sân khấu
  stageBg: 'dark',           // dark | green (nền xanh để key ở OBS)
  scene: 'thien-cung',       // nền cảnh phía sau nhân vật (xem src/scenes.js)
  personas: Object.freeze({}), // tính cách riêng cho từng nhân vật: { 'deepseek': '...' }; rỗng = mặc định
  freeMotion: true,          // nhân vật tự chơi motion khi rảnh và khi trả lời (chỉ áp dụng khi có file motion)
  voiceEnabled: false,       // đọc câu trả lời bằng VieNeu
  voiceName: 'Hải Đăng',     // giọng VieNeu
  pythonPath: '',            // đường dẫn python có cài vieneu; rỗng = python hệ thống
  videoEnabled: true,        // phát video khi có quà đúng trong bảng quà → video
  videoVolume: 80,           // âm lượng video trên sân khấu (0-100)
  maxVideoQueue: 10,         // số video chờ tối đa, quá thì bỏ video cũ nhất đang chờ
  videoGapSec: 5,            // nghỉ giữa hai video (giây): trong lúc nghỉ nhân vật than mệt rồi nói tiếp tục
  videoBreakTalk: true,      // nhân vật nói sau mỗi video (than mệt / hỏi còn nữa không / tiếp tục nào)
  heartStep: 100,            // cứ mỗi bấy nhiêu tim (đếm ẩn, không hiển thị) thì nhân vật cảm ơn tim của các bạn
  selfTalkEnabled: true,     // tự nói khi vắng comment (v3)
  selfIdleSec: 45,           // im lặng bao lâu thì tự nói
  selfMinGapSec: 60,         // hai lượt tự nói cách nhau ít nhất
  selfMaxPerHour: 20,        // tối đa số lượt tự nói trong một giờ
  selfQuietBoost: true,      // khi ít người xem / ít comment thì tự nói sớm và thường hơn
  selfQuietViewers: 20,      // dưới bấy nhiêu người xem là "vắng"
  selfQuietCommentsPerMin: 3,// dưới bấy nhiêu comment mỗi phút là "vắng"
  recapEveryMin: 15,         // cứ bấy nhiêu phút tự tóm tắt live (0 = tắt)
  factMemory: true,          // ghi nhớ điều khán giả nói về chính họ
  musicEnabled: true,        // nhạc nền sân khấu
  musicVolume: 30,           // âm lượng nhạc nền, phần trăm (khi Kurumi nói tự hạ xuống còn ~35%)
  musicDir: '',              // thư mục nhạc khác; rỗng = thư mục nhạc đi kèm app
  giftVideos: Object.freeze([]), // bảng quà → video: [{ id, gift, path }], gift "*" = mọi quà khác
});

const SPEC = {
  character: { t: 'enum', v: CHARACTER_IDS },
  model: { t: 'str', max: 80 },
  locale: { t: 'enum', v: ['vi', 'en', 'ja'] },
  aiEnabled: { t: 'bool' },
  triggerMode: { t: 'enum', v: ['all', 'keyword'] },
  keywords: { t: 'str', max: 300 },
  pickMode: { t: 'enum', v: ['random', 'fifo'] },
  parallel: { t: 'num', min: 1, max: 3 },
  quickReplies: { t: 'bool' },
  extraModels: { t: 'str', max: 300 },
  cannedFallback: { t: 'bool' },
  replyToGifts: { t: 'bool' },
  giftMinDiamonds: { t: 'num', min: 1, max: 100000 },
  cooldownUserSec: { t: 'num', min: 0, max: 3600 },
  minIntervalSec: { t: 'num', min: 0, max: 300 },
  maxQueue: { t: 'num', min: 1, max: 200 },
  subtitleSec: { t: 'num', min: 2, max: 60 },
  selfTalkEnabled: { t: 'bool' },
  musicEnabled: { t: 'bool' },
  musicVolume: { t: 'num', min: 0, max: 100 },
  musicDir: { t: 'str', max: 300 },
  selfIdleSec: { t: 'num', min: 10, max: 600 },
  selfMinGapSec: { t: 'num', min: 10, max: 3600 },
  selfMaxPerHour: { t: 'num', min: 1, max: 200 },
  selfQuietBoost: { t: 'bool' },
  selfQuietViewers: { t: 'num', min: 0, max: 100000 },
  selfQuietCommentsPerMin: { t: 'num', min: 0, max: 1000 },
  recapEveryMin: { t: 'num', min: 0, max: 240 },
  factMemory: { t: 'bool' },
  showBoard: { t: 'bool' },
  stageBg: { t: 'enum', v: ['dark', 'green'] },
  scene: { t: 'enum', v: SCENE_IDS },
  personas: { t: 'map', max: 2000 },
  freeMotion: { t: 'bool' },
  voiceEnabled: { t: 'bool' },
  voiceName: { t: 'str', max: 60 },
  pythonPath: { t: 'str', max: 300 },
  videoEnabled: { t: 'bool' },
  videoVolume: { t: 'num', min: 0, max: 100 },
  maxVideoQueue: { t: 'num', min: 1, max: 100 },
  videoGapSec: { t: 'num', min: 0, max: 60 },
  videoBreakTalk: { t: 'bool' },
  heartStep: { t: 'num', min: 10, max: 100000 },
  giftVideos: { t: 'list' },
};

// Gộp `patch` vào `base`, chỉ nhận giá trị đúng kiểu và trong khoảng cho phép.
function sanitize(patch, base = DEFAULTS) {
  const out = { ...base };
  const src = patch && typeof patch === 'object' ? patch : {};
  for (const [key, spec] of Object.entries(SPEC)) {
    if (!(key in src)) continue;
    const v = src[key];
    if (spec.t === 'str') out[key] = String(v ?? '').slice(0, spec.max).trim();
    else if (spec.t === 'bool') out[key] = !!v;
    else if (spec.t === 'enum') { if (spec.v.includes(v)) out[key] = v; }
    else if (spec.t === 'num') {
      const n = Number(v);
      if (Number.isFinite(n)) out[key] = Math.min(spec.max, Math.max(spec.min, n));
    }
    else if (spec.t === 'list') {
      // bảng quà → video: làm sạch từng dòng (xem src/giftvideo.js)
      if (Array.isArray(v)) out[key] = cleanRules(v);
    }
    else if (spec.t === 'map') {
      // chỉ giữ tính cách của nhân vật có thật, mỗi cái tối đa `max` ký tự
      const next = { ...(out.personas || {}) };
      if (v && typeof v === 'object') {
        for (const id of CHARACTER_IDS) {
          if (typeof v[id] === 'string') next[id] = v[id].slice(0, spec.max).trim();
        }
      }
      out.personas = next;
    }
  }
  if (!getCharacter(out.character) || !CHARACTER_IDS.includes(out.character)) out.character = DEFAULT_CHARACTER;
  if (!out.model) out.model = DEFAULTS.model;
  if (!out.voiceName) out.voiceName = DEFAULTS.voiceName;
  return out;
}

module.exports = { DEFAULTS, SPEC, sanitize };
