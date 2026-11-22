'use strict';

// Bỏ phiếu cho dạng mới vừa đổi. Mỗi người xem chỉ tính một phiếu (phiếu mới nhất của họ).
// Phản đối nhiều hơn tán thành và đủ ngưỡng trong thời gian thử thì nhân vật đổi về dạng cũ.
// Hết thời gian thử mà không đủ phản đối thì giữ dạng mới.

// \b của JavaScript không nhận chữ tiếng Việt có dấu (ở, ệ, ấ...), nên dùng ranh giới theo chữ cái Unicode
const wordRe = words => new RegExp(`(?<!\\p{L})(?:${words})(?!\\p{L})`, 'iu');
const NEG_RE = wordRe('không|khong|ko|hông|dở|xấu|chán|tệ|đổi lại|trả lại|về như cũ|bỏ đi|no');
const POS_RE = wordRe('đẹp|xinh|thích|ok|oke|đỉnh|dễ thương|ưng|tuyệt|yes|giữ|hợp|thương|iu|được');

// Phân loại một comment: 'neg' (phản đối), 'pos' (tán thành) hoặc null (không thuộc cả hai)
function classify(text) {
  const t = String(text || '');
  if (NEG_RE.test(t)) return 'neg';   // phản đối được ưu tiên: "không được", "không đẹp"
  if (POS_RE.test(t)) return 'pos';
  return null;
}

function createFormTrial({ form, now, windowMs = 120000, threshold = 5 }) {
  const since = now;
  const votes = new Map();   // uid -> 'neg' | 'pos'
  let closed = false;

  function tally() {
    let neg = 0, pos = 0;
    for (const v of votes.values()) (v === 'neg' ? neg++ : pos++);
    return { neg, pos };
  }

  // Trả về { revert, done, neg, pos }. revert: đổi về dạng cũ. done: hết thời gian thử (giữ dạng mới).
  function vote(uid, text, at) {
    if (closed) return { revert: false, done: true, ...tally() };
    if (at - since > windowMs) {
      closed = true;
      return { revert: false, done: true, ...tally() };
    }
    const kind = classify(text);
    if (kind && uid) votes.set(String(uid), kind);
    const { neg, pos } = tally();
    const revert = neg >= threshold && neg > pos;
    if (revert) closed = true;
    return { revert, done: false, neg, pos };
  }

  function snapshot(at) {
    return { form, ...tally(), leftSec: Math.max(0, Math.ceil((windowMs - (at - since)) / 1000)) };
  }

  return { form, vote, snapshot };
}

module.exports = { classify, createFormTrial };
