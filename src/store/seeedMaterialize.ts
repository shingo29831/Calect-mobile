// src/store/seeedMaterialize.ts
import { savePersistFile } from './storage';
import { SEED_ALL } from './seeds';

/**
 * 初回データ投入スクリプト（開発用）
 * - AsyncStorage に PersistFile v1 をそのまま保存
 */
async function main() {
  await savePersistFile({
    version: 1,
    calendars: SEED_ALL.calendars,
    events: {},                     // 必要なら seeds 側で用意して流し込む
    instances: SEED_ALL.instances,  // 画面即時表示用にインスタンスキャッシュも投入
    deleted_event_ids: [],
    deleted_calendar_ids: [],
    sync: { cursor: null, last_synced_at: null },
  });
  // eslint-disable-next-line no-console
  console.log('[seeedMaterialize] seeded into AsyncStorage (calect.persist.v1)');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[seeedMaterialize] failed:', e);
});
