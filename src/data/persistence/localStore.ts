// src/data/persistence/localStore.ts
import RNFS from "react-native-fs";
import dayjs from "../../lib/dayjs";
import type { EventInstance, Calendar } from "../../api/types";
import { ensureDirs, SNAPSHOT_PATH, OPS_LOG_PATH, monthFile, atomicWrite } from "./filePaths";
import type { LocalStoreSchema, AnyOp } from "./schemas";
import { emptyStore as EMPTY_TEMPLATE } from "./schemas";

/** ===== 安全読み込み（存在しなければ null） ===== */
async function safeRead(path: string): Promise<string | null> {
  const ok = await RNFS.exists(path);
  if (!ok) return null;
  return RNFS.readFile(path, "utf8");
}

/** ===== 1) スナップショット（アプリ全体のローカル状態） ===== */
export async function loadLocalStore(): Promise<LocalStoreSchema> {
  await ensureDirs();
  const raw = await safeRead(SNAPSHOT_PATH);
  if (!raw) return { ...EMPTY_TEMPLATE };
  try {
    return JSON.parse(raw) as LocalStoreSchema;
  } catch {
    // 壊れていたら空テンプレで復旧
    return { ...EMPTY_TEMPLATE };
  }
}

export async function saveLocalStore(store: LocalStoreSchema) {
  await ensureDirs();
  await atomicWrite(SNAPSHOT_PATH, JSON.stringify(store));
}

// emptyStore を export（他箇所で初期テンプレ参照用）
export const emptyStore: LocalStoreSchema = { ...EMPTY_TEMPLATE };

/** ===== 2) オペログ（ops.ndjson 相当） ===== */
// NDJSON を追記保存
export async function appendOps(ops: AnyOp[]) {
  if (!ops.length) return;
  await ensureDirs();
  const lines = ops.map((o) => JSON.stringify(o)).join("\n") + "\n";
  await RNFS.appendFile(OPS_LOG_PATH, lines, "utf8");
}

// 全オペ読み込み（必要あればストリーム化可）
export async function readAllOps(): Promise<AnyOp[]> {
  await ensureDirs();
  const raw = await safeRead(OPS_LOG_PATH);
  if (!raw) return [];
  const out: AnyOp[] = [];
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s));
    } catch {
      // 破損行はスキップ
    }
  }
  return out;
}

/** ===== 3) 月ファイル（YYYY-MM.json）読み書き ===== */
function yyyymmFromISO(iso: string): string {
  return dayjs(iso).format("YYYY-MM");
}

export async function readMonth(yyyyMM: string): Promise<EventInstance[]> {
  await ensureDirs();
  const p = monthFile(yyyyMM);
  const raw = await safeRead(p);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as EventInstance[]) : [];
  } catch {
    return [];
  }
}

export async function writeMonth(yyyyMM: string, rows: EventInstance[]) {
  await ensureDirs();
  const p = monthFile(yyyyMM);
  await atomicWrite(p, JSON.stringify(rows));
}

/** ===== 4) 複数日（YYYY-MM-DD[]）のインスタンスをまとめてロード =====
 *  - まず月ファイルを読み、続いて ops を当てて上書き（簡易リプレイ）
 */
export async function loadInstancesForDates(dates: string[]): Promise<EventInstance[]> {
  await ensureDirs();
  const months = Array.from(new Set(dates.map((d) => dayjs(d).format("YYYY-MM"))));

  // 1) 月ファイルの集合
  const base: EventInstance[] = [];
  for (const m of months) {
    const rows = await readMonth(m);
    base.push(...rows);
  }

  // 2) ops を当てて最終状態へ
  const ops = await readAllOps();
  if (ops.length) {
    const idx = new Map<string | number, EventInstance>();
    for (const row of base) idx.set(row.instance_id, row);

    for (const op of ops) {
      if (op.entity !== "instance") continue;
      if (op.type === "upsert") {
        const row = op.row;
        const m = yyyymmFromISO(row.start_at);
        if (months.includes(m)) idx.set(row.instance_id, row);
      } else if (op.type === "delete") {
        idx.delete(op.id);
      }
    }
    return Array.from(idx.values());
  }
  return base;
}

