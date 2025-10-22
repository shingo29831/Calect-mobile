// src/data/persistence/localStore.ts
// v2 スナップショット（server.v2.json）とローカル全初期化ユーティリティ
// - resetLocalData: months/*, ops/*, queue/* と旧スナップショット類を安全に初期化
// - writeSnapshotV2 / readSnapshotV2: サーバー由来の v2 JSON を保存/読込

import {
  writeFile,
  readFile,
  // 以下は localFile 側にあれば使い、無ければ try-catch でフォールバックします
  // 型エラーを避けるため any で受けつつ、存在チェックしてから使用します。
  // @ts-ignore
  removeFile as _removeFile,
  // @ts-ignore
  removeDir as _removeDir,
  // @ts-ignore
  listFiles as _listFiles,
  // @ts-ignore
  ensureDir as _ensureDir,
  // @ts-ignore
  exists as _exists,
} from '../../store/localFile';
import { ServerDocV2 } from './schemas';

const SNAPSHOT_PATH = 'snapshot/server.v2.json';

// 可能なら使う（無ければ undefined のまま）
const removeFile: undefined | ((p: string) => Promise<void>) = _removeFile;
const removeDir:  undefined | ((p: string) => Promise<void>) = _removeDir;
const listFiles:  undefined | ((prefix: string) => Promise<string[]>) = _listFiles;
const ensureDir:  undefined | ((p: string) => Promise<void>) = _ensureDir;
const exists:     undefined | ((p: string) => Promise<boolean>) = _exists;

/** ユーティリティ：ファイルを空に truncate（無ければ作成） */
async function truncateFile(path: string) {
  await writeFile(path, '');
}

/** ユーティリティ：JSON を安全に書き出し（フォルダ未作成でも可能なら作る） */
async function writeJson(path: string, obj: any) {
  try {
    await writeFile(path, JSON.stringify(obj));
  } catch (e) {
    // 親ディレクトリが無ければ作成を試みる
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (dir && ensureDir) {
      try {
        await ensureDir(dir);
        await writeFile(path, JSON.stringify(obj));
        return;
      } catch {}
    }
    throw e;
  }
}

/** ユーティリティ：ディレクトリ配下をクリア（API があれば使い、無ければ個別削除 or 既知ファイルを truncate） */
async function clearDir(dir: string, knownFilesToTruncate: string[] = []) {
  // 1) removeDir があればフォルダ丸ごと削除
  if (removeDir) {
    try {
      await removeDir(dir);
      // 可能なら空フォルダを再生成（無ければスキップ）
      if (ensureDir) await ensureDir(dir);
      return;
    } catch { /* fallback へ */ }
  }

  // 2) listFiles + removeFile で個別削除
  if (listFiles && removeFile) {
    try {
      const files = await listFiles(`${dir}/`);
      for (const f of files) {
        try { await removeFile(f); } catch {}
      }
      return;
    } catch { /* fallback へ */ }
  }

  // 3) 既知ファイルだけでも空に
  for (const f of knownFilesToTruncate) {
    try { await truncateFile(f); } catch {}
  }
}

/** 旧スナップショットの初期化（存在すれば空配列などに） */
async function clearLegacySnapshots() {
  // 旧ローカル UI 用スナップショット
  const SNAP_INSTANCES = 'snapshot/instances.v1.json';
  const payload = { instances: [] as any[], tags: [] as string[], _tags: [] as string[] };
  try {
    await writeJson(SNAP_INSTANCES, payload);
  } catch {}
}

/** ローカル全初期化：months/*, queue/*, ops/* をクリアし、旧スナップショットも初期化 */
export async function resetLocalData() {
  // months ディレクトリ：v2 月シャード
  await clearDir('months');

  // queue ディレクトリ（存在する場合）
  await clearDir('queue', [
    'queue/push.ndjson',
    'queue/pull.ndjson',
  ]);

  // ops ディレクトリ（旧ローカル操作ログ）
  await clearDir('ops', [
    'ops/instances.ndjson',
    'ops/events.ndjson',
  ]);

  // 旧ローカルスナップショットも初期化（UI の一時表示整合のため）
  await clearLegacySnapshots();

  // server.v2.json 自体は残す（完全オフライン時の UI 参照用）
  // ※完全リセットしたい場合は以下のコメントアウトを外す
  // if (removeFile) { try { await removeFile(SNAPSHOT_PATH); } catch {} }
}

/** v2 サーバースナップショットを書き出し */
export async function writeSnapshotV2(doc: ServerDocV2) {
  if (!doc.version) (doc as any).version = 2;
  await writeJson(SNAPSHOT_PATH, doc);
}

/** v2 サーバースナップショットを読み込み（version=2 以外は null 扱い） */
export async function readSnapshotV2(): Promise<ServerDocV2 | null> {
  const raw = await readFile(SNAPSHOT_PATH).catch(() => null);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return (obj?.version === 2) ? (obj as ServerDocV2) : null;
  } catch {
    return null;
  }
}
