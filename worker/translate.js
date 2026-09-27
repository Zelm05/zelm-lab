/* ==========================================================================
 * translate.js —— 机器翻译接口（仅站长）
 *
 *   POST /api/admin/translate
 *   body: { texts: { title: '标题', summary: '摘要' }, sourceLang: 'zh-CN', targetLang: 'en' }
 *   →     { ok: true, provider: 'deepl', translations: { title: 'Title', summary: 'Summary' } }
 *   （也兼容单字段写法 `{ text: '...' }` → 返回 `{ translation: '...' }`）
 *
 * 安全：
 *   · 密钥**只**从 wrangler secret 读（env.DEEPL_API_KEY 等），绝不下发前端；
 *   · 仅站长可调用（verifySession + role === 'owner'）。
 *
 * 供应商选择：env.TRANSLATE_PROVIDER（deepl | google | openai）；
 *   不设则按「哪个 key 配了就用哪个」自动挑（deepl → google → openai）。
 *   一个都没配 → 501 + 明确提示，前端会告诉站长去配哪个 secret。
 *
 * ⚠️ 本接口**不落库**：只返回译文，由站长在编辑页确认/修改后再走正常的保存流程。
 *    这样机翻永远只是「草稿」，不会绕过人工校对直接进内容库。
 * ========================================================================== */
import { json, verifySession } from './auth.js';

/* 站内语言码 → 各供应商的语言码。
 * ⚠️ Cloudflare 的专用翻译模型 `@cf/meta/m2m100-1.2b` **不区分简繁**（都是 `zh`），
 *    而本项目 zh-CN 与 zh-TW 是两种语言 —— 所以 cloudflare 这一路走 **LLM**（用语言全称提示），
 *    它既能翻四语，也能做「简体 → 繁体」的转换。m2m100 只适合非中文语对。 */
const LANG_MAP = {
  deepl: { 'zh-CN': 'ZH-HANS', 'zh-TW': 'ZH-HANT', en: 'EN', ja: 'JA' },
  google: { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', en: 'en', ja: 'ja' },
  openai: { 'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', en: 'English', ja: 'Japanese' },
  cloudflare: { 'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', en: 'English', ja: 'Japanese' },
};

const PROVIDERS = ['deepl', 'google', 'openai', 'cloudflare'];
const KEY_ENV = { deepl: 'DEEPL_API_KEY', google: 'GOOGLE_TRANSLATE_API_KEY', openai: 'OPENAI_API_KEY' };
/* Cloudflare 走 Workers AI 绑定（wrangler.toml 的 [ai]），**不需要密钥**。
   默认用 llama-3.2-3b-instruct：便宜（$0.05/M 输入）、够用、能处理简繁。
   想换模型（比如换成 m2m100 只翻非中文语对）设 CF_TRANSLATE_MODEL 即可。 */
const CF_DEFAULT_MODEL = '@cf/meta/llama-3.2-3b-instruct';
/* 单次请求上限：防呆，避免站长手滑把整篇长文塞进来烧配额 */
const MAX_CHARS = 5000;
const TIMEOUT_MS = 20000;

/* 引擎优先级（2026-09-27 改）：
 *   显式 TRANSLATE_PROVIDER  >  Workers AI  >  DeepL  >  Google  >  OpenAI  >  501
 *
 * 为什么把 Workers AI 提到第三方密钥**之前**：
 *   · 零密钥 —— 不依赖任何第三方账号，也不存在密钥泄露/轮换问题；
 *   · 随 [ai] binding 开箱即用，站长什么都没配也能直接机翻；
 *   · 走 LLM（见下方模型说明），能同时覆盖四语互译与**简繁转换**。
 * 想强制用某个第三方引擎就设 TRANSLATE_PROVIDER=deepl|google|openai。 */
function pickProvider(env) {
  /* ① 显式指定最优先 —— 但指定的引擎必须真的可用，否则退回自动选择 */
  const want = String((env && env.TRANSLATE_PROVIDER) || '').trim().toLowerCase();
  if (want && PROVIDERS.indexOf(want) !== -1) {
    if (want === 'cloudflare') {
      if (env && env.AI) return 'cloudflare';          // 需要 [ai] binding 真的在
    } else if (String((env && env[KEY_ENV[want]]) || '').trim()) {
      return want;                                      // 需要对应密钥真的配了
    }
    /* 指定的不可用 → 继续走下面的自动选择 */
  }
  /* ② Workers AI（零密钥，最省事） */
  if (env && env.AI) return 'cloudflare';
  /* ③ 第三方密钥兜底 */
  for (const p of ['deepl', 'google', 'openai']) {
    if (String((env && env[KEY_ENV[p]]) || '').trim()) return p;
  }
  return null;
}

function cleanKey(env, provider) {
  /* 容错：secret 若被粘贴成带引号或行尾空格，供应商的严格校验会直接 401 */
  return String((env && env[KEY_ENV[provider]]) || '').trim().replace(/^["']+/, '').replace(/["']+$/, '').trim();
}

/** 带超时的 fetch —— 供应商偶发挂起时不能让站长干等 */
async function fetchWithTimeout(url, init) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, init, { signal: ctl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

/** 给任意 Promise 加超时。
 *  env.AI.run **没有 timeout 参数**，模型挂起时站长会一直干等到浏览器超时，
 *  所以这里自己包一层。⚠️ 抛出的错误信息**必须含 abort 字样** ——
 *  下方 handleTranslateApi 按 /abort/i 把它映射成 504。 */
async function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error((label || '调用') + ' 超时（' + (ms / 1000) + 's），已 abort')),
      ms,
    );
  });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- 各供应商实现 ---------------- */
