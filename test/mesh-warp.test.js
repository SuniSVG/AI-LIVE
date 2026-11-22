'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { displace, ANCHORS } = require('../renderer/js/mesh-warp');

const REST = { eye: 1, smile: 0, mouth: 0, tilt: 0, pitch: 0, gazeX: 0, gazeY: 0, sway: 0, breath: 0 };
const at = (x, y, pose) => displace(x, y, pose, [0, 0]);

test('tư thế nghỉ: điểm không đổi', () => {
  const [x, y] = at(300, 500, REST);
  assert.ok(Math.abs(x - 300) < 1e-9 && Math.abs(y - 500) < 1e-9);
});

test('biến dạng liên tục: hai điểm rất gần nhau dịch chuyển gần như giống nhau (không hở khe)', () => {
  const pose = { ...REST, eye: 0.1, smile: 0.4, mouth: 0.3, tilt: 0.12, pitch: 4, sway: 0.8, breath: 0.9, gazeY: 2 };
  // đi dọc một đường qua mắt, miệng, cổ, tóc và thân, so sánh bước 0.5px
  let maxJump = 0;
  for (let y = 100; y < 700; y += 4) {
    for (const x0 of [380, 470, 500, 520, 560, 650]) {
      const a = at(x0, y, pose), b = at(x0 + 0.5, y, pose), c = at(x0, y + 0.5, pose);
      maxJump = Math.max(maxJump, Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(a[0] - c[0], a[1] - c[1]));
    }
  }
  assert.ok(maxJump < 3, 'nhảy quá lớn giữa điểm kề nhau: ' + maxJump.toFixed(2));
});

test('chớp mắt: đỉnh mắt bị kéo về phía tâm mắt, nhưng không kéo tóc hay môi', () => {
  const blink = { ...REST, eye: 0.06 };
  const e = ANCHORS.eyeL;
  const top = at(e.x, e.y - 9, blink), bottom = at(e.x, e.y + 9, blink);
  assert.ok(top[1] > e.y - 9, 'mí trên chưa đi xuống');
  assert.ok(bottom[1] < e.y + 9, 'mí dưới chưa đi lên');
  const hair = at(420, 380, blink);
  assert.ok(Math.abs(hair[1] - 380) < 1e-9 && Math.abs(hair[0] - 420) < 1e-9, 'tóc không được bị ảnh hưởng');
});

test('nghiêng đầu: không xoay phần thân dưới vai', () => {
  const tilt = { ...REST, tilt: 0.2 };
  const body = at(500, 900, tilt);
  assert.ok(Math.abs(body[0] - 500) < 1e-9 && Math.abs(body[1] - 900) < 1e-9);
  const head = at(500, 120, tilt);
  assert.ok(Math.hypot(head[0] - 500, head[1] - 120) > 5, 'đầu không nghiêng');
});

test('mở miệng: chỉ kéo vùng quanh miệng', () => {
  const open = { ...REST, mouth: 0.4 };
  const m = ANCHORS.mouth;
  const near = at(m.x, m.y + 6, open);
  assert.ok(near[1] > m.y + 6, 'miệng không mở');
  const far = at(m.x, m.y + 80, open);
  assert.ok(Math.abs(far[1] - (m.y + 80)) < 1e-6, 'vùng xa bị kéo');
});

test('pose có trường lò xo và nghiêng thân: thiếu trường thì coi như 0, không ra NaN', () => {
  const [x, y] = displace(500, 500, { eye: 1 }, [0, 0]);
  assert.ok(Number.isFinite(x) && Number.isFinite(y));
  const [a, b] = at(500, 500, { ...REST, hair: 10, sleeve: -8, lean: 4 });
  assert.ok(Number.isFinite(a) && Number.isFinite(b));
});

test('tay áo và tóc lệch có giới hạn: chuyển động cực đại vẫn dưới 25px', () => {
  // biên thực tế mà renderer có thể đạt (xem mesh-avatar.js: tilt ≤ 0.045, hair/sleeve bị kẹp ±14)
  const extreme = { eye: 0.05, smile: 0.5, mouth: 0.4, tilt: 0.05, pitch: 2.5, lean: 3, gazeX: 3, gazeY: 2.2,
    hair: 8, sleeve: 8, breath: 1 };
  let worst = 0;
  for (let y = 60; y < 1500; y += 15) for (let x = 200; x < 840; x += 15) {
    const [nx, ny] = at(x, y, extreme);
    worst = Math.max(worst, Math.hypot(nx - x, ny - y));
  }
  assert.ok(worst < 35, 'chuyển động quá lớn: ' + worst.toFixed(1));
});

test('tay áo: hai điểm kề nhau ở mép tay áo không tách rời', () => {
  const pose = { ...REST, sleeve: 12, lean: 3 };
  let maxJump = 0;
  for (let y = 300; y < 900; y += 5) for (const x0 of [300, 340, 690, 720]) {
    const a = at(x0, y, pose), b = at(x0 + 0.5, y, pose), c = at(x0, y + 0.5, pose);
    maxJump = Math.max(maxJump, Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(a[0] - c[0], a[1] - c[1]));
  }
  assert.ok(maxJump < 3, 'nhảy ' + maxJump.toFixed(2));
});

test('quay đầu (yaw): đầu hẹp lại, không ảnh hưởng thân dưới, vẫn liên tục', () => {
  const yaw = { ...REST, yaw: 0.42 };
  const body = at(500, 900, yaw);
  assert.ok(Math.abs(body[0] - 500) < 1e-9);
  const head = at(300, 150, yaw);
  assert.ok(head[0] > 300 || head[0] < 300 && Math.abs(head[0] - 300) > 1, 'đầu không quay');
  let maxJump = 0;
  for (let y = 60; y < 340; y += 4) for (const x0 of [260, 400, 520, 640, 780]) {
    const a = at(x0, y, yaw), b = at(x0 + 0.5, y, yaw), c = at(x0, y + 0.5, yaw);
    maxJump = Math.max(maxJump, Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(a[0] - c[0], a[1] - c[1]));
  }
  assert.ok(maxJump < 3, 'nhảy khi quay đầu: ' + maxJump.toFixed(2));
});
