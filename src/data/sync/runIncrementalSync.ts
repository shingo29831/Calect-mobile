// src/data/sync/runIncrementalSync.ts
// クライアント側の“増分同期”ロジック（v2 以降・暫定ローカルスナップショット対応）。
// - サーバから upserts/deletes を受け取り、ローカルスナップショットへマージ
// - マージ結果を保存し、UI用のアプリ内DBへ反映（cid_ulid→event_id の置換もここで実施）

import dayjs from "../../lib/dayjs";
import type { EventInstance } from "../../api/types";
import { replaceAllInstances } from "../../store/db";
import { readFile, writeFile } from "../../store/localFile";


/* =========================== ローカルスナップショット・シム =========================== */
/**
 * 既存の ../persistence/localStore には v2 スナップショット（server.v2.json）のAPIのみが
 * 用意されているため、本ファイルだけで完結する軽量スナップショットを定義する。
 * - 保存先: snapshot/local.instances.v1.json
 * - 内容  : instances[], calendars[], tombstones[], lastSyncCursor/At
 * 画面の高速応答は store/db のメモリDB（replaceAllInstances）に委譲する。
 */

type CalendarLite = {
  calendar_id: string;
  name?: string;
  color?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

type LocalSnapshot = {
  version: 1;
  lastSyncCursor: string | null;
  lastSyncAt: string | null;
  calendars: CalendarLite[];
  instances: EventInstance[];
  tombstones: {
    calendars: string[];
    instances: Array<number | string>;
  };
};

const SNAPSHOT_PATH = "snapshot/local.instances.v1.json";

const emptyStore: LocalSnapshot = {
  version: 1,
  lastSyncCursor: null,
  lastSyncAt: null,
  calendars: [],
  instances: [],
  tombstones: { calendars: [], instances: [] },
};

async function loadLocalStore(): Promise<LocalSnapshot> {
  try {
    const raw = await readFile(SNAPSHOT_PATH);
    const obj = JSON.parse(raw);
    if (obj && obj.version === 1) return obj as LocalSnapshot;
  } catch {}
  return { ...emptyStore };
}

async function saveLocalStore(s: LocalSnapshot): Promise<void> {
  await writeFile(SNAPSHOT_PATH, JSON.stringify(s));
}

/* ===================== サーバ応答の型 & フェッチ関数 ===================== */

type UpsertCalendars = CalendarLite & { updated_at?: string | null; deleted_at?: string | null };
type UpsertInstances = EventInstance & { updated_at?: string | null; deleted_at?: string | null };

type IdMapEvent = {
  entity: "event";
  cid_ulid: string;  // クライアント一時ID
  event_id: string;  // サーバ確定ID
};

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
  /** ★cid→正規ID マッピング（オフライン作成分の確定） */
  id_maps?: IdMapEvent[];
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

/** 置換用：event_id + start_at から occurrence_key を再計算 */
function computeOccurrenceKey(it: Pick<EventInstance, "event_id" | "start_at">) {
  return `${it.event_id}@@${it.start_at}`;
}

/* =============================== マージ処理本体 =============================== */

type LocalStore = Awaited<ReturnType<typeof loadLocalStore>>;

/**
 * diff をローカルへ適用し、必要なら id_maps（cid→正規ID）も反映した LocalStore を返す。
 */
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
      if (!(c as any).deleted_at) calMap.set(c.calendar_id, c as CalendarLite);
      else calMap.delete(c.calendar_id);
    }
  }
  for (const i of diff.upserts.instances || []) {
    const prev = instMap.get(i.instance_id);
    if (!prev || newer((i as any).updated_at ?? null, (prev as any)?.updated_at ?? null)) {
      if (!(i as any).deleted_at) {
        const next = { ...(i as EventInstance) };
        // occurrence_key が無ければ補完
        if (!next.occurrence_key && next.event_id && next.start_at) {
          next.occurrence_key = computeOccurrenceKey({ event_id: next.event_id, start_at: next.start_at });
        }
        instMap.set(i.instance_id, next);
      } else {
        instMap.delete(i.instance_id);
      }
    }
  }

  // ★ cid_ulid → event_id の置換（id_maps）
  const maps = diff.id_maps ?? [];
  if (maps.length) {
    // event 単位の置換のみを想定
    const cidToReal = new Map<string, string>();
    for (const m of maps) {
      if (m.entity === "event" && m.cid_ulid && m.event_id) {
        cidToReal.set(m.cid_ulid, m.event_id);
      }
    }
    if (cidToReal.size) {
      for (const inst of instMap.values()) {
        const byEvent = (inst as any).event_id ? cidToReal.get((inst as any).event_id as string) : undefined;
        const byCid   = (inst as any).cid_ulid ? cidToReal.get((inst as any).cid_ulid as string) : undefined;
        const real = byEvent ?? byCid;

        if (real) {
          (inst as any).cid_ulid = null;           // 一時IDはクリア（任意）
          (inst as any).event_id = real;           // 正規IDへ置換
          if ((inst as any).start_at) {
            (inst as any).occurrence_key = computeOccurrenceKey({ event_id: real, start_at: (inst as any).start_at });
          }
        }
      }
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

  // 3) ローカルへマージ（cid→正規ID 置換もここで）
  const merged = applyDiffToLocal(local, diff);

  // 4) 保存
  await saveLocalStore(merged);

  // 5) UI用の“アプリ内DB”へ反映
  replaceAllInstances(merged.instances);

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(
      "[sync]",
      "instances:", merged.instances.length,
      "cursor:", merged.lastSyncCursor,
      "id_maps:", (diff.id_maps?.length ?? 0)
    );
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
    // 例: オフライン作成で cid=... が event_id=... に確定したとき
    // id_maps: [{ entity: "event", cid_ulid: "01H...CID", event_id: "01J...REAL" }],
  };
}
