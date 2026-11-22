'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { giftIcon, ICON_BY_NAME, FALLBACK_ICON } = require('../src/gifticons');

const root = path.join(__dirname, '..', 'renderer');

test('mọi icon quà đều có file ảnh thật trong assets/gifts', () => {
  for (const icon of new Set([...ICON_BY_NAME.values(), FALLBACK_ICON])) {
    assert.ok(fs.existsSync(path.join(root, 'assets', 'gifts', icon + '.png')), icon);
  }
});

test('bảng icon ở main khớp với bảng quà của bảng điều khiển', () => {
  const ctl = fs.readFileSync(path.join(root, 'js', 'control.js'), 'utf8');
  const pairs = [...ctl.matchAll(/name: '([^']+)', coins: [^,]+, icon: '([^']+)'/g)].map(m => [m[1], m[2]]);
  assert.ok(pairs.length >= 28);
  for (const [name, icon] of pairs) assert.equal(giftIcon(name), icon, name);
});

test('tra icon không phân biệt hoa thường, quà lạ dùng icon dự phòng', () => {
  assert.equal(giftIcon('ROSE'), 'rose');
  assert.equal(giftIcon('  Hat   and Mustache '), 'hat_and_mustache');
  assert.equal(giftIcon('Quà bí ẩn'), FALLBACK_ICON);
});
