// src/store/filePaths.ts
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

// ルートディレクトリ（アプリ専用のドキュメント領域）
export const ROOT_DIR =
  Platform.OS === 'ios'
    ? `${RNFS.DocumentDirectoryPath}/calect`
    : `${RNFS.DocumentDirectoryPath}/calect`;

export const SNAPSHOT_PATH = `${ROOT_DIR}/snapshot.json`; // 互換: フルスナップショット
export const OPS_LOG_PATH  = `${ROOT_DIR}/ops.ndjson`;     // 差分：追記ログ（NDJSON）
export const MONTHS_DIR    = `${ROOT_DIR}/months`;         // 月ごと分割

export const TMP_DIR       = `${ROOT_DIR}/_tmp`;

export async function ensureDirs() {
  for (const p of [ROOT_DIR, MONTHS_DIR, TMP_DIR]) {
    const exists = await RNFS.exists(p);
    if (!exists) await RNFS.mkdir(p);
  }
}

// YYYY-MM をファイルに
export function monthFile(yyyyMM: string) {
  return `${MONTHS_DIR}/${yyyyMM}.json`;
}

// 一時ファイル（原子的上書き用）
export function tmpFile(name: string) {
  return `${TMP_DIR}/${name}.${Date.now()}.tmp`;
}

// 安全な書き換え（temp → move）
export async function atomicWrite(path: string, data: string) {
  const t = tmpFile(path.split('/').pop() || 'file');
  await RNFS.writeFile(t, data, 'utf8');
  await RNFS.moveFile(t, path);
}
