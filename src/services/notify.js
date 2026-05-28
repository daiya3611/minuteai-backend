// Slack Incoming Webhook への通知。SLACK_WEBHOOK_URL が必要。
// 未設定時はコンソールに出力するだけ(開発時に便利)。
// Slack の1メッセージ上限(約40000字、blocksのtextは3000字)を考慮し分割する。

const { fetchWithTimeout } = require('../utils/http');

const SECTION_TEXT_LIMIT = 2900; // Slack section block の text は最大3000字

// 長文を見出し境界・行境界でなるべく自然に分割する。
function splitForSlack(text, limit = SECTION_TEXT_LIMIT) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > limit) {
      if (current) chunks.push(current);
      // 1行が limit を超える場合は強制分割
      if (line.length > limit) {
        for (let i = 0; i < line.length; i += limit) chunks.push(line.slice(i, i + limit));
        current = '';
      } else {
        current = line;
      }
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildBlocks(text) {
  return splitForSlack(text).map((chunk) => ({
    type: 'section',
    text: { type: 'mrkdwn', text: chunk },
  }));
}

async function sendToSlack(text, { headline } = {}) {
  const url = process.env.SLACK_WEBHOOK_URL;
  const blocks = [];
  if (headline) {
    blocks.push({ type: 'header', text: { type: 'plain_text', text: headline, emoji: true } });
  }
  blocks.push(...buildBlocks(text));

  if (!url) {
    console.log('[notify] SLACK_WEBHOOK_URL 未設定。本文を出力します:\n' + (headline ? headline + '\n' : '') + text);
    return { delivered: false, reason: 'no-webhook' };
  }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: headline || text.slice(0, 150), blocks }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Slack通知に失敗: HTTP ${res.status} ${body}`);
  }
  return { delivered: true };
}

module.exports = { sendToSlack, splitForSlack };