async function callDeepL(env, texts, from, to) {
  const key = cleanKey(env, 'deepl');
  /* DeepL 的 text 参数可重复传，一次翻多条；返回顺序与请求一致 */
  const body = new URLSearchParams();
  for (const t of texts) body.append('text', t);
  body.append('source_lang', from);
  body.append('target_lang', to);
  const res = await fetchWithTimeout('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { Authorization: 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || ('DeepL HTTP ' + res.status));
  return (data.translations || []).map((x) => x.text);
}

async function callGoogle(env, texts, from, to) {
  const key = cleanKey(env, 'google');
  const res = await fetchWithTimeout('https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, source: from, target: to, format: 'text' }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data && data.error && data.error.message;
    throw new Error(msg || ('Google HTTP ' + res.status));
  }
  return ((data.data && data.data.translations) || []).map((x) => x.translatedText);
}

async function callOpenAI(env, texts, from, to) {
  const key = cleanKey(env, 'openai');
  /* 用 JSON 数组一次翻多条，并要求「只回 JSON」——比逐条调用省配额 */
  const prompt = 'Translate the following JSON array of strings from ' + from + ' to ' + to +
    '. Keep the array length and order identical. Return ONLY a JSON array of strings, no prose.\n' +
    JSON.stringify(texts);
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data && data.error && data.error.message;
    throw new Error(msg || ('OpenAI HTTP ' + res.status));
  }
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('OpenAI 返回的不是 JSON 数组');
  const arr = JSON.parse(m[0]);
  if (!Array.isArray(arr) || arr.length !== texts.length) throw new Error('OpenAI 返回的条数对不上');
  return arr.map((x) => String(x));
}

/* ---------------- Cloudflare Workers AI ----------------
 * 为什么走 LLM 而不是专用翻译模型：
 *   `@cf/meta/m2m100-1.2b` 只有 `zh` 一个中文码，**分不出简繁** ——
 *   本项目 zh-CN / zh-TW 是两种语言，用它翻简→繁会变成「同语言直通」（等于没翻）。
 *   LLM 既能翻四语，也能做简体→繁体的字形转换，且同样由 Cloudflare 托管、无需额外密钥。
 *
 * 成本参考（写死在注释里，免得以后忘了）：llama-3.2-3b-instruct
 *   $0.0509 / M 输入 tokens，$0.335 / M 输出 tokens —— 短文案翻译基本可忽略。
 *   想换成 m2m100（只用于非中文语对）设 env.CF_TRANSLATE_MODEL 即可。
 */
