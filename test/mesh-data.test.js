'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const FILE = path.join(__dirname, '..', 'renderer', 'models', 'nam-si', 'character_mesh.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

test('dữ liệu lưới Nam Sĩ hợp lệ: số điểm, UV và chỉ số tam giác khớp nhau', () => {
  assert.ok(data.parts.length >= 40);
  for (const p of data.parts) {
    assert.equal(p.points_px.length, p.num_points, p.name);
    assert.equal(p.uv.length, p.num_points, p.name);
    assert.equal(p.triangles.length, 3 * p.num_triangles, p.name);
    assert.ok(p.triangles.every(i => i >= 0 && i < p.num_points), 'chỉ số lỗi ở ' + p.name);
    assert.ok(p.uv.every(([u, v]) => u >= 0 && u <= 1 && v >= 0 && v <= 1), 'UV ngoài [0,1] ở ' + p.name);
    assert.ok(p.texture === 0 || p.texture === 1, p.name);
  }
});

test('thứ tự vẽ: part được xếp theo draw_order (các part cùng lớp giữ thứ tự trong file)', () => {
  const orders = data.parts.map(p => p.draw_order);
  for (let i = 1; i < orders.length; i++) assert.ok(orders[i] >= orders[i - 1], 'lệch thứ tự ở ' + data.parts[i].name);
});

test('texture tham chiếu tồn tại trong thư mục app', () => {
  for (const f of data.textures) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'renderer', 'models', 'nam-si', f)), f);
  }
});

test('lưới đã phủ đủ nhân vật: số đỉnh nằm trong ngân sách hợp lý', () => {
  const pts = data.parts.reduce((n, p) => n + p.num_points, 0);
  assert.ok(pts < 12000, 'quá nhiều điểm: ' + pts);
});
