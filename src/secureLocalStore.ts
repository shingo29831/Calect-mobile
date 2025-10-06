// src/secureLocalStore.ts
import RNFS from 'react-native-fs';
import * as Keychain from 'react-native-keychain';
import Sodium from 'react-native-libsodium';
import { Platform } from 'react-native';

/**
 * 保存先・バックアップ
 */
const FILE = `${RNFS.DocumentDirectoryPath}/events.json.enc`;
const BAK1 = `${FILE}.bak1`;
const BAK2 = `${FILE}.bak2`;
const TMP  = `${FILE}.tmp`;

/**
 * Keychain / Keystore のサービス名
 */
const KC_SERVICE = 'local-json-aead-key'; // 共通名

/**
 * libsodium Base64 バリアント
 */
const B64V = Sodium.base64_variants.ORIGINAL;

/**
 * 同期ハッシュの仕様
 * - アルゴリズム: BLAKE2b-256 (libsodium crypto_generichash)
 * - エンコード: Base64（libsodium）
 * - 表記: "b2:BASE64"
 */
export const HASH_ALGO = 'b2'; // tag
const HASH_TAG = `${HASH_ALGO}:`;

/* -------------------------------------------------------------
 * iOS のファイル属性 (任意・実装済みなら適用)
 * ----------------------------------------------------------- */
async function applyIosFileAttributes(path: string) {
  if (Platform.OS !== 'ios') return;
  try {
    // ネイティブラッパがある場合のみ適用。なければスキップでOK（AEADで保護済み）
    // await NativeFileAttr.setFileProtection(path, 'NSFileProtectionCompleteUntilFirstUserAuthentication');
    // await NativeFileAttr.excludeFromBackup(path, true);
  } catch {}
}

/* -------------------------------------------------------------
 * Key 取得/生成 (AEAD用)
 * ----------------------------------------------------------- */
async function getOrCreateKey(): Promise<Uint8Array> {
  await Sodium.ready;
  const existing = await Keychain.getGenericPassword({ service: KC_SERVICE });
  if (existing) {
    return Sodium.from_base64(existing.password, B64V);
  }
  const key = Sodium.randombytes_buf(Sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
  const b64 = Sodium.to_base64(key, B64V);

  // SECURE_HARDWARE が無い端末・エミュ用にフォールバック
  try {
    await Keychain.setGenericPassword('k', b64, {
      service: KC_SERVICE,
      accessible: Platform.OS === 'ios'
        ? Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
        : undefined,
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE, // 可能なら StrongBox/Enclave
    });
  } catch {
    await Keychain.setGenericPassword('k', b64, {
      service: KC_SERVICE,
      accessible: Platform.OS === 'ios'
        ? Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
        : undefined,
      securityLevel: Keychain.SECURITY_LEVEL.ANY,
    });
  }
  return key;
}

/* -------------------------------------------------------------
 * ユーティリティ（RNで安全な文字列⇄Uint8/BASE64）
 * ----------------------------------------------------------- */
function toUint8(input: string) { return Sodium.from_string(input); }
function fromUint8(input: Uint8Array) { return Sodium.to_string(input); }

/**
 * JSON を **安定化**して文字列化（キーをソート）
 * - ハッシュ一貫性のために必須
 */
function canonicalStringify(value: any): string {
  return JSON.stringify(value, replacer);
  function replacer(_key: string, v: any): any {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) sorted[k] = v[k];
      return sorted;
    }
    return v;
  }
}

/**
 * BLAKE2b-256 (libsodium generichash) で Base64 ハッシュを返す
 * 結果は "b2:BASE64" 形式
 */
export async function computeDataHash(obj: any): Promise<string> {
  await Sodium.ready;
  const canonical = canonicalStringify(obj);
  const digest = Sodium.crypto_generichash(32, toUint8(canonical)); // 32 bytes (256-bit)
  const b64 = Sodium.to_base64(digest, B64V);
  return `${HASH_TAG}${b64}`;
}

function normalizeHash(h?: string | null): string {
  if (!h) return '';
  return h.trim();
}

/* -------------------------------------------------------------
 * AEAD: XChaCha20-Poly1305-ietf
 * 保存形式: (nonce || ciphertext)
 * ----------------------------------------------------------- */
async function sealJson(obj: any, aad: string): Promise<Uint8Array> {
  await Sodium.ready;
  const key = await getOrCreateKey();
  const nonce = Sodium.randombytes_buf(Sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const plaintext = toUint8(JSON.stringify(obj));
  const ciphertext = Sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext, toUint8(aad), null, nonce, key
  );
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

async function openJson(buf: Uint8Array, aad: string): Promise<any> {
  await Sodium.ready;
  const key = await getOrCreateKey();
  const nlen = Sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  const nonce = buf.slice(0, nlen);
  const ct = buf.slice(nlen);
  const dec = Sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, ct, toUint8(aad), nonce, key
  );
  return JSON.parse(fromUint8(dec));
}

