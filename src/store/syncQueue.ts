// src/store/syncQueue.ts
import RNFS from "react-native-fs";

/**
 * 新パスに統一:
 * - キュー本体  : /files/calect/queue/events.queue.jsonl
 * - 一時ファイル: /cache/calect/_tmp/events.queue.jsonl.tmp
 */
const QUEUE_FILE = `${RNFS.DocumentDirectoryPath}/calect/queue/events.queue.jsonl`; // 1行=1JSON (NDJSON)
const QUEUE_TMP  = `${RNFS.CachesDirectoryPath}/calect/_tmp/events.queue.jsonl.tmp`;

type QueueItem =
  | { type: "upsert"; payload: any; ts: string }
  | { type: "delete"; event_id: string; ts: string };

/**
 * 末尾に1行追記（安全のため tmp に書いてから move）
 */
export async function appendQueue(item: QueueItem) {
  const line = JSON.stringify(item) + "\n";
  await ensureParent();

  const exists = await RNFS.exists(QUEUE_FILE);
  if (!exists) {
    // 初回はそのまま書き込み
    await RNFS.writeFile(QUEUE_FILE, line, "utf8");
    return;
  }

  // 既存内容 + 新規行 を tmp に書いて置換
  const current = await RNFS.readFile(QUEUE_FILE, "utf8");
  await RNFS.writeFile(QUEUE_TMP, current + line, "utf8");
  await RNFS.moveFile(QUEUE_TMP, QUEUE_FILE);
}

/**
 * 全件読み取り
 */
export async function readQueue(): Promise<QueueItem[]> {
  const ok = await RNFS.exists(QUEUE_FILE);
  if (!ok) return [];
  const txt = await RNFS.readFile(QUEUE_FILE, "utf8");
  return txt
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as QueueItem);
}

/**
 * クリア（ファイル削除）
 */
export async function clearQueue() {
  if (await RNFS.exists(QUEUE_FILE)) {
    await RNFS.unlink(QUEUE_FILE);
  }
}

/**
 * 親ディレクトリ作成（新パスのみ）
 */
async function ensureParent() {
  const dir = `${RNFS.DocumentDirectoryPath}/calect/queue`;
  const tmp = `${RNFS.CachesDirectoryPath}/calect/_tmp`;
  if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
  if (!(await RNFS.exists(tmp))) await RNFS.mkdir(tmp);
}
