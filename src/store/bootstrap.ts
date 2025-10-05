// src/store/bootstrap.ts
import { InteractionManager } from 'react-native';
import { replaceAllInstances } from './db';
import { loadLocalStore } from './localFile';

/** 起動時：UI描画をブロックしない非同期ロード */
export async function bootstrapData(): Promise<void> {
  // まず描画を優先して、重い処理はイベントループの後ろに送る
  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });

  // ローカル保存分を読み込み→メモリDBへ反映
  try {
    const store = await loadLocalStore(); // 失敗時は呼び出し側で握りつぶす
    if (store?.instances) {
      replaceAllInstances(store.instances);
    }
  } catch (_) {
    // 初回やファイル無しなら無視（SEEDのまま起動）
  }
}
