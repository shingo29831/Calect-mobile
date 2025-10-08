// src/store/bootstrap.ts
import { InteractionManager } from 'react-native';
import { replaceAllInstances } from './db';
import { loadPersistFile } from './storage';
import type { EventInstance as ApiEventInstance } from '../api/types';

/** 起動時：UI描画をブロックしない非同期ロード */
export async function bootstrapData(): Promise<void> {
  // まず描画を優先し、重い処理はフレーム確定後に回す
  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });

  try {
    const file = await loadPersistFile();

    if (Array.isArray(file.instances) && file.instances.length > 0) {
      // storage.EventInstance(string|number) -> api.EventInstance(number) へ変換
      const toNum = (v: string | number): number | undefined => {
        if (typeof v === 'number') return v;
        // 先頭ゼロ等を許容するなら parseInt でも可。ここでは純粋な数値文字列のみ採用。
        return /^\d+$/.test(v) ? Number(v) : undefined;
      };

      const mapped: ApiEventInstance[] = file.instances
        .map((ins) => {
          const id = toNum(ins.instance_id as any);
          if (id === undefined) return undefined; // 型不一致は落とす
          // 他のプロパティはそのままコピー（型は互換）
          return {
            ...ins,
            instance_id: id,
          } as ApiEventInstance;
        })
        .filter((x): x is ApiEventInstance => x !== undefined);

      if (mapped.length > 0) {
        replaceAllInstances(mapped);
      }
    }
  } catch {
    // 初回や破損時も落ちないように握り潰す（シードで起動）
  }
}
