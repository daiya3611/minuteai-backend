// マーケットダイジェストのオーケストレーション。
// 価格取得 → 値動きの大きい銘柄抽出 → ニュース取得 → AI要約 → Slack通知。

const { getQuotes, topMovers } = require('./prices');
const { fetchNews } = require('./news');
const { summarize } = require('./summarize');
const { sendToSlack } = require('./notify');
const { flattenWatchlist, getMarketQueries } = require('../config/watchlist');

// 価格 + ニュースの「スナップショット」を取得する(AI・通知なし)。
async function buildSnapshot({ moverCount = 5 } = {}) {
  const items = flattenWatchlist();
  const { quotes, errors } = await getQuotes(items);
  const movers = topMovers(quotes, moverCount);

  // 市場全体のニュース + 値動き上位銘柄のニュースを取得。
  const queries = [
    ...getMarketQueries().map((q) => ({ query: q, label: `市場: ${q}` })),
    ...movers.map((m) => ({ query: m.name, label: `${m.name} (${m.symbol})` })),
  ];
  const news = await fetchNews(queries, { limit: 4, maxAgeHours: 48 });

  return {
    date: new Date().toISOString().slice(0, 10),
    quotes,
    topMovers: movers,
    news,
    priceErrors: errors,
  };
}

// フルのダイジェスト実行: スナップショット → 要約 → 通知。
async function runDigest({ notify = true } = {}) {
  const snapshot = await buildSnapshot();
  const { text, generatedBy } = await summarize(snapshot);

  const headline = `🗞 マーケットダイジェスト ${snapshot.date}`;
  let delivery = { delivered: false, reason: 'skipped' };
  if (notify) {
    delivery = await sendToSlack(text, { headline });
  }

  return { headline, text, generatedBy, delivery, snapshot };
}

module.exports = { buildSnapshot, runDigest };
