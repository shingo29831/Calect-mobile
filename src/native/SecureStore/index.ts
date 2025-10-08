// 共通エントリ。旧アーキ/新アーキ両対応の薄いラッパ
import { NativeModules, Platform } from 'react-native';

type SaveResult = { ok: true } | { ok: false; error: string };

export type SecureStoreModule = {
  saveEncrypted(name: string, dataUtf8: string): Promise<SaveResult>;
  loadEncrypted(name: string): Promise<{ ok: true; dataUtf8: string } | { ok: false }>;
  delete(name: string): Promise<SaveResult>;
};

const legacy = NativeModules.SecureStore as SecureStoreModule | undefined;

// TurboModule 化している場合はこちらに差し替え:
// import { TurboModuleRegistry } from 'react-native';
// const turbo = TurboModuleRegistry.getEnforcing<SecureStoreModule>('SecureStore');

export const SecureStore: SecureStoreModule = {
  async saveEncrypted(name, dataUtf8) {
    if (!legacy) return { ok: false, error: 'Native module not linked' };
    return legacy.saveEncrypted(name, dataUtf8);
  },
  async loadEncrypted(name) {
    if (!legacy) return { ok: false };
    return legacy.loadEncrypted(name);
  },
  async delete(name) {
    if (!legacy) return { ok: false, error: 'Native module not linked' };
    return legacy.delete(name);
  },
};

// ユーティリティ：JSON 直列化
export async function saveJson(name: string, obj: any) {
  const s = JSON.stringify(obj);
  const r = await SecureStore.saveEncrypted(name, s);
  if (!r.ok) throw new Error(r.error);
}
export async function loadJson<T = any>(name: string): Promise<T | null> {
  const r = await SecureStore.loadEncrypted(name);
  if (!r.ok) return null;
  return JSON.parse(r.dataUtf8) as T;
}
export async function remove(name: string) {
  await SecureStore.delete(name);
}
