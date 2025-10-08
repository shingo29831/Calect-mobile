// src/store/localFile.ts
import RNFS from 'react-native-fs';
import {
  ensureDirs,
  readJson,
  writeJson,
  SERVER_DATASET_PATH,
  CLIENT_PREFS_PATH,
  paths,
} from './filePaths';
import type { ServerDataset, ClientPrefs } from './localTypes';

/**
 * ローカルストレージ初期化
 * - ディレクトリ作成のみ（ファイルは存在しなければ null 扱い）
 */
export async function initLocalStorage(): Promise<void> {
  await ensureDirs();
}

/** =======================
 * ServerDataset（サーバ同期用）
 * ======================= */
export async function loadServerDataset(): Promise<ServerDataset | null> {
  await ensureDirs();
  return await readJson<ServerDataset>(SERVER_DATASET_PATH);
}

export async function saveServerDataset(
  data: ServerDataset,
  options?: { pretty?: boolean }
): Promise<void> {
  await ensureDirs();
  await writeJson<ServerDataset>(SERVER_DATASET_PATH, data, options?.pretty ?? true);
}

/**
 * ServerDataset を読み込み → 変更 → 保存のユーティリティ
 * - 既存ファイルがなければ null を渡すので、コールバックで初期化してください
 */
export async function updateServerDataset(
  mutator: (current: ServerDataset | null) => ServerDataset
): Promise<ServerDataset> {
  await ensureDirs();
  const current = await loadServerDataset();
  const next = mutator(current);
  await saveServerDataset(next);
  return next;
}

/** =======================
 * ClientPrefs（端末固有設定）
 * ======================= */
export async function loadClientPrefs(): Promise<ClientPrefs | null> {
  await ensureDirs();
  return await readJson<ClientPrefs>(CLIENT_PREFS_PATH);
}

export async function saveClientPrefs(
  prefs: ClientPrefs,
  options?: { pretty?: boolean }
): Promise<void> {
  await ensureDirs();
  await writeJson<ClientPrefs>(CLIENT_PREFS_PATH, prefs, options?.pretty ?? true);
}

/**
 * ClientPrefs を読み込み → 変更 → 保存
 * - 既存ファイルがなければ null を渡すので、コールバックで初期化してください
 */
export async function updateClientPrefs(
  mutator: (current: ClientPrefs | null) => ClientPrefs
): Promise<ClientPrefs> {
  await ensureDirs();
  const current = await loadClientPrefs();
  const next = mutator(current);
  await saveClientPrefs(next);
  return next;
}

/** =======================
 * 便利関数
 * ======================= */

/** ファイルが存在するか */
export async function exists(path: string): Promise<boolean> {
  try {
    return await RNFS.exists(path);
  } catch {
    return false;
  }
}

/** 保存先パスの参照（デバッグ・テスト用） */
export const LocalPaths = {
  root: paths.root,
  server: paths.server,
  client: paths.client,
};