/** ===== 5) コンパクション（ops → 月ファイルへ反映し ops を空に） ===== */
export async function compactStorage() {
  await ensureDirs();
  const ops = await readAllOps();
  if (!ops.length) return;

  // ops を月ごとに集計（delete は全体扱い）
  const byMonth = new Map<string, { upserts: EventInstance[]; deletes: Array<string | number> }>();
  for (const op of ops) {
    if (op.entity !== "instance") continue;
    if (op.type === "upsert") {
      const m = yyyymmFromISO(op.row.start_at);
      const bucket = byMonth.get(m) ?? { upserts: [], deletes: [] };
      bucket.upserts.push(op.row);
      byMonth.set(m, bucket);
    } else {
      const bucket = byMonth.get("__ALL__") ?? { upserts: [], deletes: [] };
      bucket.deletes.push(op.id);
      byMonth.set("__ALL__", bucket);
    }
  }

  const globalDeletes = new Set(byMonth.get("__ALL__")?.deletes ?? []);
  byMonth.delete("__ALL__");

  for (const [m, bucket] of byMonth.entries()) {
    const oldRows = await readMonth(m);
    const map = new Map<string | number, EventInstance>(oldRows.map((r) => [r.instance_id, r]));
    for (const id of globalDeletes) map.delete(id);
    for (const r of bucket.upserts) map.set(r.instance_id, r);
    await writeMonth(m, Array.from(map.values()));
  }

  // ops をクリア
  await atomicWrite(OPS_LOG_PATH, "");
}

/** ===== 6) 初期ロード用のまとめ読み ===== */
export async function loadCalendarsAndAllInstances(): Promise<{
  calendars: Calendar[];
  instances: EventInstance[];
  lastSyncAt: string | null;
  lastSyncCursor: string | null;
}> {
  const snap = await loadLocalStore();
  return {
    calendars: snap.calendars,
    instances: snap.instances ?? [],
    lastSyncAt: snap.lastSyncAt,
    lastSyncCursor: snap.lastSyncCursor,
  };
}

/** ===== 7) ★ローカルデータの完全リセット =====
 * - months ディレクトリ配下の月ファイル削除
 * - ops ログを空に
 * - 送信キュー（存在すれば）削除
 * - snapshot.json を空テンプレで上書き
 */
export async function resetLocalData(): Promise<void> {
  await ensureDirs();

  // 1) months 配下を全削除
  try {
    const sample = monthFile("2000-01"); // e.g. /.../calect/months/2000-01.json
    const MONTHS_DIR = sample.replace(/\/[^/]+$/, "");
    if (await RNFS.exists(MONTHS_DIR)) {
      const files = await RNFS.readDir(MONTHS_DIR);
      for (const f of files) {
        try {
          // 念のため .json だけ削除
          if (f.isFile() && /\.json$/i.test(f.name)) {
            await RNFS.unlink(f.path);
          }
        } catch {}
      }
    }
  } catch {}

  // 2) ops ログを空に
  try {
    await atomicWrite(OPS_LOG_PATH, "");
  } catch {}

  // 3) 送信キュー（存在すれば）削除
  try {
    const QUEUE_FILE = `${RNFS.DocumentDirectoryPath}/calect/queue/events.queue.jsonl`;
    if (await RNFS.exists(QUEUE_FILE)) {
      await RNFS.unlink(QUEUE_FILE);
    }
  } catch {}

  // 4) snapshot.json を空テンプレで上書き
  try {
    const empty = { ...EMPTY_TEMPLATE, lastSyncAt: null, lastSyncCursor: null };
    await atomicWrite(SNAPSHOT_PATH, JSON.stringify(empty));
  } catch {}
}
