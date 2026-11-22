'use strict';
// Logic thuần cho nhạc nền: danh sách bài, phát ngẫu nhiên không lặp liền, tìm bài theo tên,
// và nhận diện lệnh nhạc trong comment. Chạy được cả trong sân khấu (trình duyệt) lẫn main process (Node).

(function (root) {
  const AUDIO_EXT = /\.(mp3|ogg|oga|wav|m4a|aac|flac)$/i;

  // Tên file -> danh sách bài { id, title }. id chính là tên file.
  function trackList(names) {
    return (names || [])
      .filter(n => AUDIO_EXT.test(String(n)))
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .map(n => ({ id: n, title: n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || n }));
  }

  // Phát ngẫu nhiên: mỗi vòng xáo trộn một lần, không để bài vừa phát lên đầu vòng mới.
  // peek() luôn trả đúng bài advance() sẽ phát tiếp, nên có thể tải trước (preload) chính xác.
  function createPlaylist(tracks, rand = Math.random) {
    let order = [];
    let curIdx = -1;

    function shuffled(avoidFirst) {
      const idx = tracks.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      if (idx.length > 1 && idx[0] === avoidFirst) [idx[0], idx[1]] = [idx[1], idx[0]];
      return idx;
    }

    function ensure() {
      if (!tracks.length) return;
      if (order.length === 0) order = shuffled(curIdx);
    }

    return {
      size: () => tracks.length,
      current: () => (curIdx >= 0 ? tracks[curIdx] : null),
      peek() {
        ensure();
        return order.length ? tracks[order[0]] : null;
      },
      advance() {
        ensure();
        if (!order.length) return null;
        curIdx = order.shift();
        return tracks[curIdx];
      },
      // Phát ngay một bài theo id (người xem yêu cầu). Sau bài đó vòng ngẫu nhiên được xáo lại.
      jumpTo(id) {
        const i = tracks.findIndex(t => t.id === id);
        if (i < 0) return null;
        curIdx = i;
        order = [];
        return tracks[i];
      }
    };
  }

  // Bỏ dấu, đổi đ thành d, bỏ ký tự lạ: so tên bài không phân biệt dấu và hoa thường
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const FIND_STOP = new Set(['bai', 'nhac', 'ban', 'cho', 'minh', 'nghe', 'di', 'nha', 'nhe', 'gium', 'len',
    'bat', 'mo', 'phat', 'choi', 'the', 'a', 'mot']);

  // Tìm bài theo tên: mọi từ khoá đều phải có trong tên bài. Nhiều bài khớp thì lấy tên ngắn nhất.
  function findTrack(tracks, query) {
    const words = norm(query).split(' ').filter(w => w && !FIND_STOP.has(w));
    if (!words.length) return null;
    let best = null;
    let bestLen = Infinity;
    for (const tr of tracks || []) {
      const title = norm(tr.title);
      const tokens = title.split(' ');
      const ok = words.every(w => tokens.includes(w) || title.includes(w));
      if (ok && title.length < bestLen) { best = tr; bestLen = title.length; }
    }
    return best;
  }

  // Lệnh nhạc trong comment. Trả về một trong:
  //  { kind: 'off' }          - bảo tắt nhạc (không tắt; nhân vật nói mình thích nghe nhạc)
  //  { kind: 'next' }         - đổi sang bài khác
  //  { kind: 'on' }           - bảo bật nhạc chung chung
  //  { kind: 'play', query }  - bật một bài theo tên
  //  null                     - không phải lệnh nhạc
  // \b của JS không nhận chữ có dấu, nên dùng lookaround theo Unicode.
  const W0 = '(?<![\\p{L}\\p{N}])';
  const W1 = '(?![\\p{L}\\p{N}])';
  const RE_OFF = new RegExp(W0 + '(tắt|dừng|ngưng|tạt)\\s+(nhạc|bài|bản)' + W1, 'u');
  const RE_PLAY = new RegExp(W0 + '(bật|mở|phát|chơi|đổi|chuyển|qua)\\s+(?:bài|nhạc|bản)\\s+(.+)$', 'u');
  const RE_NEXT = new RegExp(W0 + '((đổi|chuyển|qua|next|skip|mở|phát)\\s+(bài|nhạc|bản)|(nhạc|bài|bản)\\s+(khác|mới|tiếp|tiếp theo|nữa))' + W1, 'u');
  const RE_NEXT_WORD = /^(next|skip)(?![\p{L}\p{N}])/u;
  const RE_ON = new RegExp(W0 + 'bật\\s+(nhạc|bài|bản)' + W1, 'u');
  const NEXT_WORDS = /(khác|mới|tiếp|nữa)/;
  const QUERY_FILLER = new Set(['đi', 'nha', 'nhé', 'nhe', 'giùm', 'ơi', 'với', 'cho', 'mình', 'bạn', 'lên',
    'này', 'đó', 'nghe', 'thôi', 'the', 'a']);

  function parseMusicRequest(text) {
    const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t) return null;
    if (RE_OFF.test(t)) return { kind: 'off' };
    const play = t.match(RE_PLAY);
    if (play) {
      const verb = play[1];
      const rest = play[2];
      if (NEXT_WORDS.test(rest)) return { kind: 'next' };
      const words = rest.split(' ').filter(w => w && !QUERY_FILLER.has(w));
      if (!words.length) return { kind: /^(đổi|chuyển|qua)$/.test(verb) ? 'next' : 'on' };
      return { kind: 'play', query: words.join(' ') };
    }
    if (RE_NEXT.test(t) || RE_NEXT_WORD.test(t)) return { kind: 'next' };
    if (RE_ON.test(t)) return { kind: 'on' };
    return null;
  }

  const api = { trackList, createPlaylist, norm, findTrack, parseMusicRequest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BgmLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
