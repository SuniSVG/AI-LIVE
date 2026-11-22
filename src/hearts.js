'use strict';

// Đếm tim ẩn (không hiển thị trên màn hình). Mỗi lần vượt một mốc bội số của `step` thì báo cảm ơn,
// nhưng không báo dày hơn `minGapMs`. Không phụ thuộc Electron nên có thể kiểm thử bằng node --test.

function createHeartCounter({ step = 100, minGapMs = 60000 } = {}) {
  let total = 0;
  let nextMark = step;
  let lastThanksAt = -Infinity;

  // Cộng thêm n tim. Trả về { thank: true } khi nên nói lời cảm ơn lúc này.
  function add(n, at) {
    const k = Math.max(0, Math.floor(Number(n) || 0));
    if (!k) return { thank: false, total };
    total += k;
    if (total < nextMark) return { thank: false, total };
    nextMark = (Math.floor(total / step) + 1) * step;
    if (at - lastThanksAt < minGapMs) return { thank: false, total };
    lastThanksAt = at;
    return { thank: true, total };
  }

  return { add, get total() { return total; }, reset() { total = 0; nextMark = step; lastThanksAt = -Infinity; } };
}

module.exports = { createHeartCounter };
