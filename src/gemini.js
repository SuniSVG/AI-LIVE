'use strict';

const { GoogleGenAI } = require('@google/genai');
const { buildChain, shouldTryNext, isTransient } = require('./models');
const { hedgedRun } = require('./hedge');
const { createKeyPool, raceKeys, KEYS_PER_REQUEST } = require('./keypool');

const PER_MODEL_MS = 8000;   // câu trả lời ngắn: mô hình nào quá 8 giây là coi như chậm, bỏ
const HEDGE_MS = 1800;       // chưa có kết quả sau 1,8 giây thì bắn thêm mô hình kế tiếp song song
const MAX_PARALLEL = 3;      // tối đa 3 request cùng lúc cho một comment
const RETRY_DELAY_MS = 300;  // lỗi tạm thời: thử lại cùng mô hình gần như ngay

// Dùng lại một client cho mỗi API key: giữ kết nối HTTPS sẵn, khỏi bắt tay TLS lại ở mỗi comment.
const clients = new Map();
function clientFor(apiKey) {
  let ai = clients.get(apiKey);
  if (!ai) {
    if (clients.size >= 30) clients.clear();
    ai = new GoogleGenAI({ apiKey });
    clients.set(apiKey, ai);
  }
  return ai;
}

// Xoay vòng key: mỗi comment dùng 2 key liên tiếp trong danh sách, key lỗi 429/sai được cho nghỉ
const pool = createKeyPool();

// Mô hình đã báo không hỗ trợ cấu hình thinking: lần sau gọi thẳng không có, khỏi tốn thêm một vòng
const noThinking = new Set();

// Câu trả lời ngắn nên tắt "bước suy nghĩ" (thinking): nó tốn thời gian và chiếm token.
function thinkingFor(model) {
  if (noThinking.has(model) || /(^|-)2\.0/.test(model)) return null;
  if (/2\.5/.test(model)) return { thinkingBudget: 0 };
  return { thinkingLevel: 'MINIMAL' };
}

async function callOne(ai, { model, system, userText, signal, thinking }) {
  const config = {
    systemInstruction: system,
    temperature: 0.95,
    maxOutputTokens: 512,      // chỉ là mức trần (câu trả lời vẫn 1-2 câu): đủ rộng để token suy nghĩ của mô hình không cắt mất câu trả lời
    candidateCount: 1,
    abortSignal: signal
  };
  if (thinking) config.thinkingConfig = thinking;
  const res = await ai.models.generateContent({ model, contents: userText, config });
  return res.text || '';
}

async function callModel(ai, opts) {
  try {
    return await callOne(ai, { ...opts, thinking: thinkingFor(opts.model) });
  } catch (err) {
    // mô hình không hỗ trợ cấu hình thinking: nhớ lại và thử không có cấu hình đó
    if (/thinking/i.test(String((err && err.message) || err)) && !opts.signal.aborted) {
      noThinking.add(opts.model);
      return await callOne(ai, { ...opts, thinking: null });
    }
    throw err;
  }
}

// Trả về chuỗi văn bản của câu trả lời. Ném lỗi nếu mọi mô hình trong chuỗi đều không dùng được.
// apiKeys: mảng key (hoặc một chuỗi). Mỗi lần gọi dùng 2 key cùng lúc, key nào xong trước thì thắng.
async function askGemini({ apiKeys, apiKey, model, extraModels = '', system, userText, signal }) {
  const keys = (Array.isArray(apiKeys) ? apiKeys : [apiKeys || apiKey]).filter(Boolean);
  if (!keys.length) throw new Error('Chưa có API key Gemini');
  const chosen = pool.pick(keys, KEYS_PER_REQUEST);
  return hedgedRun({
    chain: buildChain(model, extraModels),
    call: (m, sig) => raceKeys({
      keys: chosen,
      call: (k, s) => callModel(clientFor(k), { model: m, system, userText, signal: s }),
      signal: sig,
      onFail: (k, err) => {
        const ms = pool.penalize(k, err);
        if (ms) console.warn(`[gemini] key ...${String(k).slice(-4)} nghỉ ${Math.round(ms / 1000)} giây: ${String(err && err.message).slice(0, 80)}`);
      },
      shouldTryNext
    }),
    signal,
    isTransient,
    shouldTryNext,
    hedgeMs: HEDGE_MS,
    maxParallel: MAX_PARALLEL,
    retryDelayMs: RETRY_DELAY_MS,
    perAttemptMs: PER_MODEL_MS,
    warn: msg => console.warn(msg)
  });
}

// Khởi động trước kết nối tới Gemini cho mọi key (không tốn token): comment đầu tiên không phải chờ bắt tay TLS.
async function warmGemini(apiKeys, model) {
  const keys = (Array.isArray(apiKeys) ? apiKeys : [apiKeys]).filter(Boolean);
  const m = buildChain(model)[0];
  const r = await Promise.all(keys.map(k => clientFor(k).models.get({ model: m }).then(() => true, () => false)));
  return r.some(Boolean);
}

const keyStatus = keys => pool.status(keys);

module.exports = { askGemini, warmGemini, keyStatus };
