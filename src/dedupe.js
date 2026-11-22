'use strict';

// Chống đếm trùng sự kiện: TikTok có thể gửi lại cùng một msgId khi mạng chập chờn (học từ arena-live).
// Giữ tối đa `max` id gần nhất để bộ nhớ không tăng mãi.
function createDeduper(max = 5000) {
  const seen = new Map();
  return {
    // true nếu id này đã gặp trước đó; ghi nhận id mới nếu chưa gặp
    seenBefore(id) {
      if (!id) return false;
      if (seen.has(id)) return true;
      seen.set(id, Date.now());
      if (seen.size > max) seen.delete(seen.keys().next().value);
      return false;
    },
    get size() { return seen.size; }
  };
}

// Lấy msgId từ các vị trí mà thư viện TikTok hay dùng
function msgIdOf(d = {}) {
  return String((d.common && d.common.msgId) || (d.event && d.event.msgId) || d.msgId || '');
}

module.exports = { createDeduper, msgIdOf };
