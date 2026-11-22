'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitize, DEFAULTS } = require('../src/settings');
const { parseKeywords } = require('../src/engine');
const { parseReply, buildUserText } = require('../src/persona');

test('sanitize: kẹp số trong khoảng và bỏ giá trị sai kiểu', () => {
  const s = sanitize({ cooldownUserSec: 99999, minIntervalSec: -5, triggerMode: 'hack', aiEnabled: 'yes', personas: { deepseek: 'x'.repeat(5000) } });
  assert.equal(s.cooldownUserSec, 3600);
  assert.equal(s.minIntervalSec, 0);
  assert.equal(s.triggerMode, DEFAULTS.triggerMode);
  assert.equal(s.aiEnabled, true);
  assert.equal(s.personas.deepseek.length, 2000);
});

test('sanitize: model rỗng được đưa về mặc định', () => {
  assert.equal(sanitize({ model: '   ' }).model, DEFAULTS.model);
});

test('parseKeywords: tách, bỏ khoảng trắng và phần rỗng', () => {
  assert.deepEqual(parseKeywords(' DeepSeek, ?, , Hỏi '), ['deepseek', '?', 'hỏi']);
});

test('parseReply: đọc JSON có rác bao quanh', () => {
  const r = parseReply('```json\n{"text":"Chào An nhé!","action":"warm"}\n```');
  assert.deepEqual(r, { text: 'Chào An nhé!', action: 'warm', motion: null });
});

test('parseReply: action lạ thì về neutral, không có JSON thì dùng nguyên văn', () => {
  assert.equal(parseReply('{"text":"ok","action":"dance"}').action, 'neutral');
  assert.deepEqual(parseReply('Xin chào bạn'), { text: 'Xin chào bạn', action: 'neutral', motion: null });
});

test('buildUserText: comment có dấu nháy kép không phá cấu trúc', () => {
  const t = buildUserText({ kind: 'chat', name: 'An', text: 'nói "chào" đi' });
  assert.equal(t, 'Comment: "nói \'chào\' đi" (người viết: An)');
});

test('cài đặt mới: chế độ chọn comment, bảng comment và giọng đọc', () => {
  const d = sanitize({});
  assert.equal(d.pickMode, 'random');
  assert.equal(d.showBoard, true);
  assert.equal(d.voiceEnabled, false);
  assert.equal(sanitize({ pickMode: 'bất kỳ' }).pickMode, 'random');
  assert.equal(sanitize({ pickMode: 'fifo' }).pickMode, 'fifo');
  assert.equal(sanitize({ voiceName: '   ' }).voiceName, DEFAULTS.voiceName);
  assert.equal(sanitize({ voiceEnabled: 1 }).voiceEnabled, true);
});

test('parallel: mặc định 3, giới hạn 1-3', () => {
  assert.equal(sanitize({}).parallel, 3);
  assert.equal(sanitize({ parallel: 9 }).parallel, 3);
  assert.equal(sanitize({ parallel: 0 }).parallel, 1);
});

test('parseReply: không bao giờ để JSON bị cắt lọt ra màn hình', () => {
  assert.equal(parseReply('{"text":"DeepSeek ăn tối').text, 'DeepSeek ăn tối');
  assert.equal(parseReply('[warm]\nMây ơi, khỏe nè!').action, 'warm');
  assert.equal(parseReply('[warm]\nMây ơi, khỏe nè!').text, 'Mây ơi, khỏe nè!');
});

