// src/store/syncQueue.ts
import RNFS from "react-native-fs";

/**
 * 新パスに統一:
 * - キュー本体  : /files/calect/queue/events.queue.jsonl
 * - 一時ファイル: /cache/calect/_tmp/events.queue.jsonl.tmp
 */
const QUEUE_FILE = `${RNFS.DocumentDirectoryPath}/calect/queue/events.queue.jsonl`; // 1行=1JSON (NDJSON)
const QUEUE_TMP  = `${RNFS.CachesDirectoryPath}/calect/_tmp/events.queue.jsonl.tmp`;

/** === キュー要素の型（cid_ulid対応） === */
export type QueueItemUpsert = {
  type: "upsert";
  /** payload 内に少なくとも { kind: "event", cid_ulid?: string, ... } を入れてください */
  payload: any;
  ts: string; // ISO8601
};

export type QueueItemDelete = {
  type: "delete";
  /** サーバ確定IDが無い場合、cid_ulid で指定可能（どちらか必須） */
  event_id?: string;
  cid_ulid?: string;
  ts: string; // ISO8601
};

export type QueueItem = QueueItemUpsert | QueueItemDelete;

/** === 内部: 末尾に1行追記（安全のため tmp に書いてから move） === */
export async function appendQueue(item: QueueItem) {
  const line = JSON.stringify(item) + "\n";
  await ensureParent();

  const exists = await RNFS.exists(QUEUE_FILE);
  if (!exists) {
    await RNFS.writeFile(QUEUE_FILE, line, "utf8");
    return;
  }

  const current = await RNFS.readFile(QUEUE_FILE, "utf8");
  await RNFS.writeFile(QUEUE_TMP, current + line, "utf8");
  await RNFS.moveFile(QUEUE_TMP, QUEUE_FILE);
}

/** === 便利ヘルパー: イベントUpsertを積む（cid_ulid対応） === */
export async function enqueueUpsertEvent(payload: any, ts = new Date().toISOString()) {
  // payload.kind や payload.cid_ulid は呼び出し側の責任で入れてください
  const item: QueueItemUpsert = { type: "upsert", payload, ts };
  await appendQueue(item);
}

/** === 便利ヘルパー: イベント削除を積む（event_id または cid_ulid） === */
export async function enqueueDeleteEvent(params: { event_id?: string; cid_ulid?: string }, ts = new Date().toISOString()) {
  const { event_id, cid_ulid } = params || {};
  if (!event_id && !cid_ulid) {
    throw new Error("enqueueDeleteEvent: event_id か cid_ulid のどちらかは必須です。");
  }
  const item: QueueItemDelete = { type: "delete", event_id, cid_ulid, ts };
  await appendQueue(item);
}

/** === 全件読み取り === */
export async function readQueue(): Promise<QueueItem[]> {
  const ok = await RNFS.exists(QUEUE_FILE);
  if (!ok) return [];
  const txt = await RNFS.readFile(QUEUE_FILE, "utf8");
  return txt
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as QueueItem);
}

/** === 件数だけ知りたい時（軽量） === */
export async function countQueueLines(): Promise<number> {
  const ok = await RNFS.exists(QUEUE_FILE);
  if (!ok) return 0;
  const txt = await RNFS.readFile(QUEUE_FILE, "utf8");
  // 最後の改行で空要素が出ないよう filter(Boolean)
  return txt.split("\n").filter(Boolean).length;
}

/** === クリア（ファイル削除） === */
export async function clearQueue() {
  if (await RNFS.exists(QUEUE_FILE)) {
    await RNFS.unlink(QUEUE_FILE);
  }
}

/** === 改行/空行の掃除（任意） === */
export async function compactQueue() {
  if (!(await RNFS.exists(QUEUE_FILE))) return;
  const items = await readQueue();
  await ensureParent();
  const txt = items.map((it) => JSON.stringify(it)).join("\n") + "\n";
  await RNFS.writeFile(QUEUE_TMP, txt, "utf8");
  await RNFS.moveFile(QUEUE_TMP, QUEUE_FILE);
}

/** === 親ディレクトリ作成（新パスのみ） === */
async function ensureParent() {
  const dir = `${RNFS.DocumentDirectoryPath}/calect/queue`;
  const tmp = `${RNFS.CachesDirectoryPath}/calect/_tmp`;
  if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
  if (!(await RNFS.exists(tmp))) await RNFS.mkdir(tmp);
}
