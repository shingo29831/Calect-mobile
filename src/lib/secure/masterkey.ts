// src/lib/secure/masterkey.ts
import { NativeModules } from 'react-native';

// 蠢・ｦ√↑繧牙ｮ牙・縺ｪ荵ｱ謨ｰ縺ｮ Polyfill 繧定ｪｭ縺ｿ霎ｼ繧・域悴蟆主・縺ｧ繧ょ虚菴懊・縺吶ｋ縺後・
// secure RNG 縺檎┌縺・腸蠅・〒縺ｯ萓句､悶ｒ謚輔￡縺ｾ縺呻ｼ・
try {
  // npm i react-native-get-random-values
  require('react-native-get-random-values');
} catch { /* noop */ }

// NativeModules 縺ｮ蝙具ｼ医≠縺ｪ縺溘・ iOS/Android 螳溯｣・↓蜷医ｏ縺帙※ Base64 繧貞女縺第ｸ｡縺暦ｼ・
type SecureStoreNative = {
  setItem(service: string, account: string, valueB64: string): Promise<void>;
  getItem(service: string, account: string): Promise<string | null>;
  deleteItem(service: string, account: string): Promise<void>;
};
const { SecureStore } = NativeModules as { SecureStore: SecureStoreNative };

const SERVICE = 'calect.masterKey.v1';
const ACCOUNT = 'default';

// ---- Base64 繝ｦ繝ｼ繝・ぅ繝ｪ繝・ぅ・・ase-64 繝代ャ繧ｱ繝ｼ繧ｸ繧剃ｽｿ逕ｨ・・----
function toB64(u8: Uint8Array): string {
  const { encode } = require('base-64');
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return encode(s);
}
function fromB64(b64: string): Uint8Array {
  const { decode } = require('base-64');
  const s = decode(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---- 32byte 縺ｮ繝ｩ繝ｳ繝繝骰ｵ繧堤函謌撰ｼ・ecure RNG 蠢・茨ｼ・---
function randomBytes(len: number): Uint8Array {
  const g: any = globalThis as any;
  if (g?.crypto?.getRandomValues) {
    const a = new Uint8Array(len);
    g.crypto.getRandomValues(a);
    return a;
  }
  // secure RNG 縺檎┌縺・腸蠅・・諡貞凄・・ath.random 縺ｯ菴ｿ繧上↑縺・ｼ・
  throw new Error(
    'Secure RNG unavailable. Install "react-native-get-random-values" and import it at app entry.'
  );
}

/** 譌｢蟄倥・繝槭せ繧ｿ繝ｼ繧ｭ繝ｼ繧貞叙蠕励ら┌縺代ｌ縺ｰ 32byte 繧堤函謌舌＠縺ｦ菫晏ｭ假ｼ・ase64・・*/
export async function loadOrCreateMasterKey(): Promise<Uint8Array> {
  const existingB64 = await SecureStore.getItem(SERVICE, ACCOUNT);
  if (existingB64) return fromB64(existingB64);

  const key = randomBytes(32); // AES-256 遲峨↓菴ｿ縺医ｋ髟ｷ縺・
  await SecureStore.setItem(SERVICE, ACCOUNT, toB64(key));
  return key;
}

/** 譏守､ｺ逧・↓繝ｭ繝ｼ繝・・繧ｷ繝ｧ繝ｳ縺励◆縺・ｴ蜷・*/
export async function rotateMasterKey(): Promise<Uint8Array> {
  const key = randomBytes(32);
  await SecureStore.setItem(SERVICE, ACCOUNT, toB64(key));
  return key;
}