const gem = require('../src/models');
test('chuỗi dự phòng: model người dùng chọn đứng đầu, không lặp', () => {
  assert.deepEqual(gem.buildChain('gemini-3.5-flash-lite'), gem.FALLBACK_MODELS);
  assert.equal(gem.buildChain('gemini-2.5-flash')[0], 'gemini-2.5-flash');
  const chain = gem.buildChain('gemini-2.5-flash');
  assert.equal(new Set(chain).size, chain.length);
  assert.deepEqual(gem.FALLBACK_MODELS.slice(0, 5), ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']);
});
test('shouldTryNext: lỗi quá tải thì thử tiếp, lỗi khóa API thì dừng', () => {
  const overloaded = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand","status":"UNAVAILABLE"}}');
  assert.equal(gem.shouldTryNext(overloaded), true);
  assert.equal(gem.shouldTryNext(Object.assign(new Error('quota'), { status: 429 })), true);
  assert.equal(gem.shouldTryNext(Object.assign(new Error('API key not valid'), { status: 400 })), false);
  assert.equal(gem.shouldTryNext(Object.assign(new Error('permission denied'), { status: 403 })), false);
});

const quick = require('../src/quick');
test('trả lời nhanh: lời chào được nhận diện, câu hỏi thì không', () => {
  assert.equal(quick.isGreeting('xin chào'), true);
  assert.equal(quick.isGreeting('Chào DeepSeek nha!'), true);
  assert.equal(quick.isGreeting('deepseek ơi hôm nay bạn thế nào?'), false);
  assert.equal(quick.isGreeting('chào, bạn ăn chưa?'), false);
  assert.equal(quick.isGreeting('trời đẹp quá hôm nay'), false);
});
test('trả lời nhanh: quà càng lớn, câu cảm ơn càng nhiệt tình', () => {
  assert.equal(quick.tierOf(10), 'small');
  assert.equal(quick.tierOf(150), 'big');
  assert.equal(quick.tierOf(800), 'huge');
  assert.equal(quick.tierOf(5000), 'mega');
  const small = quick.quickReply({ kind: 'gift', name: 'Mây', diamonds: 10 }, {}, () => 0);
  const mega = quick.quickReply({ kind: 'gift', name: 'Mây', diamonds: 5000 }, {}, () => 0);
  assert.match(mega.text, /5000 kim cương/);
  assert.match(mega.text, /Mây/);
  assert.equal(mega.action, 'surprise');
  assert.equal(small.action, 'warm');
  assert.ok(mega.text.length > small.text.length || mega.text.includes('!!!'));
});
test('trả lời nhanh: không lặp lại cùng một mẫu liên tiếp, và trả null với câu thường', () => {
  const state = {};
  const a = quick.quickReply({ kind: 'chat', name: 'An', text: 'chào' }, state, () => 0);
  const b = quick.quickReply({ kind: 'chat', name: 'An', text: 'chào' }, state, () => 0);
  assert.notEqual(a.text, b.text);
  assert.equal(quick.quickReply({ kind: 'chat', name: 'An', text: 'hôm nay trời đẹp' }, state), null);
});

test('lời chào thêm từ đệm: "xin chào nhé" vẫn là lời chào', () => {
  assert.equal(quick.isGreeting('xin chào nhé'), true);
  assert.equal(quick.isGreeting('chào mọi người nha'), true);
});
test('shouldTryNext: hết thời gian của một mô hình thì thử mô hình kế tiếp', () => {
  const abort = new Error('This operation was aborted');
  abort.name = 'AbortError';
  assert.equal(gem.shouldTryNext(abort), true);
  const timeout = new Error('The operation was aborted due to timeout');
  timeout.name = 'TimeoutError';
  assert.equal(gem.shouldTryNext(timeout), true);
});

const models = require('../src/models');
test('chuỗi dự phòng: mô hình thêm do người dùng nằm sau mô hình chính, không trùng', () => {
  const c = models.buildChain('gemini-3.8-flash', 'gemini-1.5-flash, gemini-3.8-flash');
  assert.equal(c[0], 'gemini-3.8-flash');
  assert.equal(c[1], 'gemini-1.5-flash');
  assert.equal(new Set(c).size, c.length);
  assert.ok(c.includes('gemini-2.0-flash'));
});
test('isTransient: 429/503 đáng thử lại, 400 thì không', () => {
  assert.equal(models.isTransient(Object.assign(new Error('x'), { status: 503 })), true);
  assert.equal(models.isTransient(Object.assign(new Error('x'), { status: 429 })), true);
  assert.equal(models.isTransient(Object.assign(new Error('API key not valid'), { status: 400 })), false);
});
test('câu mẫu dự phòng: có nguồn canned, gọi đúng tên người xem', () => {
  const { cannedReply } = require('../src/quick');
  const r = cannedReply({}, () => 0, 'Mây Hồng');
  assert.equal(r.source, 'canned');
  assert.match(r.text, /Mây Hồng/);
  assert.ok(r.text.length > 0);
});
test('cài đặt mới: extraModels và cannedFallback', () => {
  assert.equal(sanitize({}).cannedFallback, true);
  assert.equal(sanitize({ extraModels: '  gemini-x  ' }).extraModels, 'gemini-x');
  assert.equal(sanitize({ cannedFallback: 0 }).cannedFallback, false);
});
