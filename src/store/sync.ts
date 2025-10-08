// src/store/sync.ts
import dayjs from '../lib/dayjs';
import type { Calendar, EventInstance as ApiEventInstance } from '../api/types';
import { replaceAllInstances } from './db';
import { loadPersistFile, savePersistFile } from './storage';

// ===== 型：ローカル永続ファイルの型を関数から導出 =====
type PersistFile = Awaited<ReturnType<typeof loadPersistFile>>;

// =============== サーバ差分レスポンスの想定（必要に応じて合わせてください） ===============
type UpsertCalendars = Calendar & { updated_at?: string | null; deleted_at?: string | null };
type UpsertInstances = ApiEventInstance & { updated_at?: string | null; deleted_at?: string | null };

export type ServerDiffResponse = {
  cursor: string; // 次回 since 用
  upserts: {
    calendars: UpsertCalendars[];
    instances: UpsertInstances[];
  };
  deletes?: {
    calendars?: string[];               // calendar_id[]
    instances?: Array<number | string>; // instance_id[]
  };
};

// 取得インターフェイス（実装は呼び出し側で）
export type FetchServerDiff = (since: string | null) => Promise<ServerDiffResponse>;

// =============== ユーティリティ ===============
function newer(a?: string | null, b?: string | null): boolean {
  if (!a && b) return false;
  if (a && !b) return true;
  if (!a && !b) return false;
  return dayjs(a!).isAfter(dayjs(b!));
}
function indexBy<T extends Record<string, any>>(rows: T[], key: keyof T) {
  const m = new Map<any, T>();
  for (const r of rows) m.set(r[key], r);
  return m;
}

// api.types の EventInstance は instance_id: number
// storage 側は number | string を許容するので、UI 反映時に number に絞る
function toApiInstancesSafe(rows: Array<{ instance_id: number | string } & ApiEventInstance>): ApiEventInstance[] {
  const out: ApiEventInstance[] = [];
  for (const row of rows) {
    const id = typeof row.instance_id === 'number'
      ? row.instance_id
      : (/^\d+$/.test(String(row.instance_id)) ? Number(row.instance_id) : undefined);
    if (id === undefined) continue;
    out.push({ ...row, instance_id: id });
  }
  return out;
}

// =============== 差分適用（PersistFile に直接適用） ===============
function applyDiffToPersist(file: PersistFile, diff: ServerDiffResponse): PersistFile {
  // 1) 既存 Map 化
  const calMap = indexBy(file.calendars, 'calendar_id');
  const instMap = indexBy(file.instances, 'instance_id');

  // 2) tombstone 削除を先に
  const delCals = new Set(diff.deletes?.calendars ?? []);
  const delInst = new Set(diff.deletes?.instances ?? []);
  if (delCals.size) for (const id of delCals) calMap.delete(id);
  if (delInst.size) for (const id of delInst) instMap.delete(id);

  // 3) upserts（updated_at が新しければ採用 / deleted_at なら削除）
  for (const c of diff.upserts.calendars || []) {
    const prev = calMap.get(c.calendar_id) as (UpsertCalendars | undefined);
    if (!prev || newer(c.updated_at ?? null, (prev as any)?.updated_at ?? null)) {
      if (!c.deleted_at) calMap.set(c.calendar_id, c);
      else calMap.delete(c.calendar_id);
    }
  }

  for (const i of diff.upserts.instances || []) {
    const prev = instMap.get(i.instance_id) as (UpsertInstances | undefined);
    if (!prev || newer(i.updated_at ?? null, (prev as any)?.updated_at ?? null)) {
      if (!i.deleted_at) instMap.set(i.instance_id, i);
      else instMap.delete(i.instance_id);
    }
  }

  // 4) 反映
  const next: PersistFile = {
    ...file,
    calendars: Array.from(calMap.values()) as any,
    instances: Array.from(instMap.values()) as any,
    // events は今回触らない（サーバ仕様に応じて拡張）
    deleted_event_ids: file.deleted_event_ids ?? [],
    deleted_calendar_ids: file.deleted_calendar_ids ?? [],
    sync: {
      cursor: diff.cursor,
      last_synced_at: dayjs().toISOString(),
    },
  };
  return next;
}

// =============== 公開：増分同期ランナー（AsyncStorage 版） ===============
export async function runIncrementalSync(fetchServerDiff: FetchServerDiff) {
  // 1) ローカル読込
  const file = await loadPersistFile();
  const since = file.sync?.cursor ?? null;

  // 2) サーバ差分取得
  const diff = await fetchServerDiff(since);

  // 3) マージ
  const merged = applyDiffToPersist(file, diff);

  // 4) 保存
  await savePersistFile(merged);

  // 5) UI 反映（instance_id が number にできるものだけ）
  const usable = toApiInstancesSafe(merged.instances as any);
  if (usable.length) replaceAllInstances(usable);

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[sync] merged', {
      calendars: merged.calendars.length,
      instances: merged.instances.length,
      cursor: merged.sync.cursor,
    });
  }

  return merged;
}

// =============== 例：呼び出し側の fetch 実装テンプレ（ダミー） ===============
export async function exampleFetchServerDiff(since: string | null): Promise<ServerDiffResponse> {
  // 実装例：
  // const res = await fetch(`${API_BASE}/sync?cursor=${encodeURIComponent(since ?? '')}`);
  // if (!res.ok) throw new Error('sync failed');
  // return (await res.json()) as ServerDiffResponse;

  // デモ用：何も更新しない差分
  return {
    cursor: dayjs().toISOString(),
    upserts: { calendars: [], instances: [] },
    deletes: { calendars: [], instances: [] },
  };
}
