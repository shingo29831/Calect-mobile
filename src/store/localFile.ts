// src/store/localFile.ts
// =======================================================
// ローカル永続化ユーティリティ（最小限）
// 優先度: React Native AsyncStorage → Web localStorage → メモリ
// 提供関数: loadLocalStore / saveLocalStore / appendOps
// =======================================================

type KVStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

// DOM lib が無い環境向けに localStorage 互換の最小型を自前定義
type WebStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const STORE_KEY = 'calect.localStore';
const OPS_KEY   = 'calect.ops.ndjson';

// ------------ フォールバック用のメモリ実装 ------------
let __memStoreObj: any = {};
let __memOpsNdjson = '';

const MemoryStore: KVStore = {
  async getItem(key: string) {
    if (key === STORE_KEY) return JSON.stringify(__memStoreObj);
    if (key === OPS_KEY)   return __memOpsNdjson;
    return null;
  },
  async setItem(key: string, value: string) {
    if (key === STORE_KEY) {
      try { __memStoreObj = JSON.parse(value || '{}'); } catch { __memStoreObj = {}; }
      return;
    }
    if (key === OPS_KEY) {
      __memOpsNdjson = value ?? '';
    }
  }
};

// ------------ Web(localStorage) ラッパ（globalThis 経由） ------------
const WebLocalStorage: KVStore | null = ((): KVStore | null => {
  try {
    const g: any = (typeof globalThis !== 'undefined') ? globalThis : undefined;
    const ls: WebStorageLike | undefined = g?.localStorage;
    if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') {
      return {
        async getItem(key: string) {
          try { const v = ls.getItem(key); return v === null ? null : v; } catch { return null; }
        },
        async setItem(key: string, value: string) {
          try { ls.setItem(key, value); } catch { /* noop */ }
        }
      };
    }
  } catch { /* SSR 等 */ }
  return null;
})();

// ------------ React Native AsyncStorage ラッパ ------------
async function detectAsyncStorage(): Promise<KVStore | null> {
  try {
    // 動的 import（存在しない環境でも例外を握りつぶす）
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const mod: any = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AS = mod?.default;
    if (AS && typeof AS.getItem === 'function' && typeof AS.setItem === 'function') {
      const RN: KVStore = {
        async getItem(k: string) {
          try { return await AS.getItem(k); } catch { return null; }
        },
        async setItem(k: string, v: string) {
          try { await AS.setItem(k, v); } catch { /* noop */ }
        }
      };
      return RN;
    }
  } catch { /* noop */ }
  return null;
}

// ------------ 実ストアの選択（優先順：RN -> Web -> メモリ） ------------
let __resolvedStore: KVStore | null = null;
async function getStore(): Promise<KVStore> {
  if (__resolvedStore) return __resolvedStore;

  const rn = await detectAsyncStorage();
  if (rn) return (__resolvedStore = rn);

  if (WebLocalStorage) return (__resolvedStore = WebLocalStorage);

  return (__resolvedStore = MemoryStore);
}

// =======================================================
// Public API
// =======================================================

export async function loadLocalStore(): Promise<any> {
  const store = await getStore();
  try {
    const raw = await store.getItem(STORE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    __memStoreObj = obj; // メモリも同期
    return obj;
  } catch {
    return {};
  }
}

export async function saveLocalStore(obj: any): Promise<void> {
  const store = await getStore();
  try {
    __memStoreObj = { ...(obj || {}) };
    await store.setItem(STORE_KEY, JSON.stringify(__memStoreObj));
  } catch {
    // 失敗しても落とさない
  }
}

export async function appendOps(ops: any[]): Promise<void> {
  if (!Array.isArray(ops) || ops.length === 0) return;
  const lines =
    ops.map((o) => {
      try { return JSON.stringify(o); } catch { return '{}'; }
    }).join('\n') + '\n';

  __memOpsNdjson += lines;

  const store = await getStore();
  try {
    const prev = (await store.getItem(OPS_KEY)) ?? '';
    await store.setItem(OPS_KEY, prev + lines);
  } catch {
    // 失敗してもアプリは止めない
  }
}