async function callCloudflare(env, texts, from, to) {
  if (!env || !env.AI) throw new Error('未绑定 Workers AI（wrangler.toml 缺 [ai] binding）');
  const model = String(env.CF_TRANSLATE_MODEL || '').trim() || CF_DEFAULT_MODEL;
  /* 简繁互转是「同语言、换字形」，必须单独给指令：
     只说 Translate 的话模型很可能原样返回（认为是同一种语言）。 */
  const zhPair = /Chinese/i.test(from) && /Chinese/i.test(to);
  const buildPrompt = (payload) =>
    'Translate the following JSON array of strings from ' + from + ' to ' + to + '.\n' +
    'Rules:\n' +
    '- Produce natural, fluent, idiomatic ' + to + ' — not a word-for-word literal rendering.\n' +
    '- Keep the array length and order exactly identical.\n' +
    '- Preserve markdown/HTML tags, placeholders and line breaks.\n' +
    (zhPair
      ? '- This is Chinese-to-Chinese: convert the script faithfully to ' + to +
        ' and use the vocabulary conventions of ' + to + ' (e.g. Simplified 软件 vs Traditional 軟體). ' +
        'Keep the original meaning and punctuation style.\n'
      : '') +
    '- Return ONLY a JSON array of strings, no explanations.\n' +
    '- Response format example: ["translation of item 1","translation of item 2"]\n' +
    JSON.stringify(payload);
  /* env.AI.run 没有超时参数 → 用 withTimeout 包一层，超时会抛含 abort 的错误（→504）。
     小模型（llama-3.2-3b）偶发**空输出**是已知现象 —— 空结果自动重试一次，
     两次都空才报 502（真机实测踩过「Workers AI 返回了空结果」）。 */
  const once = (payload) => withTimeout(
    env.AI.run(model, {
      messages: [{ role: 'user', content: buildPrompt(payload) }],
      /* 输出上限按输入长度估：译文一般不超过原文的 3 倍 token 量 */
      max_tokens: Math.min(4096, Math.max(512, payload.join('').length * 3)),
      temperature: 0,
    }),
    TIMEOUT_MS,
    'Workers AI',
  );
  let text = extractAiText(await once(texts));
  if (!text.trim()) text = extractAiText(await once(texts));
  if (!text.trim()) {
    throw new Error('Workers AI 连续两次返回空结果（' + model + ' 偶发空输出），请重试；' +
      '持续失败可设 CF_TRANSLATE_MODEL 换模型');
  }
  try {
    return parseAiTranslations(text, texts.length);
  } catch (e) {
    /* 批量降级（真机实测）：模型经常无视「只回 JSON 数组」的指令，直接输出整段
       译文纯文本 —— 报「不是 JSON 数组」前，先退化为**逐条单独翻**：
       单条模式下纯文本会被直接当译文（parseAiTranslations 的单条降级）。
       成本：N 个字段 N 次调用，后台手动操作可接受。 */
    if (texts.length === 1) throw e;
    const out = [];
    for (const t of texts) {
      out.push(parseAiTranslations(extractAiText(await once([t])), 1)[0]);
    }
    return out;
  }
}

/* ---------------- Workers AI 返回值解析（2026-09-27 加固） ----------------
 * 真实 LLM 的返回形态五花八门，之前只认「恰好一段 JSON 数组」，
 * 于是经常报「Workers AI 返回的不是 JSON 数组」。现在分两层容错：
 *   ① extractAiText：从返回值里取出文本 —— 可能是字符串，
 *      也可能是 { response } / { result } / { text } / { translated_text }。
 *   ② parseAiTranslations：把文本解析成与请求等长的数组 ——
 *      支持 JSON 数组、带 ```json 代码块的数组；**单条请求**时若模型直接回了
 *      纯文本（最常见的跑偏形态），把剥壳后的整段文本当作译文降级放行；
 *      空结果 / 多条但对不上数组 → 明确 502，绝不抛未捕获异常。 */

/** 从 Workers AI 的返回值里提取文本内容。
 *  覆盖的真实形态：字符串；{ response | result | text | translated_text |
 *  content | output_text | output | message }；chat 式数组 [{ role, content }]；
 *  嵌套对象（如 { message: { content } }）—— 数组与对象递归下钻（限 2 层）。 */
