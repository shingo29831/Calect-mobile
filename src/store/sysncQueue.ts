// src/store/syncQueue.ts
import RNFS from 'react-native-fs';

const QUEUE_FILE = `${RNFS.DocumentDirectoryPath}/appdata/events.queue.jsonl`; // 1行1イベントのNDJSON
const QUEUE_TMP  = `${RNFS.CachesDirectoryPath}/appdata/tmp/events.queue.jsonl.tmp`;

type QueueItem =
  | { type: 'upsert'; payload: any; ts: string }
  | { type: 'delete'; event_id: string; ts: string };

export async function appendQueue(item: QueueItem) {
  const line = JSON.stringify(item) + '\n';
  await ensureParent();
  // 追記（アトミック度を上げたいなら tmp→concat→move）
  const exists = await RNFS.exists(QUEUE_FILE);
  if (!exists) {
    await RNFS.writeFile(QUEUE_FILE, line, 'utf8');
  } else {
    const current = await RNFS.readFile(QUEUE_FILE, 'utf8');
    await RNFS.writeFile(QUEUE_TMP, current + line, 'utf8');
    await RNFS.moveFile(QUEUE_TMP, QUEUE_FILE);
  }
}

export async function readQueue(): Promise<QueueItem[]> {
  const ok = await RNFS.exists(QUEUE_FILE);
  if (!ok) return [];
  const txt = await RNFS.readFile(QUEUE_FILE, 'utf8');
  return txt
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as QueueItem);
}

export async function clearQueue() {
  if (await RNFS.exists(QUEUE_FILE)) {
    await RNFS.unlink(QUEUE_FILE);
  }
}

async function ensureParent() {
  const dir = `${RNFS.DocumentDirectoryPath}/appdata`;
  const tmp = `${RNFS.CachesDirectoryPath}/appdata/tmp`;
  if (!(await RNFS.exists(dir))) await RNFS.mkdir(dir);
  if (!(await RNFS.exists(tmp))) await RNFS.mkdir(tmp);
}
