// 監視対象のウォッチリスト。
// symbol は Yahoo Finance のティッカー表記を使う。
//   日本株:   コード + ".T"        例) 7203.T (トヨタ)
//   米国株:   ティッカーそのまま   例) AAPL
//   暗号資産: "<コイン>-USD"       例) BTC-USD
//   指数:     "^" + コード         例) ^N225 (日経平均)
//   為替:     "<ペア>=X"           例) USDJPY=X
//
// 環境変数で上書き可能:
//   WATCHLIST  ... JSON文字列で丸ごと差し替え
//   または プロジェクト直下の watchlist.json を置けばそれを優先

const fs = require('fs');
const path = require('path');

const DEFAULT_WATCHLIST = {
  日本株: [
    { symbol: '7203.T', name: 'トヨタ自動車' },
    { symbol: '6758.T', name: 'ソニーグループ' },
    { symbol: '9984.T', name: 'ソフトバンクグループ' },
    { symbol: '8035.T', name: '東京エレクトロン' },
    { symbol: '9983.T', name: 'ファーストリテイリング' },
  ],
  米国株: [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'GOOGL', name: 'Alphabet (Google)' },
    { symbol: 'TSLA', name: 'Tesla' },
  ],
  暗号資産: [
    { symbol: 'BTC-USD', name: 'ビットコイン' },
    { symbol: 'ETH-USD', name: 'イーサリアム' },
  ],
  '指数・為替': [
    { symbol: '^N225', name: '日経平均株価' },
    { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^DJI', name: 'NYダウ' },
    { symbol: '^IXIC', name: 'NASDAQ総合' },
    { symbol: 'USDJPY=X', name: 'ドル/円' },
  ],
};

// 市場全体のニュース検索クエリ(日本語)。トレンド把握に使う。
const DEFAULT_MARKET_QUERIES = [
  '株式市場 相場',
  '日経平均 株価',
  '米国株 NYダウ ナスダック',
  '暗号資産 ビットコイン',
  '為替 ドル円',
];

function loadFromEnvOrFile() {
  if (process.env.WATCHLIST) {
    try {
      return JSON.parse(process.env.WATCHLIST);
    } catch (e) {
      console.warn('[watchlist] WATCHLIST のJSONパースに失敗。デフォルトを使用します:', e.message);
    }
  }
  const filePath = path.join(process.cwd(), 'watchlist.json');
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.warn('[watchlist] watchlist.json の読み込みに失敗。デフォルトを使用します:', e.message);
    }
  }
  return DEFAULT_WATCHLIST;
}

function getWatchlist() {
  return loadFromEnvOrFile();
}

// カテゴリ構造をフラットな配列に展開する({ symbol, name, category })。
function flattenWatchlist(watchlist = getWatchlist()) {
  const items = [];
  for (const [category, entries] of Object.entries(watchlist)) {
    for (const entry of entries) {
      items.push({ ...entry, category });
    }
  }
  return items;
}

function getMarketQueries() {
  if (process.env.MARKET_NEWS_QUERIES) {
    return process.env.MARKET_NEWS_QUERIES.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_MARKET_QUERIES;
}

module.exports = {
  DEFAULT_WATCHLIST,
  DEFAULT_MARKET_QUERIES,
  getWatchlist,
  flattenWatchlist,
  getMarketQueries,
};
