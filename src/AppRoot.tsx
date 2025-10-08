// src/AppRoot.tsx
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RootNavigator from './navigation';
import { Platform, NativeModules } from 'react-native';
import { encode, decode } from 'base-64';

// 追記: SecureStore の型（簡易）
type SecureStoreNative = {
  setItem(service: string, account: string, valueB64: string): Promise<void>;
  getItem(service: string, account: string): Promise<string | null>;
  deleteItem(service: string, account: string): Promise<void>;
};
const { SecureStore } = NativeModules as { SecureStore: SecureStoreNative };

// ストア読み込み & 同期（storage.ts に統一）
import { loadPersistFile } from './store/storage';
import { replaceAllInstances } from './store/db';
import { runIncrementalSync, exampleFetchServerDiff } from './store/sync';
import type { EventInstance as ApiEventInstance } from './api/types';

const qc = new QueryClient();

// DevTools 接続
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { connectToDevTools } = require('react-devtools-core');
  const host = Platform?.OS === 'android' ? '10.0.2.2' : 'localhost';
  connectToDevTools({ host, port: 8097 });
}

// ★ 追加: DevTools/コンソールから実行できる自己テスト関数を公開
if (__DEV__) {
  (globalThis as any).testSecureStore = async () => {
    try {
      await SecureStore.setItem('demo.service', 'demo.account', encode('hello world'));

      const b64 = await SecureStore.getItem('demo.service', 'demo.account');
      console.log('[testSecureStore] read base64 =', b64);
      console.log('[testSecureStore] decoded    =', b64 ? decode(b64) : null);

      await SecureStore.deleteItem('demo.service', 'demo.account');
      const after = await SecureStore.getItem('demo.service', 'demo.account');
      console.log('[testSecureStore] after delete =', after);
    } catch (e) {
      console.warn('[testSecureStore] error:', e);
    }
  };
}

// storage.EventInstance(instance_id: number|string) → api.EventInstance(number) へ安全に変換
function toApiInstancesSafe(
  rows: Array<{ instance_id: number | string } & Omit<ApiEventInstance, 'instance_id'>>
): ApiEventInstance[] {
  const out: ApiEventInstance[] = [];
  for (const row of rows) {
    const id =
      typeof row.instance_id === 'number'
        ? row.instance_id
        : /^\d+$/.test(String(row.instance_id))
        ? Number(row.instance_id)
        : undefined;
    if (id === undefined) continue;
    out.push({ ...(row as any), instance_id: id });
  }
  return out;
}

/** 起動時ブート処理（UIはブロックしない） */
function Bootstrapper() {
  useEffect(() => {
    (async () => {
      try {
        // 1) ローカルの永続ファイルを先に反映（即座にUIに出す）
        const file = await loadPersistFile();
        if (Array.isArray(file.instances) && file.instances.length > 0) {
          const mapped = toApiInstancesSafe(file.instances as any);
          if (mapped.length) replaceAllInstances(mapped);
        }

        // 2) （開発時のみ）SecureStoreの簡易自己テスト
        if (__DEV__ && SecureStore) {
          try {
            const svc = 'test.svc';
            const acc = 'test.acc';
            const base64 = 'aGVsbG8gd29ybGQ='; // "hello world"

            await SecureStore.setItem(svc, acc, base64);
            const got = await SecureStore.getItem(svc, acc);
            console.log('[SecureStore selftest] read:', got);

            await SecureStore.deleteItem(svc, acc);
            const after = await SecureStore.getItem(svc, acc);
            console.log('[SecureStore selftest] after delete:', after); // null ならOK
          } catch (e) {
            console.warn('[SecureStore selftest] failed:', e);
          }
        }

        // 3) サーバ差分同期（本番は exampleFetchServerDiff を差し替え）
        await runIncrementalSync(exampleFetchServerDiff);
      } catch (e) {
        if (__DEV__) {
          console.warn('[AppRoot] bootstrap failed:', e);
        }
      }
    })();
  }, []);

  return null; // 画面には何も描画しない
}

export default function AppRoot() {
  return (
    <QueryClientProvider client={qc}>
      <NavigationContainer>
        {/* 起動時の非同期セットアップ（UIはそのまま表示） */}
        <Bootstrapper />
        <RootNavigator />
      </NavigationContainer>
    </QueryClientProvider>
  );
}
