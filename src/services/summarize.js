// 株価の値動き + ニュース見出しを受け取り、Slack向けの日本語マーケット
// ダイジェスト(Markdown)を生成する。Anthropic Claude を使用。
// ANTHROPIC_API_KEY が無い場合は AI を使わずプレーンな整形にフォールバックする。

const Anthropic = require('@anthropic-ai/sdk');

// 既定モデル。コストや速度に応じて ANTHROPIC_MODEL で上書き可能。
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

// システム指示は毎回同一なのでプロンプトキャッシュの対象にする。
// (リクエストごとに変わる株価・ニュースは user メッセージ側に置く)
const SYSTEM_INSTRUCTIONS = `あなたは日本の個人投資家向けに、毎朝のマーケット状況を要約するアシスタントです。
与えられた「価格データ」と「ニュース見出し」だけを根拠に、Slackに投稿する日本語のダイジェストを作成してください。

出力ルール:
- Slack互換のMarkdownで、簡潔に(全体で概ね400〜700字)。
- 構成は次の3セクション:
  1. *📊 マーケット概況* … 主要指数・為替・暗号資産の動きを2〜4行で総括。
  2. *🔺 注目の値動き* … 値動きが大きい銘柄を箇条書きで(各行に銘柄名・変化率・一言)。
  3. *📰 トレンド・ニュース* … 重要なニュースを3〜6個、箇条書きで要点のみ。各項目に媒体名を添える。
- 数値は与えられたものを使い、勝手に作らない。データが無い項目は触れない。
- 投資判断の断定や推奨(「買い」「売り」等)はしない。事実と中立的な解説に徹する。
- 推測や一般論を足さず、与えられた材料の範囲で書く。`;

// 価格・ニュースを Claude に渡すための user メッセージ本文を組み立てる。
function buildUserContent({ quotes, topMovers, news, date }) {
  const lines = [];
  lines.push(`# 対象日: ${date || new Date().toISOString().slice(0, 10)}`);

  lines.push('\n## 価格データ');
  const byCategory = {};
  for (const q of quotes) {
    (byCategory[q.category] ||= []).push(q);
  }
  for (const [category, items] of Object.entries(byCategory)) {
    lines.push(`### ${category}`);
    for (const q of items) {
      const pct = typeof q.changePct === 'number' ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : 'N/A';
      const price = q.price != null ? `${q.price}${q.currency ? ' ' + q.currency : ''}` : 'N/A';
      lines.push(`- ${q.name} (${q.symbol}): ${price} / 前日比 ${pct}`);
    }
  }

  if (topMovers && topMovers.length) {
    lines.push('\n## 特に値動きの大きい銘柄');
    for (const q of topMovers) {
      const pct = typeof q.changePct === 'number' ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : 'N/A';
      lines.push(`- ${q.name} (${q.symbol}): 前日比 ${pct}`);
    }
  }

  lines.push('\n## ニュース見出し');
  for (const group of news) {
    if (!group.items.length) continue;
    lines.push(`### ${group.label}`);
    for (const it of group.items) {
      const src = it.source ? ` 〔${it.source}〕` : '';
      lines.push(`- ${it.title}${src}`);
    }
  }

  lines.push('\n上記の材料だけを使って、指定フォーマットの日本語ダイジェストを作成してください。');
  return lines.join('\n');
}

// Claude による要約。失敗・キー未設定時は null を返し、呼び出し側でフォールバック。
async function summarizeWithClaude(data) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client = new Anthropic(); // ANTHROPIC_API_KEY を自動で読む
  try {
    const message = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: SYSTEM_INSTRUCTIONS,
          cache_control: { type: 'ephemeral' }, // 固定の指示をキャッシュ
        },
      ],
      messages: [{ role: 'user', content: buildUserContent(data) }],
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return text || null;
  } catch (e) {
    console.warn('[summarize] Claude 要約に失敗。フォールバックします:', e.message);
    return null;
  }
}

// AI を使わないプレーンな整形(キー未設定・API障害時)。
function buildPlainDigest({ quotes, topMovers, news, date }) {
  const out = [];
  out.push(`*📊 マーケット概況* (${date || new Date().toISOString().slice(0, 10)})`);

  const indices = quotes.filter((q) => q.category === '指数・為替');
  for (const q of indices) {
    const pct = typeof q.changePct === 'number' ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : 'N/A';
    out.push(`• ${q.name}: ${q.price ?? 'N/A'} (${pct})`);
  }

  if (topMovers && topMovers.length) {
    out.push('\n*🔺 注目の値動き*');
    for (const q of topMovers) {
      const pct = typeof q.changePct === 'number' ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : 'N/A';
      out.push(`• ${q.name} (${q.symbol}): ${pct}`);
    }
  }

  out.push('\n*📰 トレンド・ニュース*');
  const flat = [];
  for (const group of news) for (const it of group.items) flat.push(it);
  for (const it of flat.slice(0, 8)) {
    const src = it.source ? ` 〔${it.source}〕` : '';
    out.push(`• ${it.title}${src}${it.link ? `\n  ${it.link}` : ''}`);
  }
  return out.join('\n');
}

// 公開API: できれば Claude で要約し、無理ならプレーン整形を返す。
async function summarize(data) {
  const ai = await summarizeWithClaude(data);
  if (ai) return { text: ai, generatedBy: DEFAULT_MODEL };
  return { text: buildPlainDigest(data), generatedBy: 'plain' };
}

module.exports = { summarize, buildUserContent, buildPlainDigest, DEFAULT_MODEL };
