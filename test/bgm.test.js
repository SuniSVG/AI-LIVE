'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { trackList, createPlaylist, parseMusicRequest, findTrack } = require('../renderer/js/bgm-logic');

test('trackList: chỉ nhận file âm thanh, sắp xếp, tạo tên hiển thị', () => {
  const t = trackList(['README.txt', 'b_chill-night.mp3', 'a.ogg', 'cover.png', 'c.M4A']);
  assert.deepEqual(t.map(x => x.id), ['a.ogg', 'b_chill-night.mp3', 'c.M4A']);
  assert.equal(t[1].title, 'b chill night');
});

test('playlist: peek đúng bài advance sẽ phát, không lặp liền khi sang vòng mới', () => {
  const tracks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  let seed = 7;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const p = createPlaylist(tracks, rand);
  let last = null;
  for (let i = 0; i < 30; i++) {
    const expected = p.peek();
    const got = p.advance();
    assert.equal(got.id, expected.id);
    assert.notEqual(got.id, last && last.id);
    last = got;
  }
});

test('playlist: jumpTo phát đúng bài được chọn; một bài thì lặp lại chính nó; không có bài thì null', () => {
  const p = createPlaylist([{ id: 'a.mp3' }, { id: 'b.mp3' }, { id: 'c.mp3' }]);
  assert.equal(p.jumpTo('c.mp3').id, 'c.mp3');
  assert.equal(p.current().id, 'c.mp3');
  assert.equal(p.jumpTo('zzz.mp3'), null);
  const one = createPlaylist([{ id: 'x' }]);
  assert.equal(one.advance().id, 'x');
  assert.equal(one.advance().id, 'x');
  assert.equal(createPlaylist([]).advance(), null);
});

test('parseMusicRequest: đổi bài, bật nhạc, bật bài có tên', () => {
  assert.deepEqual(parseMusicRequest('đổi nhạc đi bạn ơi'), { kind: 'next' });
  assert.deepEqual(parseMusicRequest('chuyển bài khác đi'), { kind: 'next' });
  assert.deepEqual(parseMusicRequest('bật nhạc khác'), { kind: 'next' });
  assert.deepEqual(parseMusicRequest('bật nhạc lên'), { kind: 'on' });
  assert.deepEqual(parseMusicRequest('bật bài Nắng sớm đi nha'), { kind: 'play', query: 'nắng sớm' });
  assert.deepEqual(parseMusicRequest('phát bài piano'), { kind: 'play', query: 'piano' });
});

test('parseMusicRequest: bảo tắt nhạc thì nhận là off (không tắt), câu thường không bị nhận nhầm', () => {
  assert.deepEqual(parseMusicRequest('tắt nhạc giùm'), { kind: 'off' });
  assert.deepEqual(parseMusicRequest('dừng nhạc đi'), { kind: 'off' });
  assert.equal(parseMusicRequest('mình thích bài hát này quá'), null);
  assert.equal(parseMusicRequest('chào Kurumi'), null);
  assert.equal(parseMusicRequest(''), null);
});

test('findTrack: khớp không dấu, khớp trọn trước khớp một phần, không khớp bài không có', () => {
  const tracks = trackList(['nang_som.mp3', 'Lofi Chill.mp3', 'Piano Rain.ogg']);
  assert.equal(findTrack(tracks, 'nắng sớm').id, 'nang_som.mp3');
  assert.equal(findTrack(tracks, 'lo-fi chill').id, 'Lofi Chill.mp3');
  assert.equal(findTrack(tracks, 'piano').id, 'Piano Rain.ogg');
  assert.equal(findTrack(tracks, 'jazz cổ điển'), null);
  assert.equal(findTrack(tracks, 'a'), null);
});
