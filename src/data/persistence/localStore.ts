import RNFS from "react-native-fs";
import dayjs from "../../lib/dayjs";
import type { EventInstance, Calendar } from "../../api/types";
import { ensureDirs, SNAPSHOT_PATH, OPS_LOG_PATH, monthFile, atomicWrite } from "./filePaths";
import type { LocalStoreSchema, AnyOp } from "./schemas";
import { emptyStore as EMPTY_TEMPLATE } from "./schemas";

/** ===== 蝓ｺ譛ｬ繝ｦ繝ｼ繝・ぅ繝ｪ繝・ぅ ===== */
async function safeRead(path: string): Promise<string | null> {
  const ok = await RNFS.exists(path);
  if (!ok) return null;
  return RNFS.readFile(path, "utf8");
}

/** ===== 1) 譌｢蟄倅ｺ呈鋤・壹ヵ繝ｫ繧ｹ繝翫ャ繝励す繝ｧ繝・ヨ ===== */
export async function loadLocalStore(): Promise<LocalStoreSchema> {
  await ensureDirs();
  const raw = await safeRead(SNAPSHOT_PATH);
  if (!raw) return { ...EMPTY_TEMPLATE };
  try {
    return JSON.parse(raw) as LocalStoreSchema;
  } catch {
    // 螢翫ｌ縺ｦ縺・※繧り誠縺ｨ縺輔↑縺・
    return { ...EMPTY_TEMPLATE };
  }
}

export async function saveLocalStore(store: LocalStoreSchema) {
  await ensureDirs();
  await atomicWrite(SNAPSHOT_PATH, JSON.stringify(store));
}

// 莠呈鋤・啼mptyStore 繧・export・亥､夜Κ縺ｧ import 縺輔ｌ縺ｦ縺・ｋ縺溘ａ・・
export const emptyStore: LocalStoreSchema = { ...EMPTY_TEMPLATE };

/** ===== 2) 蟾ｮ蛻・Ο繧ｰ・夊ｿｽ險・/ 繝ｭ繝ｼ繝・===== */
// NDJSON 縺ｧ霑ｽ險假ｼ・陦・繧ｪ繝夲ｼ・
export async function appendOps(ops: AnyOp[]) {
  if (!ops.length) return;
  await ensureDirs();
  const lines = ops.map((o) => JSON.stringify(o)).join("\n") + "\n";
  await RNFS.appendFile(OPS_LOG_PATH, lines, "utf8");
}

// 繧ｪ繝壹Ο繧ｰ繧貞・蜿門ｾ暦ｼ亥ｿ・ｦ√↓縺ｪ縺｣縺溘ｉ streaming 縺ｫ螟画峩・・
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
      // 遐ｴ謳崎｡後・謐ｨ縺ｦ繧具ｼ亥ｮ牙・蛛ｴ・・
    }
  }
  return out;
}

/** ===== 3) 譛医＃縺ｨ蛻・牡・夊ｪｭ縺ｿ譖ｸ縺・===== */
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

/** ===== 4) 繧ｯ繧ｨ繝ｪ・壼ｿ・ｦ√↑譛医□縺題ｪｭ繧・・蟾ｮ蛻・←逕ｨ・・===== */
export async function loadInstancesForDates(dates: string[]): Promise<EventInstance[]> {
  await ensureDirs();
  const months = Array.from(new Set(dates.map((d) => dayjs(d).format("YYYY-MM"))));

  // 1) 蟇ｾ雎｡譛医ヵ繧｡繧､繝ｫ繧定ｪｭ縺ｿ髮・ａ
  const base: EventInstance[] = [];
  for (const m of months) {
    const rows = await readMonth(m);
    base.push(...rows);
  }

  // 2) 蟾ｮ蛻・Ο繧ｰ繧定ｪｭ縺ｿ縲∝ｯｾ雎｡譛医↓隧ｲ蠖薙☆繧九ｂ縺ｮ繧帝←逕ｨ
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

/** ===== 5) 繧ｳ繝ｳ繝代け繧ｷ繝ｧ繝ｳ・亥ｷｮ蛻・Ο繧ｰ 竊・譛医ヵ繧｡繧､繝ｫ縺ｸ蜷ｸ蜿趣ｼ・=====
 *  - 螟ｧ縺阪￥縺ｪ縺｣縺・ops.ndjson 繧貞推譛医↓蜿肴丐縺礼峩縺励※遨ｺ縺ｫ縺吶ｋ
 */
export async function compactStorage() {
  await ensureDirs();
  const ops = await readAllOps();
  if (!ops.length) return;

  // ops 繧呈怦縺斐→縺ｫ蛻・・縺励※驕ｩ逕ｨ
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

  await atomicWrite(OPS_LOG_PATH, "");
}

/** ===== 6) 繝輔Ν繝ｭ繝ｼ繝我ｺ呈鋤 ===== */
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
