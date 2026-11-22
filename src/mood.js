'use strict';

// Tâm trạng của nhân vật: hai trục, năng lượng (0..1) và cảm xúc (-1..1).
// Quà, lời khen, comment làm tăng; im lặng lâu thì trạng thái trôi dần về mức bình thường.
// Kết quả chỉ là một đoạn mô tả ngắn đưa vào prompt, để câu nói phản ánh "hôm nay đang thế nào".

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function createMood(opts = {}) {
  const now = opts.now || (() => Date.now());
  const halfLifeMs = opts.halfLifeMs || 10 * 60 * 1000;
  let energy = typeof opts.energy === 'number' ? opts.energy : 0.6;
  let valence = typeof opts.valence === 'number' ? opts.valence : 0.3;
  let last = now();

  // Trôi về mức trung tính: sau mỗi nửa chu kỳ, phần lệch còn lại giảm một nửa
  function decay() {
    const t = now();
    const k = Math.pow(0.5, Math.max(0, t - last) / halfLifeMs);
    last = t;
    energy = 0.5 + (energy - 0.5) * k;
    valence = valence * k;
  }

  function bump(dE, dV) {
    decay();
    energy = clamp(energy + dE, 0, 1);
    valence = clamp(valence + dV, -1, 1);
  }

  function describe() {
    decay();
    const mood = valence > 0.5 ? 'rất vui' : valence > 0.15 ? 'vui vẻ' : valence < -0.4 ? 'buồn' : valence < -0.15 ? 'hơi buồn' : 'bình thường';
    const energyText = energy > 0.8 ? 'rất hào hứng' : energy > 0.55 ? 'tràn đầy năng lượng' : energy < 0.3 ? 'hơi mệt' : 'thoải mái';
    return `Tâm trạng hiện tại: ${mood}, ${energyText}.`;
  }

  return {
    onChat: () => bump(0.02, 0.02),
    onGift: diamonds => {
      const d = Number(diamonds) || 0;
      bump(0.08 + Math.min(0.2, d / 2000), 0.2 + Math.min(0.3, d / 1000));
    },
    onSelfTalk: () => bump(0.01, 0),
    onNegative: () => bump(-0.02, -0.15),
    snapshot: () => { decay(); return { energy, valence }; },
    describe
  };
}

module.exports = { createMood };
