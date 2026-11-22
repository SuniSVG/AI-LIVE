'use strict';

// Gom mục thành lô (port từ airi packages/stream-kit/batcher).
// Lô được gửi khi đủ maxItems, hoặc sau maxWaitMs kể từ mục đầu tiên, tuỳ điều kiện nào đến trước.
// Dùng cho: ghi trí nhớ xuống đĩa theo lô thay vì mỗi lượt một lần.

function createBatcher({ maxWaitMs, maxItems = Infinity, flush, schedule }) {
  if (!Number.isFinite(maxWaitMs) || maxWaitMs < 0) throw new Error('maxWaitMs phải là số không âm');
  if (maxItems < 1) throw new Error('maxItems phải ít nhất là 1');
  const sched = schedule || ((cb, ms) => { const t = setTimeout(cb, ms); return () => clearTimeout(t); });
  let items = [];
  let cancelTimer = null;
  let closed = false;

  function emit() {
    if (cancelTimer) { cancelTimer(); cancelTimer = null; }
    if (!items.length) return;
    const batch = items;
    items = [];
    flush(batch);
  }

  return {
    push(item) {
      if (closed) return;
      items.push(item);
      if (items.length >= maxItems) return emit();
      if (!cancelTimer) cancelTimer = sched(emit, maxWaitMs);
    },
    flush: emit,
    close() { emit(); closed = true; }
  };
}

module.exports = { createBatcher };
