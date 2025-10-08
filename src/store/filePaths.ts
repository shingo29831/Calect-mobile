// src/store/filePaths.ts
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

/**
 * ディレクトリ構成（ローカル保存）
 *
 * <Documents>/calect
 * ├─ server/        … サーバ同期用データセット（ServerDataset）
 * │   └─ dataset.json
 * ├─ client/        … 端末固有の設定（ClientPrefs）
 * │   └─ prefs.json
 * ├─ _tmp/          … 原子的書き換え用の一時ファイル
 * └─ _backup/       … 任意のバックアップ置き場（必要なら利用）
 */

// ルートディレクトリ（アプリ専用のドキュメント領域）
export const ROOT_DIR =
  Platform.OS === 'ios'
    ? `${RNFS.DocumentDirectoryPath}/calect`
    : `${RNFS.DocumentDirectoryPath}/calect`;

// サブディレクトリ
export const SERVER_DIR = `${ROOT_DIR}/server`;
export const CLIENT_DIR = `${ROOT_DIR}/client`;
export const TMP_DIR    = `${ROOT_DIR}/_tmp`;
export const BACKUP_DIR = `${ROOT_DIR}/_backup`;

// ファイルパス
export const SERVER_DATASET_PATH = `${SERVER_DIR}/dataset.json`; // ServerDataset
export const CLIENT_PREFS_PATH   = `${CLIENT_DIR}/prefs.json`;   // ClientPrefs

// ---------------------------------------------
// ディレクトリ初期化
// ---------------------------------------------
export async function ensureDirs() {
  for (const p of [ROOT_DIR, SERVER_DIR, CLIENT_DIR, TMP_DIR, BACKUP_DIR]) {
    const exists = await RNFS.exists(p);
    if (!exists) await RNFS.mkdir(p);
  }
}

// ---------------------------------------------
// 一時ファイルユーティリティ
// ---------------------------------------------
export function tmpFile(name: string) {
  const base = name.replace(/[\\/]/g, '_') || 'file';
  return `${TMP_DIR}/${base}.${Date.now()}.tmp`;
}

/**
 * 原子的書き換え（write → move）
 * - 一時ファイルに書いてから、目的パスへ move します
 */
export async function atomicWrite(path: string, data: string) {
  const t = tmpFile(path.split('/').pop() || 'file');
  await RNFS.writeFile(t, data, 'utf8');
  await RNFS.moveFile(t, path);
}

// ---------------------------------------------
// JSON ヘルパ
// ---------------------------------------------
export async function readJson<T>(path: string): Promise<T | null> {
  try {
    const exists = await RNFS.exists(path);
    if (!exists) return null;
    const text = await RNFS.readFile(path, 'utf8');
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function writeJson<T>(
  path: string,
  obj: T,
  pretty: boolean = true
): Promise<void> {
  const text = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
  await atomicWrite(path, text);
}

// ---------------------------------------------
// 便利エイリアス
// ---------------------------------------------
export const paths = {
  root: ROOT_DIR,
  server: {
    dir: SERVER_DIR,
    dataset: SERVER_DATASET_PATH,
  },
  client: {
    dir: CLIENT_DIR,
    prefs: CLIENT_PREFS_PATH,
  },
  tmp: TMP_DIR,
  backup: BACKUP_DIR,
};