function extractAiText(res, depth) {
  const d = depth || 0;
  if (res == null) return '';
  if (typeof res === 'string') return res;
  if (Array.isArray(res)) {
    if (d >= 2) return '';
    for (const item of res) {
      const v = extractAiText(item, d + 1);
      if (v.trim()) return v;
    }
    return '';
  }
  if (typeof res === 'object') {
    for (const k of ['response', 'result', 'text', 'translated_text', 'content', 'output_text', 'output', 'message']) {
      const v = res[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    if (d >= 2) return '';
    for (const k of ['response', 'result', 'text', 'output', 'message', 'data']) {
      const v = res[k];
      if (v && typeof v === 'object') {
        const nested = extractAiText(v, d + 1);
        if (nested.trim()) return nested;
      }
    }
    /* 对象但没有任何文本字段（如 { response: '' }）→ 视为空结果，
       ⚠️ 不能 String(res) —— 那会变成 "[object Object]" 这种无意义垃圾再往下传 */
    return '';
  }
  return String(res);
}

/** 把 LLM 返回文本解析成 expected 个译文；失败一律抛带人话的 Error（→502） */
function parseAiTranslations(raw, expected) {
  let text = String(raw == null ? '' : raw).trim();
  if (!text) throw new Error('Workers AI 返回了空结果');
  /* ① 剥 markdown 代码块：```json ... ``` / ``` ... ```（取第一个非空代码块） */
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1].trim()) text = fence[1].trim();
  /* ② 提取 JSON 数组并解析 */
  const m = text.match(/\[[\s\S]*\]/);
  if (m) {
    let arr = null;
    try { arr = JSON.parse(m[0]); } catch (e) { arr = null; /* JSON 本身坏 → 走降级 */ }
    if (Array.isArray(arr)) {
      if (!arr.length) throw new Error('Workers AI 返回了空结果');
      if (arr.length !== expected) {
        throw new Error('Workers AI 返回的条数对不上（期望 ' + expected + '，实际 ' + arr.length + '）');
      }
      return arr.map((x) => String(x));
    }
    /* 解析出来不是数组（如 {}）→ 不当译文，走下方报错 */
  }
  /* ③ 降级：单条请求且返回是纯文本（不以 { 或 [ 开头）→ 整段当译文 */
  if (expected === 1 && !/^[[{]/.test(text)) {
    return [text.replace(/^["']+|["']+$/g, '')];
  }
  throw new Error('Workers AI 返回的不是 JSON 数组（收到: ' + text.slice(0, 80) + '）');
}

const IMPL = { deepl: callDeepL, google: callGoogle, openai: callOpenAI, cloudflare: callCloudflare };

/* ---------------- 路由处理 ---------------- */
async function requireOwner(request, env) {
  const user = await verifySession(request, env);
  if (!user) return { err: json({ error: '请先登录' }, 401) };
  if (user.role !== 'owner') return { err: json({ error: '仅站长可操作' }, 403) };
  return { user };
}

export async function handleTranslateApi(request, env) {
  let p;
  try { p = new URL(request.url).pathname; } catch (e) { return null; }
  if (p !== '/api/admin/translate') return null;
  if (request.method !== 'POST') return json({ error: '方法不支持' }, 405);

  const guard = await requireOwner(request, env);
  if (guard.err) return guard.err;

  const provider = pickProvider(env);
  if (!provider) {
    return json({
      error: '未配置机器翻译',
      hint: '三种方式任选：① 在 wrangler.toml 加 [ai] binding（Workers AI，零密钥，推荐）；' +
        '② wrangler secret put ' + Object.values(KEY_ENV).join(' / ') + ' 之一；' +
        '③ 用 TRANSLATE_PROVIDER 显式指定供应商',
    }, 501);
  }

  let b = null;
  try { b = await request.json(); } catch (e) { return json({ error: '请求体不是合法 JSON' }, 400); }
  if (!b) return json({ error: '缺少请求体' }, 400);

  const sourceLang = String(b.sourceLang || 'zh-CN');
  const targetLang = String(b.targetLang || '');
  if (!targetLang) return json({ error: '缺少 targetLang' }, 400);
  if (sourceLang === targetLang) return json({ error: '源语言与目标语言相同' }, 400);

  const map = LANG_MAP[provider];
  if (!map[sourceLang] || !map[targetLang]) {
    return json({ error: '该供应商不支持 ' + sourceLang + ' → ' + targetLang }, 400);
  }

  /* 支持两种入参：批量 { texts: {...} } 与单条 { text: '...' } */
  const batch = b.texts && typeof b.texts === 'object' && !Array.isArray(b.texts);
  const single = typeof b.text === 'string';
  if (!batch && !single) return json({ error: '需要 texts 对象或 text 字符串' }, 400);

  const keys = batch ? Object.keys(b.texts) : ['text'];
  const values = keys.map((k) => String(batch ? b.texts[k] : b.text) || '');
  /* 空字段不送翻译（省配额），但要保持下标对应，回来再填回原位置 */
  const idx = [];
  const payload = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i].trim()) { idx.push(i); payload.push(values[i]); }
  }
  if (!payload.length) return json({ error: '没有可翻译的内容' }, 400);

  const totalChars = payload.reduce((n, s) => n + s.length, 0);
  if (totalChars > MAX_CHARS) {
    return json({ error: '本次内容共 ' + totalChars + ' 字符，超过单次上限 ' + MAX_CHARS }, 413);
  }

  let out;
  try {
    out = await IMPL[provider](env, payload, map[sourceLang], map[targetLang]);
  } catch (e) {
    const msg = String((e && e.message) || e);
    /* 超时 / 网络 / 配额 / 鉴权：都给一句人话，别让站长对着 500 猜 */
    if (/abort/i.test(msg)) return json({ error: '翻译服务超时（' + (TIMEOUT_MS / 1000) + 's），请稍后重试' }, 504);
    if (/quota|rate limit|too many|429/i.test(msg)) return json({ error: '翻译配额不足或触发限流：' + msg }, 429);
    if (/401|403|auth|key/i.test(msg)) return json({ error: '翻译密钥无效或权限不足：' + msg }, 502);
    return json({ error: '翻译失败：' + msg }, 502);
  }

  const filled = values.slice();
  for (let i = 0; i < idx.length; i++) filled[idx[i]] = out[i];

  if (single) return json({ ok: true, provider: provider, translation: filled[0] });
  const translations = {};
  keys.forEach((k, i) => { translations[k] = filled[i]; });
  return json({ ok: true, provider: provider, translations: translations });
}
