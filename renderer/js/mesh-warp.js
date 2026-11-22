/* Biến dạng lưới cho nhân vật 2D (Nam Sĩ).
 *
 * Mọi chuyển động là MỘT trường biến dạng liên tục theo toạ độ (x, y) của ảnh gốc 1024x1536.
 * Hai điểm kề nhau (kể cả ở ranh giới giữa hai part) luôn dịch chuyển giống nhau, nên không hở khe.
 * Không phụ thuộc PIXI: kiểm thử được bằng node (test/mesh-warp.test.js).
 */
(function (root) {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const gauss = (x, y, c) => {
    const dx = (x - c.x) / c.sx, dy = (y - c.y) / c.sy;
    return Math.exp(-0.5 * (dx * dx + dy * dy));
  };
  const FACE_CENTER = Object.freeze({ x: 520, y: 170, sx: 95, sy: 105 });
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);

  // Toạ độ neo lấy từ bố cục ảnh gốc (xem character_mesh.json)
  const ANCHORS = Object.freeze({
    eyeL: Object.freeze({ x: 492, y: 156, sx: 20, sy: 9 }),   // vùng co mắt hẹp để không kéo tóc/lông mày xuống mí
    eyeR: Object.freeze({ x: 538, y: 156, sx: 20, sy: 9 }),
    mouth: Object.freeze({ x: 517, y: 201, sx: 26, sy: 12 }),
    neck: Object.freeze({ x: 520, y: 262 }),   // trục xoay đầu (dưới cằm)
    headFull: 200,    // phía trên mức này: đầu xoay trọn
    headNone: 330,    // phía dưới mức này: không xoay (thân, vai)
    spineX: 520       // đường giữa cơ thể
  });

  /* pose (tất cả là số, thiếu thì coi như 0):
   *   eye     : hệ số mở mắt (1 bình thường, nhỏ hơn = nheo/chớp)
   *   smile   : khoé miệng (-1..1)
   *   mouth   : mở miệng (0..~0.4)
   *   tilt    : nghiêng đầu (rad), alias của roll
   *   yaw     : quay đầu sang trái/phải (rad, dương = quay sang phải màn hình)
   *   pitch   : gật/ngẩng đầu (px)
   *   lean    : nghiêng thân trên sang hai bên (px)
   *   gazeX, gazeY : nhìn sang bên / lên xuống (px, áp lên mắt)
   *   hair    : độ lệch của tóc do lò xo (px, ±)
   *   sleeve  : độ lệch của tay áo do lò xo (px, ±)
   *   breath  : nhịp thở (-1..1)
   */
  function displace(x, y, pose, out) {
    const p = pose || {};
    let dx = 0, dy = 0;

    // 1) thở: phần ngực và vai nhô lên nhẹ, thân dưới ít hơn
    dy += num(p.breath) * 2.4 * smooth(420, 620, y) * (1 - smooth(1000, 1200, y));

    // 2) thân trên nghiêng theo con trỏ
    dx += num(p.lean) * smooth(260, 640, y);

    // 3) đầu: quay ngang (yaw), nghiêng quanh trục cổ (roll), gật/ngẩng
    const head = 1 - smooth(ANCHORS.headFull, ANCHORS.headNone, y);
    if (head > 0) {
      // yaw giả 3D: đầu hẹp lại theo cos(yaw) và các nét ở giữa mặt trượt nhẹ theo sin(yaw)
      const yaw = num(p.yaw);
      dx += (x - ANCHORS.neck.x) * (Math.cos(yaw) - 1) * head;
      // nét giữa mặt (mũi, mắt) trượt nhiều hơn viền đầu: tạo cảm giác chiều sâu
      dx += Math.sin(yaw) * (9 + 22 * gauss(x, y, FACE_CENTER)) * head;
      const ang = num(p.tilt) * head;
      const rx = x - ANCHORS.neck.x, ry = y - ANCHORS.neck.y;
      const c = Math.cos(ang) - 1, s = Math.sin(ang);
      dx += rx * c - ry * s;
      dy += rx * s + ry * c;
      dy += num(p.pitch) * head;
    }

    // 4) tóc: lò xo kéo đuôi tóc hai bên, càng xuống càng lệch nhiều
    const hairW = smooth(180, 380, y) * smooth(370, 420, x) * (1 - smooth(610, 680, x));
    const tipW = smooth(330, 600, y);
    dx += num(p.hair) * hairW * (0.5 + 0.8 * tipW);
    dy += num(p.hair) * hairW * 0.4 * tipW;

    // 5) tay áo rộng hai bên: đung đưa theo lò xo, mép ngoài lệch nhiều hơn
    const side = smooth(330, 400, Math.abs(x - ANCHORS.spineX));
    const sleeveW = side * smooth(300, 380, y) * (1 - smooth(900, 1000, y));
    dx += num(p.sleeve) * sleeveW * Math.sign(x - ANCHORS.spineX || 1) * 0.6;

    // 6) mắt: co giãn dọc quanh tâm mắt và nhìn theo hướng
    const eyeK = num(p.eye) - 1;
    for (const e of [ANCHORS.eyeL, ANCHORS.eyeR]) {
      const g = gauss(x, y, e);
      dy += ((y - e.y) * eyeK + num(p.gazeY)) * g;
      dx += num(p.gazeX) * g;
    }

    // 7) miệng: mở (kéo dọc) và cười (mở rộng khoé môi)
    const gm = gauss(x, y, ANCHORS.mouth);
    dy += (y - ANCHORS.mouth.y) * num(p.mouth) * gm;
    dx += (x - ANCHORS.mouth.x) * num(p.smile) * gm;

    out[0] = x + dx;
    out[1] = y + dy;
    return out;
  }

  const api = { displace, ANCHORS, smooth, gauss };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MeshWarp = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
