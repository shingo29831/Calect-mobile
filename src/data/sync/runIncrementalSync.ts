// src/data/sync/runIncrementalSync.ts
// クライアント側の“増分同期”ロジック。
// - サーバから upserts/deletes を受け取り、ローカルスナップショットへマージ
// - マージ結果を保存し、UI用のアプリ内DBへ反映

import dayjs from "../../lib/dayjs";
import type { Calendar, EventInstance } from "../../api/types";
import { loadLocalStore, saveLocalStore, emptyStore } from "../persistence/localStore";
import { replaceAllInstances } from "../../store/db";

/* ===================== サーバ応答の型 & フェッチ関数 ===================== */

type UpsertCalendars = Calendar & { updated_at?: string | null; deleted_at?: string | null };
type UpsertInstances = EventInstance & { updated_at?: string | null; deleted_at?: string | null };

/** サーバから返る“差分”の構造 */
export type ServerDiffResponse = {
  /** 次回以降の差分取得に使うカーソル */
  cursor: string;
  /** 追加・更新（論理削除は deleted_at を付与） */
  upserts: {
    calendars: UpsertCalendars[];
    instances: UpsertInstances[];
  };
  /** 物理削除（サーバ側が墓石を生成している場合は省略可能） */
  deletes?: {
    calendars?: string[];               // calendar_id[]
    instances?: Array<number | string>; // instance_id[]
  };
};

/** 差分取得関数の型（since は前回の cursor） */
export type FetchServerDiff = (since: string | null) => Promise<ServerDiffResponse>;

/* =============================== ユーティリティ =============================== */

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

/* =============================== マージ処理本体 =============================== */

type LocalStore = Awaited<ReturnType<typeof loadLocalStore>>;

function applyDiffToLocal(local: LocalStore, diff: ServerDiffResponse): LocalStore {
  // 現状のローカルを Map 化
  const calMap = indexBy(local.calendars, "calendar_id");
  const instMap = indexBy(local.instances, "instance_id");

  // 明示的 delete の反映
  const delCals = new Set(diff.deletes?.calendars ?? []);
  const delInst = new Set(diff.deletes?.instances ?? []);
  for (const id of delCals) calMap.delete(id);
  for (const id of delInst) instMap.delete(id);

  // upserts（updated_at が新しければ置き換え／deleted_at があれば除去）
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

  // 次のローカル状態
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

/* =============================== 公開エントリ =============================== */

/**
 * サーバから差分を取得し、ローカルへ適用 → 保存 → UI DB へ反映
 */
export async function runIncrementalSync(fetchServerDiff: FetchServerDiff) {
  // 1) ローカルの現在値を読む（壊れていたら空テンプレ）
  const local = await loadLocalStore().catch(() => ({ ...emptyStore }));
  const since = local.lastSyncCursor ?? null;

  // 2) サーバから差分を取得
  const diff = await fetchServerDiff(since);

  // 3) ローカルへマージ
  const merged = applyDiffToLocal(local, diff);

  // 4) 保存
  await saveLocalStore(merged);

  // 5) UI用の“アプリ内DB”へ反映
  replaceAllInstances(merged.instances);

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log("[sync] merged instances:", merged.instances.length, "cursor:", merged.lastSyncCursor);
  }

  return merged;
}

/* ============================ サンプル実装（開発用） ============================ */

/**
 * 例: サーバが未実装の間のダミー差分取得
 */
export async function exampleFetchServerDiff(since: string | null): Promise<ServerDiffResponse> {
  // 本来は:
  // const res = await fetch(`/api/sync?cursor=${encodeURIComponent(since ?? "")}`);
  // if (!res.ok) throw new Error("sync failed");
  // return (await res.json()) as ServerDiffResponse;

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
