// 定期実行スケジューラ。node-cron で毎朝などにダイジェストを配信する。
//   CRON_SCHEDULE ... cron式 (既定: 平日 08:00)  例) "0 8 * * 1-5"
//   CRON_TZ       ... タイムゾーン (既定: Asia/Tokyo)
//   ENABLE_SCHEDULER=false で無効化

const cron = require('node-cron');
const { runDigest } = require('./services/digest');

const DEFAULT_SCHEDULE = process.env.CRON_SCHEDULE || '0 8 * * 1-5';
const DEFAULT_TZ = process.env.CRON_TZ || 'Asia/Tokyo';

function startScheduler() {
  if (process.env.ENABLE_SCHEDULER === 'false') {
    console.log('[scheduler] ENABLE_SCHEDULER=false のため無効化されています');
    return null;
  }
  if (!cron.validate(DEFAULT_SCHEDULE)) {
    console.warn(`[scheduler] 無効なCRON_SCHEDULE: "${DEFAULT_SCHEDULE}" — スケジューラを起動しません`);
    return null;
  }

  const task = cron.schedule(
    DEFAULT_SCHEDULE,
    async () => {
      console.log(`[scheduler] ダイジェスト実行開始 ${new Date().toISOString()}`);
      try {
        const result = await runDigest({ notify: true });
        console.log(
          `[scheduler] 完了 (生成: ${result.generatedBy}, 配信: ${result.delivery.delivered})`
        );
      } catch (e) {
        console.error('[scheduler] ダイジェスト実行に失敗:', e.message);
      }
    },
    { timezone: DEFAULT_TZ }
  );

  console.log(`[scheduler] 起動: "${DEFAULT_SCHEDULE}" (${DEFAULT_TZ})`);
  return task;
}

module.exports = { startScheduler };
