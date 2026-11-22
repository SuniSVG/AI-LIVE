'use strict';

// Giới hạn "mỗi khoá một lần trong một khoảng" (port từ airi packages/stream-kit/cooldown).
// Dùng cho: không lặp cùng một chủ đề tự nói trong 30 phút, không nhắc lại cùng một người quá dày.

function createCooldown({ ms }) {
  const acquiredAt = new Map();
  return {
    // Trả về true và bắt đầu cửa sổ mới nếu đã qua khoảng chờ
    tryAcquire(key, now) {
      const last = acquiredAt.get(key);
      if (last !== undefined && now - last < ms) return false;
      acquiredAt.set(key, now);
      return true;
    },
    // Chỉ hỏi, không bắt đầu cửa sổ mới
    canAcquire(key, now) {
      const last = acquiredAt.get(key);
      return last === undefined || now - last >= ms;
    },
    size: () => acquiredAt.size
  };
}

module.exports = { createCooldown };
