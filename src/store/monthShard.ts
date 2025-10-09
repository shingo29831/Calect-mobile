// src/store/monthShard.ts
import RNFS from 'react-native-fs';
import dayjs from '../lib/dayjs';
import type { EventInstance } from '../api/types';
import { fromUTC, startOfLocalDay, endOfLocalDay } from '../utils/time';

// 保存場所: /Documents/appdata/shards/2025-03.json など
const DIR = `${RNFS.DocumentDirectoryPath}/appdata/shards`;

const memMonthCache = new Map<string, EventInstance[]>(); // "YYYY-MM" -> instances[]
const loading = new Map<string, Promise<void>>();

/** 月キーを作成 */
export const monthKeyFromISO = (iso: string) => dayjs(iso).format('YYYY-MM');

/** 指定月のファイルパス */
const fileForMonth = (yyyyMM: string) => `${DIR}/${yyyyMM}.json`;

async function ensureDir() {
  if (!(await RNFS.exists(DIR))) await RNFS.mkdir(DIR);
}

/** 月ファイルを読み込み（メモリに載せる）。無ければ空としてキャッシュ。 */
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
    const txt = await RNFS.readFile(path, 'utf8');
    const rows = JSON.parse(txt) as EventInstance[];
    memMonthCache.set(yyyyMM, rows);
  })();

  loading.set(yyyyMM, task);
  await task.finally(() => loading.delete(yyyyMM));
}

/** 複数月をまとめて確保 */
export async function ensureMonths(yyyyMMs: string[]) {
  await Promise.all(yyyyMMs.map(loadMonth));
}

/** 前後の月を軽く先読み（任意） */
export async function prefetchMonthRange(centerYYYYMM: string, span = 1) {
  const base = dayjs(centerYYYYMM + '-01');
  const keys: string[] = [];
  for (let i = -span; i <= span; i++) keys.push(base.add(i, 'month').format('YYYY-MM'));
  await ensureMonths(keys);
}

/** 指定日のインスタンスを月キャッシュから抽出（ローカルTZで重なり判定） */
export function getInstancesForDate(dateISO: string): EventInstance[] {
  const yyyyMM = monthKeyFromISO(dateISO);
  const all = memMonthCache.get(yyyyMM) ?? [];
  const dayStart = startOfLocalDay(dateISO);
  const dayEnd   = endOfLocalDay(dateISO);

  return all.filter((i) => {
    const s = fromUTC(i.start_at);
    const e = fromUTC(i.end_at);
    return s.isBefore(dayEnd) && (e.isAfter(dayStart) || e.isSame(dayStart));
  });
}

/** 月キャッシュに追記/置換保存（サーバ差分反映時に使う想定） */
export async function upsertMonthInstances(yyyyMM: string, rows: EventInstance[]) {
  await ensureDir();
  memMonthCache.set(yyyyMM, rows);
  const path = fileForMonth(yyyyMM);
  await RNFS.writeFile(path, JSON.stringify(rows), 'utf8');
}

/** 複数日の取得ヘルパ（dates は YYYY-MM-DD[]） */
export async function getByDatesWithEnsure(dates: string[]): Promise<Record<string, EventInstance[]>> {
  const months = Array.from(new Set(dates.map(d => d.slice(0, 7))));
  await ensureMonths(months);
  const out: Record<string, EventInstance[]> = {};
  for (const d of dates) out[d] = getInstancesForDate(d);
  return out;
}

/* =========================================================
 * 互換用エクスポート（CalendarScreen が参照）
 * =======================================================*/
export async function ensureMonthLoaded(month: string): Promise<void> {
  await loadMonth(month);
}
export async function ensureMonthsLoaded(months: string[]): Promise<void> {
  await ensureMonths(months);
}
