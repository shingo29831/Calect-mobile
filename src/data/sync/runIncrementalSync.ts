// src/data/sync/runIncrementalSync.ts
// クライアント側の“増分同期”ロジック（v2 以降・暫定ローカルスナップショット対応）。
// - サーバから upserts/deletes を受け取り、ローカルスナップショットへマージ
// - マージ結果を保存し、UI用のアプリ内DBへ反映（cid_ulid→event_id の置換もここで実施）
// ★空差分で UI の表示が消えないように、"変更が無い場合は replaceAllInstances を呼ばない" ガードを追加。
// ★初回でスナップショットが無い場合は、メモリDB（getAllInstances）を“種”として保存してから同期する。

import dayjs from "../../lib/dayjs";
import type { EventInstance } from "../../api/types";
import { getAllInstances, replaceAllInstances } from "../../store/db";
import { readFile, writeFile } from "../../store/localFile";

/* =========================== ローカルスナップショット・シム =========================== */
/**
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

/** 置換用：event_id + dtstart から occurrence_key を再計算 */
function computeOccurrenceKey(it: Pick<EventInstance, "event_id" | "dtstart">) {
  return `${it.event_id}@@${it.dtstart}`;
}

/* =============================== マージ処理本体 =============================== */

type LocalStore = Awaited<ReturnType<typeof loadLocalStore>>;
type ApplyResult = { next: LocalStore; changed: boolean };

/**
 * diff をローカルへ適用し、必要なら id_maps（cid→正規ID）も反映。
 * さらに「ローカルに変更が発生したか」を返す（UI 全消去を防ぐため）。
 */
function applyDiffToLocal(local: LocalStore, diff: ServerDiffResponse): ApplyResult {
  // 現状のローカルを Map 化
  const calMap = indexBy(local.calendars, "calendar_id");
  const instMap = indexBy(local.instances, "instance_id");

  let changed = false;

  // 明示的 delete の反映
  const delCals = new Set(diff.deletes?.calendars ?? []);
  const delInst = new Set(diff.deletes?.instances ?? []);
  for (const id of delCals) { if (calMap.delete(id)) changed = true; }
  for (const id of delInst) { if (instMap.delete(id)) changed = true; }

  // upserts（updated_at が新しければ置き換え／deleted_at があれば除去）
  for (const c of diff.upserts.calendars || []) {
    const prev = calMap.get(c.calendar_id);
    const should = !prev || newer(c.updated_at ?? null, (prev as any)?.updated_at ?? null);
    if (should) {
      if (!(c as any).deleted_at) calMap.set(c.calendar_id, c as CalendarLite);
      else calMap.delete(c.calendar_id);
      changed = true;
    }
  }
  for (const i of diff.upserts.instances || []) {
    const prev = instMap.get(i.instance_id);
    const should = !prev || newer((i as any).updated_at ?? null, (prev as any)?.updated_at ?? null);
    if (should) {
      if (!(i as any).deleted_at) {
        const next = { ...(i as EventInstance) };
        // occurrence_key が無ければ補完
        if (!next.occurrence_key && next.event_id && next.dtstart) {
          next.occurrence_key = computeOccurrenceKey({ event_id: next.event_id, dtstart: next.dtstart });
        }
        instMap.set(i.instance_id, next);
      } else {
        instMap.delete(i.instance_id);
      }
      changed = true;
    }
  }

  // ★ cid_ulid → event_id の置換（id_maps）
  const maps = diff.id_maps ?? [];
  if (maps.length) {
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
          if ((inst as any).dtstart) {
            (inst as any).occurrence_key = computeOccurrenceKey({ event_id: real, dtstart: (inst as any).dtstart });
          }
          changed = true;
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
  return { next, changed };
}

/* =============================== 公開エントリ =============================== */

/**
 * サーバから差分を取得し、ローカルへ適用 → 保存 → UI DB へ反映
 * - 変更が無いときは UI 反映をスキップ（表示が消える事故を防止）
 * - 初回スナップショットが無い場合は、メモリDBを種にして保存してから同期
 */
export async function runIncrementalSync(fetchServerDiff: FetchServerDiff) {
  // 1) ローカルの現在値を読む
  let local = await loadLocalStore().catch(() => ({ ...emptyStore }));

  // ★スナップショットが空なら、現在のメモリDBを“種”として保存（初回の全消し防止）
  if (!local.instances?.length) {
    const seed = getAllInstances?.() ?? [];
    if (seed.length) {
      local = {
        ...local,
        instances: seed,
        lastSyncAt: local.lastSyncAt ?? dayjs().toISOString(),
      };
      await saveLocalStore(local);
    }
  }

  const since = local.lastSyncCursor ?? null;

  // 2) サーバから差分を取得
  const diff = await fetchServerDiff(since);

  // 3) ローカルへマージ（cid→正規ID 置換もここで）
  const { next: merged, changed } = applyDiffToLocal(local, diff);

  // 4) 保存
  await saveLocalStore(merged);

  // 5) UI用の“アプリ内DB”へ反映（★変更がある場合のみ）
  if (changed) {
    replaceAllInstances(merged.instances);
  }

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(
      "[sync]",
      "instances:", merged.instances.length,
      "cursor:", merged.lastSyncCursor,
      "id_maps:", (diff.id_maps?.length ?? 0),
      "changed:", changed
    );
  }

  return merged;
}

/* ============================ サンプル実装（開発用） ============================ */

/**
 * 例: サーバが未実装の間のダミー差分取得
 * - 初回/空差分でも UI を空更新しないよう、最低限 cursor のみを返す。
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
    // id_maps: [{ entity: "event", cid_ulid: "01H...CID", event_id: "01J...REAL" }],
  };
}
