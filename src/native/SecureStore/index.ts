// 蜈ｱ騾壹お繝ｳ繝医Μ縲よ立繧｢繝ｼ繧ｭ/譁ｰ繧｢繝ｼ繧ｭ荳｡蟇ｾ蠢懊・阮・＞繝ｩ繝・ヱ
import { NativeModules, Platform } from 'react-native';

type SaveResult = { ok: true } | { ok: false; error: string };

export type SecureStoreModule = {
  saveEncrypted(name: string, dataUtf8: string): Promise<SaveResult>;
  loadEncrypted(name: string): Promise<{ ok: true; dataUtf8: string } | { ok: false }>;
  delete(name: string): Promise<SaveResult>;
};

const legacy = NativeModules.SecureStore as SecureStoreModule | undefined;

// TurboModule 蛹悶＠縺ｦ縺・ｋ蝣ｴ蜷医・縺薙■繧峨↓蟾ｮ縺玲崛縺・
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

// 繝ｦ繝ｼ繝・ぅ繝ｪ繝・ぅ・哽SON 逶ｴ蛻怜喧
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
