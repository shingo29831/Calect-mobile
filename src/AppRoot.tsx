// src/AppRoot.tsx
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RootNavigator from './navigation';
import { Platform } from 'react-native';

// 追記: ストア読み込み & 同期
import { loadLocalStore } from './store/localFile';
import { replaceAllInstances } from './store/db';
import { runIncrementalSync, exampleFetchServerDiff } from './store/sync';

const qc = new QueryClient();

// index.tsx or App.tsx (最上部付近)
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { connectToDevTools } = require('react-devtools-core');

  // エミュレータ/実機に合わせてホストを選択
  const host =
    Platform?.OS === 'android'
      ? '10.0.2.2' // Androidエミュレータ
      : 'localhost'; // iOSシミュ/デスクトップ

  connectToDevTools({
    host,
    port: 8097, // React DevTools のデフォルト
  });
}

/** 起動時ブート処理（UIはブロックしない） */
function Bootstrapper() {
  useEffect(() => {
    (async () => {
      try {
        // 1) ローカルのスナップショットを先に反映（即座にUIに出す）
        const local = await loadLocalStore();
        if (local?.instances?.length) {
          replaceAllInstances(local.instances);
        }

        // 2) バックグラウンドでサーバ差分同期（本番は exampleFetchServerDiff を差し替え）
        await runIncrementalSync(exampleFetchServerDiff);
      } catch (e) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
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
