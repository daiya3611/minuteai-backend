// 株価・指数・為替・暗号資産の価格取得。
// データソース: Yahoo Finance チャートAPI(キー不要・全市場対応)。
//   https://query1.finance.yahoo.com/v8/finance/chart/<symbol>
// 1銘柄ごとに直近の終値と前日終値を取り、変化率を計算する。
// 個別銘柄の取得失敗は握りつぶし、取れたものだけ返す。

const { fetchJson } = require('../utils/http');
const { flattenWatchlist } = require('../config/watchlist');

const YAHOO_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

async function fetchChart(symbol) {
  const qs = `interval=1d&range=5d`;
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`;
    try {
      const json = await fetchJson(url);
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error('空のレスポンス');
      return result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('取得失敗');
}

function extractQuote(result, item) {
  const meta = result.meta || {};
  const price =
    typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : null;
  // 前日終値: meta.previousClose を優先、無ければ chartPreviousClose、
  // それも無ければ close 配列の末尾2点から算出。
  let prevClose =
    typeof meta.previousClose === 'number'
      ? meta.previousClose
      : typeof meta.chartPreviousClose === 'number'
      ? meta.chartPreviousClose
      : null;

  const closes = result.indicators?.quote?.[0]?.close;
  if (price == null && Array.isArray(closes)) {
    const valid = closes.filter((c) => typeof c === 'number');
    if (valid.length) {
      const last = valid[valid.length - 1];
      if (prevClose == null && valid.length >= 2) prevClose = valid[valid.length - 2];
      return finalize(item, meta, last, prevClose);
    }
  }
  return finalize(item, meta, price, prevClose);
}

function finalize(item, meta, price, prevClose) {
  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePct =
    change != null && prevClose ? (change / prevClose) * 100 : null;
  return {
    symbol: item.symbol,
    name: item.name,
    category: item.category,
    currency: meta.currency || null,
    price,
    prevClose,
    change,
    changePct,
    marketTime: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : null,
  };
}

// ウォッチリスト(またはアイテム配列)の価格をまとめて取得する。
async function getQuotes(items = flattenWatchlist()) {
  const settled = await Promise.allSettled(
    items.map(async (item) => {
      const result = await fetchChart(item.symbol);
      return extractQuote(result, item);
    })
  );

  const quotes = [];
  const errors = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') quotes.push(s.value);
    else errors.push({ symbol: items[i].symbol, error: String(s.reason?.message || s.reason) });
  });
  return { quotes, errors };
}

// 変化率の絶対値が大きい順に上位 n 件を返す(値動きの大きい銘柄)。
function topMovers(quotes, n = 5) {
  return quotes
    .filter((q) => typeof q.changePct === 'number')
    .slice()
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, n);
}

module.exports = { getQuotes, topMovers, fetchChart };
