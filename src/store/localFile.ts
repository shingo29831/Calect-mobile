// src/store/localFile.ts
import RNFS from 'react-native-fs';
import dayjs from '../lib/dayjs';
import type { EventInstance, Calendar } from '../api/types';
import { ensureDirs, SNAPSHOT_PATH, OPS_LOG_PATH, monthFile, atomicWrite } from './filePaths';
import type { LocalStoreSchema, emptyStore as _empty, AnyOp } from './localTypes';
import { emptyStore as EMPTY_TEMPLATE } from './localTypes';

/** ===== 基本ユーティリティ ===== */
async function safeRead(path: string): Promise<string | null> {
  const ok = await RNFS.exists(path);
  if (!ok) return null;
  return RNFS.readFile(path, 'utf8');
}

/** ===== 1) 既存互換：フルスナップショット ===== */
export async function loadLocalStore(): Promise<LocalStoreSchema> {
  await ensureDirs();
  const raw = await safeRead(SNAPSHOT_PATH);
  if (!raw) return { ...EMPTY_TEMPLATE };
  try {
    return JSON.parse(raw) as LocalStoreSchema;
  } catch {
    // 壊れていても落とさない
    return { ...EMPTY_TEMPLATE };
  }
}

export async function saveLocalStore(store: LocalStoreSchema) {
  await ensureDirs();
  await atomicWrite(SNAPSHOT_PATH, JSON.stringify(store));
}

// 互換：emptyStore を export（外部で import されているため）
export const emptyStore: LocalStoreSchema = { ...EMPTY_TEMPLATE };

/** ===== 2) 差分ログ：追記 / ロード ===== */
// NDJSON で追記（1行1オペ）
export async function appendOps(ops: AnyOp[]) {
  if (!ops.length) return;
  await ensureDirs();
  const lines = ops.map((o) => JSON.stringify(o)).join('\n') + '\n';
  await RNFS.appendFile(OPS_LOG_PATH, lines, 'utf8');
}

// オペログを全取得（必要になったら streaming に変更）
export async function readAllOps(): Promise<AnyOp[]> {
  await ensureDirs();
  const raw = await safeRead(OPS_LOG_PATH);
  if (!raw) return [];
  const out: AnyOp[] = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s));
    } catch {
      // 破損行は捨てる（安全側）
    }
  }
  return out;
}

/** ===== 3) 月ごと分割：読み書き ===== */
function yyyymmFromISO(iso: string): string {
  return dayjs(iso).format('YYYY-MM');
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

/** ===== 4) クエリ：必要な月だけ読む（+差分適用） ===== */
export async function loadInstancesForDates(dates: string[]): Promise<EventInstance[]> {
  await ensureDirs();
  const months = Array.from(
    new Set(dates.map((d) => dayjs(d).format('YYYY-MM')))
  );

  // 1) 対象月ファイルを読み集め
  const base: EventInstance[] = [];
  for (const m of months) {
    const rows = await readMonth(m);
    base.push(...rows);
  }

  // 2) 差分ログを読み、対象月に該当するものを適用
  //    （起動後にコンパクトしていない間の上書きを反映）
  const ops = await readAllOps();
  if (ops.length) {
    const idx = new Map<string | number, EventInstance>();
    for (const row of base) idx.set(row.instance_id, row);

    for (const op of ops) {
      if (op.entity !== 'instance') continue;
      if (op.type === 'upsert') {
        const row = op.row;
        const m = yyyymmFromISO(row.start_at);
        if (months.includes(m)) idx.set(row.instance_id, row);
      } else if (op.type === 'delete') {
        idx.delete(op.id);
      }
    }
    return Array.from(idx.values());
  }
  return base;
}

/** ===== 5) コンパクション（差分ログ → 月ファイルへ吸収） =====
 *  - 大きくなった ops.ndjson を各月に反映し直して空にする
 */
export async function compactStorage() {
  await ensureDirs();
  const ops = await readAllOps();
  if (!ops.length) return;

  // ops を月ごとに分配して適用
  const byMonth = new Map<string, { upserts: EventInstance[]; deletes: Array<string | number> }>();
  for (const op of ops) {
    if (op.entity !== 'instance') continue;
    if (op.type === 'upsert') {
      const m = yyyymmFromISO(op.row.start_at);
      const bucket = byMonth.get(m) ?? { upserts: [], deletes: [] };
      bucket.upserts.push(op.row);
      byMonth.set(m, bucket);
    } else {
      // 削除は全月に影響する可能性があるが、ID一意なら読み出し月にしかいない想定
      // 念のため「全部の月で消す」方針にするならここでは集めて後段で全ファイル処理
      const bucket = byMonth.get('__ALL__') ?? { upserts: [], deletes: [] };
      bucket.deletes.push(op.id);
      byMonth.set('__ALL__', bucket);
    }
  }

  // __ALL__ の削除対象
  const globalDeletes = new Set(byMonth.get('__ALL__')?.deletes ?? []);
  byMonth.delete('__ALL__');

  // 月ごとに既存ファイルを読み→適用→保存
  for (const [m, bucket] of byMonth.entries()) {
    const oldRows = await readMonth(m);
    const map = new Map<string | number, EventInstance>(oldRows.map((r) => [r.instance_id, r]));
    // まずグローバル削除
    for (const id of globalDeletes) map.delete(id);
    // 月内 upsert & delete
    for (const r of bucket.upserts) map.set(r.instance_id, r);
    // 保存
    await writeMonth(m, Array.from(map.values()));
  }

  // ops をクリア（atomic）
  await atomicWrite(OPS_LOG_PATH, '');
}

/** ===== 6) 既存との橋渡し：フルロード互換 =====
 *  - 既存コードは snapshot.json を読む（重い）
 *  - 将来的に完全移行したら、saveLocalStore/loadLocalStore を
 *    内部で “各月 + 差分” に変換して返すようにしても良い
 */
export async function loadCalendarsAndAllInstances(): Promise<{
  calendars: Calendar[];
  instances: EventInstance[];
  lastSyncAt: string | null;
  lastSyncCursor: string | null;
}> {
  // 1) フルスナップショットがあれば読み（後方互換）
  const snap = await loadLocalStore();
  let calendars = snap.calendars;
  let lastSyncAt = snap.lastSyncAt;
  let lastSyncCursor = snap.lastSyncCursor;

  // 2) 全月を読むのは重いので、最初はスナップショットの instances を返す
  //    画面側で「必要な月だけ loadInstancesForDates」を叩いて差し替える運用に。
  return {
    calendars,
    instances: snap.instances ?? [],
    lastSyncAt,
    lastSyncCursor,
  };
}
