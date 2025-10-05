// src/store/sync.ts
import dayjs from '../lib/dayjs';
import type { Calendar, EventInstance } from '../api/types';
import { loadLocalStore, saveLocalStore, emptyStore } from './localFile';
import { replaceAllInstances } from './db';

// ===== 型依存の解消：loadLocalStore の返り値からローカル型を導出 =====
type LocalStore = Awaited<ReturnType<typeof loadLocalStore>>;

// =============== サーバ差分の想定レスポンス ===============
type UpsertCalendars = Calendar & { updated_at?: string | null; deleted_at?: string | null };
type UpsertInstances = EventInstance & { updated_at?: string | null; deleted_at?: string | null };

export type ServerDiffResponse = {
  cursor: string; // 次回の since に使う
  upserts: {
    calendars: UpsertCalendars[];
    instances: UpsertInstances[];
  };
  deletes?: {
    calendars?: string[];               // calendar_id[]
    instances?: Array<number | string>; // instance_id[]
  };
};

// 取得インターフェイス（実装は画面/呼出側で）
export type FetchServerDiff = (since: string | null) => Promise<ServerDiffResponse>;

// =============== マージユーティリティ ===============
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

// =============== 差分適用 ===============
function applyDiffToLocal(
  local: LocalStore,
  diff: ServerDiffResponse
): LocalStore {
  // 1) 既存をMap化
  const calMap = indexBy(local.calendars, 'calendar_id');
  const instMap = indexBy(local.instances, 'instance_id');

  // 2) 削除（tombstone）適用
  const delCals = new Set(diff.deletes?.calendars ?? []);
  const delInst = new Set(diff.deletes?.instances ?? []);

  if (delCals.size) {
    for (const id of delCals) calMap.delete(id);
  }
  if (delInst.size) {
    for (const id of delInst) instMap.delete(id);
  }

  // 3) upserts 適用（updated_at が新しいものを採用）
  for (const c of diff.upserts.calendars || []) {
    const prev = calMap.get(c.calendar_id);
    if (!prev || newer(c.updated_at ?? null, (prev as any)?.updated_at ?? null)) {
      if (!(c as any).deleted_at) calMap.set(c.calendar_id, c as Calendar);
      else calMap.delete(c.calendar_id);
    }
  }

  for (const i of diff.upserts.instances || []) {
    const prev = instMap.get(i.instance_id);
    if (!prev || newer(i.updated_at ?? null, (prev as any)?.updated_at ?? null)) {
      if (!(i as any).deleted_at) instMap.set(i.instance_id, i as EventInstance);
      else instMap.delete(i.instance_id);
    }
  }

  // 4) 反映
  const next: LocalStore = {
    ...local,
    lastSyncCursor: diff.cursor,
    lastSyncAt: dayjs().toISOString(),
    calendars: Array.from(calMap.values()),
    instances: Array.from(instMap.values()),
    tombstones: {
      calendars: [
        ...(local.tombstones?.calendars ?? []),
        ...Array.from(delCals),
      ],
      instances: [
        ...(local.tombstones?.instances ?? []),
        ...Array.from(delInst),
      ],
    },
  };
  return next;
}

// =============== 公開：増分同期ランナー ===============
export async function runIncrementalSync(fetchServerDiff: FetchServerDiff) {
  // 1) ローカル読込
  const local = await loadLocalStore().catch(() => ({ ...emptyStore }));
  const since = local.lastSyncCursor;

  // 2) サーバから差分取得
  const diff = await fetchServerDiff(since);

  // 3) ローカルへ差分適用
  const merged = applyDiffToLocal(local, diff);

  // 4) 保存
  await saveLocalStore(merged);

  // 5) アプリのインメモリDBへ反映（UI側がこの瞬間から新データを参照）
  replaceAllInstances(merged.instances);

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[sync] merged instances:', merged.instances.length, 'cursor:', merged.lastSyncCursor);
  }

  return merged;
}

// =============== 例：呼び出し側の fetch 実装テンプレ ===============
// サーバの仕様に合わせて置き換えてください
export async function exampleFetchServerDiff(since: string | null): Promise<ServerDiffResponse> {
  // 例）GET /api/sync?cursor=xxxxx を叩いて差分を取得
  // const res = await fetch(`https://example.com/api/sync?cursor=${encodeURIComponent(since ?? '')}`);
  // if (!res.ok) throw new Error('sync failed');
  // return (await res.json()) as ServerDiffResponse;

  // --- デモ用のダミー ---
  return {
    cursor: dayjs().toISOString(),
    upserts: {
      calendars: [],
      instances: [],
    },
    deletes: {
      calendars: [],
      instances: [],
    },
  };
}
