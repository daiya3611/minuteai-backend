// 共通のHTTPユーティリティ。Node 18+ のグローバル fetch を使い、
// タイムアウトと User-Agent を付与する。外部APIがブロックや遅延を
// 起こしても呼び出し側がハングしないようにする。

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_UA =
  'Mozilla/5.0 (compatible; MinuteAI-MarketBot/1.0; +https://minuteai.vercel.app)';

async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { 'User-Agent': DEFAULT_UA, ...headers },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} (${url})`);
  }
  return res.json();
}

async function fetchText(url, options = {}) {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} (${url})`);
  }
  return res.text();
}

module.exports = { fetchWithTimeout, fetchJson, fetchText };
