// src/dev/resetLocal.ts
import RNFS from "react-native-fs";
import dayjs from "../lib/dayjs";
import { __clearAllInstancesForTest } from "../store/db";
import { clearQueue } from "../store/syncQueue";

const D = RNFS.DocumentDirectoryPath;
const SNAPSHOT = `${D}/calect/snapshot.json`;
const MONTHS_DIR = `${D}/calect/months`;
const OPS_LOG = `${D}/calect/ops.ndjson`;

/** emptyStore 相当（起動時の読み込みで壊れない最小形） */
const EMPTY_SNAPSHOT = {
  version: 1,
  lastSyncAt: null as string | null,
  lastSyncCursor: null as string | null,
  calendars: [] as any[],
  instances: [] as any[],
  tombstones: { calendars: [] as string[], instances: [] as (string|number)[] },
  tags: [] as string[],
  _tags: [] as string[], // 互換
};

async function ensureDirs() {
  // /files/calect と /files/calect/months を必ず作る
  const calectDir = `${D}/calect`;
  if (!(await RNFS.exists(calectDir))) await RNFS.mkdir(calectDir);
  if (!(await RNFS.exists(MONTHS_DIR))) await RNFS.mkdir(MONTHS_DIR);
}

/**
 * ローカルデータの初期化
 *
 * @param opts.wipeSnapshot trueなら snapshot.json を空テンプレで上書き
 * @param opts.wipeMonths   trueなら /files/calect/months/*.json を削除
 * @param opts.wipeOps      trueなら /files/calect/ops.ndjson を削除
 * @param opts.wipeQueue    trueなら queue をクリア（events.queue.jsonl）
 */
export async function resetLocalData(opts?: {
  wipeSnapshot?: boolean;
  wipeMonths?: boolean;
  wipeOps?: boolean;
  wipeQueue?: boolean;
}) {
  const { wipeSnapshot = true, wipeMonths = false, wipeOps = false, wipeQueue = false } = opts ?? {};

  // 1) In-memory を空に（UI即反映）
  __clearAllInstancesForTest();

  // 2) ディレクトリ確保
  await ensureDirs();

  // 3) snapshot.json 初期化（デフォルト：空テンプレで上書き）
  if (wipeSnapshot) {
    const body = { ...EMPTY_SNAPSHOT, lastSyncAt: dayjs().toISOString() };
    await RNFS.writeFile(SNAPSHOT, JSON.stringify(body), "utf8");
  }

  // 4) 月ファイルを全削除（任意）
  if (wipeMonths) {
    try {
      const entries = await RNFS.readDir(MONTHS_DIR);
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith(".json")) {
          await RNFS.unlink(e.path);
        }
      }
    } catch (e) {
      if (__DEV__) console.warn("[resetLocalData] wipeMonths failed:", e);
    }
  }

  // 5) ops.ndjson 削除（任意）
  if (wipeOps && (await RNFS.exists(OPS_LOG))) {
    await RNFS.unlink(OPS_LOG);
  }

  // 6) 同期キュー削除（任意）
  if (wipeQueue) {
    try {
      await clearQueue();
    } catch (e) {
      if (__DEV__) console.warn("[resetLocalData] clearQueue failed:", e);
    }
  }

  return { ok: true };
}
