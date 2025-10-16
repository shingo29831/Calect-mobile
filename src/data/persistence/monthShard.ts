// src/data/persistence/monthShard.ts
import RNFS from "react-native-fs";
import dayjs from "../../lib/dayjs";
import type { EventInstance } from "../../api/types";
import { fromUTC, startOfLocalDay, endOfLocalDay } from "../../utils/time";

// 例: /files/calect/months/2025-03.json
export const MONTHS_DIR = `${RNFS.DocumentDirectoryPath}/calect/months`;

const memMonthCache = new Map<string, EventInstance[]>(); // "YYYY-MM" -> instances[]
const loading = new Map<string, Promise<void>>();

/** 月キー（YYYY-MM） */
export const monthKeyFromISO = (iso: string) => dayjs(iso).format("YYYY-MM");

/** 月ファイルパス */
const fileForMonth = (yyyyMM: string) => `${MONTHS_DIR}/${yyyyMM}.json`;

async function ensureDir() {
  if (!(await RNFS.exists(MONTHS_DIR))) await RNFS.mkdir(MONTHS_DIR);
}

/** 月がキャッシュ済みかどうか（存在チェックのみ） */
export function hasMonthInCache(yyyyMM: string) {
  return memMonthCache.has(yyyyMM);
}

/** ――― ユニーク判定（occurrence_key > instance_id > event_id@@start_at）――― */
function instanceKey(x: Pick<EventInstance, "instance_id" | "event_id" | "start_at" | "occurrence_key">) {
  return (x as any).occurrence_key ?? (x as any).instance_id ?? `${x.event_id}@@${x.start_at}`;
}
function mergeUniqueByKey(existing: EventInstance[], adds: EventInstance[]) {
  const m = new Map<string, EventInstance>();
  for (const r of existing) m.set(instanceKey(r), r);
  for (const r of adds) m.set(instanceKey(r), r);
  return Array.from(m.values());
}

/** 月の読み込み（メモリキャッシュ＋ファイル：新パスのみ） */
export async function loadMonth(yyyyMM: string) {
  if (memMonthCache.has(yyyyMM)) return;
  if (loading.has(yyyyMM)) return loading.get(yyyyMM)!;

  const task = (async () => {
    await ensureDir();
    const path = fileForMonth(yyyyMM);
    if (!(await RNFS.exists(path))) {
      memMonthCache.set(yyyyMM, []);
      return;
    }
    const txt = await RNFS.readFile(path, "utf8");
    const rows = JSON.parse(txt) as EventInstance[];
    memMonthCache.set(yyyyMM, rows);
  })();

  loading.set(yyyyMM, task);
  await task.finally(() => loading.delete(yyyyMM));
}

/** 複数月の事前ロード */
export async function ensureMonths(yyyyMMs: string[]) {
  await Promise.all(yyyyMMs.map(loadMonth));
}

/** 中心月の前後をプリフェッチ（span=1 → 前後1か月ずつ） */
export async function prefetchMonthRange(centerYYYYMM: string, span = 1) {
  const base = dayjs(centerYYYYMM + "-01");
  const keys: string[] = [];
  for (let i = -span; i <= span; i++) keys.push(base.add(i, "month").format("YYYY-MM"));
  await ensureMonths(keys);
}

/** 指定月の配列を取得（未ロードなら自動ロードしてから返す） */
export async function getMonthInstances(yyyyMM: string): Promise<EventInstance[]> {
  if (!memMonthCache.has(yyyyMM)) {
    await loadMonth(yyyyMM);
  }
  return memMonthCache.get(yyyyMM) ?? [];
}

/** 1日分のインスタンス取得（ローカルTZで範囲判定） */
export function getInstancesForDate(dateISO: string): EventInstance[] {
  const yyyyMM = monthKeyFromISO(dateISO);
  const all = memMonthCache.get(yyyyMM) ?? [];
  const dayStart = startOfLocalDay(dateISO);
  const dayEnd = endOfLocalDay(dateISO);

  return all.filter((i) => {
    const s = fromUTC(i.start_at);
    const e = fromUTC(i.end_at);
    return s.isBefore(dayEnd) && (e.isAfter(dayStart) || e.isSame(dayStart));
  });
}

/** 1か月分を上書き保存（メモリ＋ディスク：新パスに統一） */
export async function upsertMonthInstances(yyyyMM: string, rows: EventInstance[]) {
  await ensureDir();
  memMonthCache.set(yyyyMM, rows);
  const path = fileForMonth(yyyyMM);
  await RNFS.writeFile(path, JSON.stringify(rows), "utf8");
}

/** 追加配列をマージして保存（ユニーク判定付き） */
export async function upsertMonthInstancesMerged(yyyyMM: string, adds: EventInstance[]) {
  await ensureDir();
  const current = await getMonthInstances(yyyyMM);
  const merged = mergeUniqueByKey(current, adds);
  await upsertMonthInstances(yyyyMM, merged);
}

/** 単一インスタンスを該当月へ追加（ユニーク判定付き） */
export async function upsertSingleInstance(inst: EventInstance) {
  const ym = monthKeyFromISO(inst.start_at);
  await upsertMonthInstancesMerged(ym, [inst]);
}

/** 複数日（YYYY-MM-DD[]）の結果をまとめて返す（必要月は自動ロード） */
export async function getByDatesWithEnsure(dates: string[]): Promise<Record<string, EventInstance[]>> {
  const months = Array.from(new Set(dates.map((d) => d.slice(0, 7))));
  await ensureMonths(months);
  const out: Record<string, EventInstance[]> = {};
  for (const d of dates) out[d] = getInstancesForDate(d);
  return out;
}

/** （任意ユーティリティ）cid→event_id の置換を月ファイルにも反映 */
export async function applyEventIdMappingInMonths(m: Map<string, string>, targetMonths: string[]) {
  if (!m.size) return;
  await ensureMonths(targetMonths);
  for (const ym of targetMonths) {
    const arr = await getMonthInstances(ym);
    let changed = false;
    for (const it of arr) {
      const real = m.get((it as any).event_id as string) || ((it as any).cid_ulid && m.get((it as any).cid_ulid));
      if (real) {
        (it as any).cid_ulid = null;
        (it as any).event_id = real;
        (it as any).occurrence_key = `${real}@@${it.start_at}`;
        changed = true;
      }
    }
    if (changed) await upsertMonthInstances(ym, arr);
  }
}
