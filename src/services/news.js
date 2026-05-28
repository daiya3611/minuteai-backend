// ニュース取得。データソース: Google ニュース RSS(キー不要・日本語対応)。
//   https://news.google.com/rss/search?q=<query>&hl=ja&gl=JP&ceid=JP:ja
// 検索クエリ単位で最新記事を取り、直近の記事だけを残す。

const Parser = require('rss-parser');
const { fetchText } = require('../utils/http');

const parser = new Parser({ timeout: 12000 });

function buildUrl(query) {
  const params = new URLSearchParams({
    q: query,
    hl: 'ja',
    gl: 'JP',
    ceid: 'JP:ja',
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

// 1クエリ分のニュースを取得。失敗時は空配列(呼び出し側を止めない)。
async function fetchNewsForQuery(query, { limit = 5, maxAgeHours = 48 } = {}) {
  try {
    const xml = await fetchText(buildUrl(query));
    const feed = await parser.parseString(xml);
    const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
    return (feed.items || [])
      .map((it) => ({
        title: cleanTitle(it.title),
        link: it.link,
        source: it.source?.name || it.creator || extractSource(it.title),
        publishedAt: it.isoDate || it.pubDate || null,
        query,
      }))
      .filter((it) => {
        if (!it.publishedAt) return true;
        const t = new Date(it.publishedAt).getTime();
        return Number.isNaN(t) ? true : t >= cutoff;
      })
      .slice(0, limit);
  } catch (e) {
    console.warn(`[news] 取得失敗 query="${query}":`, e.message);
    return [];
  }
}

// Google ニュースのタイトルは「見出し - 媒体名」形式が多いので媒体名を分離。
function cleanTitle(title = '') {
  const idx = title.lastIndexOf(' - ');
  return idx > 0 ? title.slice(0, idx).trim() : title.trim();
}
function extractSource(title = '') {
  const idx = title.lastIndexOf(' - ');
  return idx > 0 ? title.slice(idx + 3).trim() : null;
}

// 重複(同一タイトル/リンク)を除去。
function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = (it.title || '') + '|' + (it.link || '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// 複数クエリをまとめて取得し、ラベル付きで返す。
async function fetchNews(queries, opts = {}) {
  const settled = await Promise.allSettled(
    queries.map(async (q) => ({
      query: q.query || q,
      label: q.label || q.query || q,
      items: await fetchNewsForQuery(q.query || q, opts),
    }))
  );
  return settled
    .filter((s) => s.status === 'fulfilled')
    .map((s) => ({ ...s.value, items: dedupe(s.value.items) }));
}

module.exports = { fetchNews, fetchNewsForQuery };
