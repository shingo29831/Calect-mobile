// src/lib/secure/masterkey.ts
import { NativeModules } from 'react-native';

// 必要なら安全な乱数の Polyfill を読み込む（未導入でも動作はするが、
// secure RNG が無い環境では例外を投げます）
try {
  // npm i react-native-get-random-values
  require('react-native-get-random-values');
} catch { /* noop */ }

// NativeModules の型（あなたの iOS/Android 実装に合わせて Base64 を受け渡し）
type SecureStoreNative = {
  setItem(service: string, account: string, valueB64: string): Promise<void>;
  getItem(service: string, account: string): Promise<string | null>;
  deleteItem(service: string, account: string): Promise<void>;
};
const { SecureStore } = NativeModules as { SecureStore: SecureStoreNative };

const SERVICE = 'calect.masterKey.v1';
const ACCOUNT = 'default';

// ---- Base64 ユーティリティ（base-64 パッケージを使用） ----
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

// ---- 32byte のランダム鍵を生成（secure RNG 必須）----
function randomBytes(len: number): Uint8Array {
  const g: any = globalThis as any;
  if (g?.crypto?.getRandomValues) {
    const a = new Uint8Array(len);
    g.crypto.getRandomValues(a);
    return a;
  }
  // secure RNG が無い環境は拒否（Math.random は使わない）
  throw new Error(
    'Secure RNG unavailable. Install "react-native-get-random-values" and import it at app entry.'
  );
}

/** 既存のマスターキーを取得。無ければ 32byte を生成して保存（Base64） */
export async function loadOrCreateMasterKey(): Promise<Uint8Array> {
  const existingB64 = await SecureStore.getItem(SERVICE, ACCOUNT);
  if (existingB64) return fromB64(existingB64);

  const key = randomBytes(32); // AES-256 等に使える長さ
  await SecureStore.setItem(SERVICE, ACCOUNT, toB64(key));
  return key;
}

/** 明示的にローテーションしたい場合 */
export async function rotateMasterKey(): Promise<Uint8Array> {
  const key = randomBytes(32);
  await SecureStore.setItem(SERVICE, ACCOUNT, toB64(key));
  return key;
}