/* -------------------------------------------------------------
 * アトミック書き込み + 多世代バックアップ
 * ----------------------------------------------------------- */
async function atomicWriteWithBackups(target: string, dataBase64: string) {
  // rotate backups: bak2 <- bak1 <- file
  try {
    const exists1 = await RNFS.exists(BAK1);
    if (exists1) await RNFS.moveFile(BAK1, BAK2);
    const exists0 = await RNFS.exists(target);
    if (exists0) await RNFS.moveFile(target, BAK1);
  } catch {}

  await RNFS.writeFile(TMP, dataBase64, 'base64');
  await RNFS.moveFile(TMP, target);
  await applyIosFileAttributes(target); // iOS: 任意
}

/* -------------------------------------------------------------
 * 公開 API: 保存/読取
 * ----------------------------------------------------------- */
function makeAAD(opts?: { userId?: string; schema?: number }) {
  return JSON.stringify({
    app: 'Calect',
    schema: opts?.schema ?? 1,
    user: opts?.userId ?? 'local',
  });
}

/**
 * 保存：成功時に「計算済みハッシュ」を返す
 */
export async function saveEventsJson(
  events: any,
  opts?: { userId?: string; schema?: number }
): Promise<{ hash: string }> {
  const aad = makeAAD(opts);
  const sealed = await sealJson(events, aad);
  const base64 = Sodium.to_base64(sealed, B64V);
  await atomicWriteWithBackups(FILE, base64);
  const hash = await computeDataHash(events);
  return { hash };
}

/**
 * 読み込み：本体→bak1→bak2 の順で復旧
 * 復号に失敗した場合は null を返す（=改ざん/別ユーザ/別スキーマ）
 */
export async function loadEventsJson(
  opts?: { userId?: string; schema?: number }
): Promise<{ data: any | null; source: 'main' | 'bak1' | 'bak2' | 'empty' }> {
  const aad = makeAAD(opts);

  async function tryOpen(path: string): Promise<any | null> {
    const exists = await RNFS.exists(path);
    if (!exists) return null;
    const b64 = await RNFS.readFile(path, 'base64');
    const buf = Sodium.from_base64(b64, B64V);
    try { return await openJson(buf, aad); }
    catch { return null; }
  }

  const main = await tryOpen(FILE);
  if (main) return { data: main, source: 'main' };

  const b1 = await tryOpen(BAK1);
  if (b1) { await saveEventsJson(b1, opts); return { data: b1, source: 'bak1' }; }

  const b2 = await tryOpen(BAK2);
  if (b2) { await saveEventsJson(b2, opts); return { data: b2, source: 'bak2' }; }

  return { data: null, source: 'empty' };
}

/* -------------------------------------------------------------
 * 公開 API: 同期関連ユーティリティ
 * ----------------------------------------------------------- */

/**
 * ローカルの「正当な」データとハッシュを取得
 * - 復号に成功した場合のみ { ok: true, data, hash } を返す
 * - 失敗/空の場合は { ok: false }
 */
export async function getLocalDataAndHashForSync(
  opts?: { userId?: string; schema?: number }
): Promise<{ ok: true; data: any; hash: string } | { ok: false }> {
  const res = await loadEventsJson(opts);
  if (!res.data) return { ok: false };
  const hash = await computeDataHash(res.data);
  return { ok: true, data: res.data, hash };
}

/**
 * サーバ保存のハッシュ（serverHash）とローカルの正当データのハッシュを比較し、
 * 同期が「必要かどうか」を判定。
 *
 * 仕様:
 * - ローカルが正当データを持たない → **true**（サーバからの取得が必要）
 * - serverHash が空でローカルが正当 → **true**（サーバに初回アップロードが必要）
 * - 両者が存在し、ハッシュ一致 → **false**（同期不要）
 * - 両者が存在し、ハッシュ不一致 → **true**（同期必要）
 */
export async function needsSyncWithServer(
  serverHash?: string | null,
  opts?: { userId?: string; schema?: number }
): Promise<boolean> {
  const normalized = normalizeHash(serverHash);
  const local = await getLocalDataAndHashForSync(opts);

  // ローカルが正当データを持たない
  if (!local.ok) {
    // サーバにもデータがなければ同期不要、あれば取得が必要
    return normalized !== '';
  }

  // サーバが未保持（空）なら、ローカルを上げる必要がある
  if (normalized === '') return true;

  // 両者あり → 比較
  return local.hash !== normalized;
}

/**
 * （任意）ローカルの正当データをサーバへ送る前提チェック
 * - 復号成功データのみ受け入れる「送信側の受け入れ条件」を満たしているかを返す
 */
export async function canUploadToServer(
  opts?: { userId?: string; schema?: number }
): Promise<boolean> {
  const local = await getLocalDataAndHashForSync(opts);
  return local.ok; // 復号成功＝正当データのみ true
}
