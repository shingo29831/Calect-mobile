// src/data/persistence/schemas.ts
// ローカル永続化（スナップショット/差分ログ）に関する型を集約。
// API契約（ネットワーク層の型）は ../../api/types に定義し、ここから参照します。

import type { Calendar, EventInstance } from "../../api/types";

/** 現行スキーマのバージョン */
export const CURRENT_SCHEMA_VERSION = 1 as const;

/** ローカル保存スナップショット（後方互換のため最小限の形を維持） */
export type LocalStoreSchema = {
  /** スキーマバージョン（将来のマイグレーション用） */
  version: typeof CURRENT_SCHEMA_VERSION;

  /** 最後に同期が完了した時刻（ISO） */
  lastSyncAt: string | null;

  /** サーバ側のウォーターマーク/カーソル（差分取得の続き用） */
  lastSyncCursor: string | null;

  /** カレンダー一覧（公開属性のみ保持） */
  calendars: Calendar[];

  /**
   * 互換のため一旦は配列で全件保持。
   * 将来は「月分割 + 差分ログ（NDJSON）」へ段階移行していく。
   */
  instances: EventInstance[];

  /** 論理削除（墓石） */
  tombstones?: {
    calendars: string[];                 // calendar_id[]
    instances: Array<number | string>;   // instance_id（文字/数値どちらも許可）
  };
};

/** 空テンプレート（破損時のフォールバックにも使用） */
export const emptyStore: LocalStoreSchema = {
  version: CURRENT_SCHEMA_VERSION,
  lastSyncAt: null,
  lastSyncCursor: null,
  calendars: [],
  instances: [],
  tombstones: { calendars: [], instances: [] },
};

/* ========================= 差分ログ（NDJSON） =========================
   1行＝1オペのイベントログとして保存する想定。
   entity + type の判別可能ユニオンを使い、型ガードも提供。
   ================================================================== */

/** 1件のイベントインスタンスに対する操作 */
export type InstanceOp =
  | { type: "upsert"; entity: "instance"; row: EventInstance; updated_at?: string | null }
  | { type: "delete"; entity: "instance"; id: number | string; updated_at?: string | null };

/** 1件のカレンダーに対する操作 */
export type CalendarOp =
  | { type: "upsert"; entity: "calendar"; row: Calendar; updated_at?: string | null }
  | { type: "delete"; entity: "calendar"; id: string; updated_at?: string | null };

export type AnyOp = InstanceOp | CalendarOp;

/* ============================ 型ガード群 ============================ */

export function isInstanceOp(op: AnyOp): op is InstanceOp {
  return op.entity === "instance";
}

export function isCalendarOp(op: AnyOp): op is CalendarOp {
  return op.entity === "calendar";
}

export function isUpsert(op: AnyOp): op is Extract<AnyOp, { type: "upsert" }> {
  return op.type === "upsert";
}

export function isDelete(op: AnyOp): op is Extract<AnyOp, { type: "delete" }> {
  return op.type === "delete";
}

/* ====================== ユーティリティ: ディープクローン ====================== */
/** 環境に structuredClone が無い場合でも動くディープクローン */
function deepClone<T>(v: T): T {
  const g: any = globalThis as any;
  if (typeof g?.structuredClone === "function") {
    return g.structuredClone(v);
  }
  // 循環参照は想定しない（emptyStore のようなプレーンデータ前提）
  return JSON.parse(JSON.stringify(v)) as T;
}

/* ====================== スナップショット/マイグレーション ======================
   将来 version が増えたときに備えて、入力を安全化する関数を用意。
   破損データや欠落フィールドがあっても空テンプレにフォールバック。
   ============================================================================ */

/**
 * 与えられたオブジェクトを LocalStoreSchema として“安全に”正規化する。
 * - フィールド欠落時は空テンプレから補完
 * - 型が崩れているフィールドは空値へフォールバック
 * - version が違う場合のマイグレーション・フックを用意（将来拡張）
 */
export function ensureLocalStoreSchema(input: unknown): LocalStoreSchema {
  const base = deepClone(emptyStore);

  if (!input || typeof input !== "object") return base;
  const obj = input as Partial<LocalStoreSchema>;

  // version（将来: if (obj.version === 2) return migrateV2toV1(obj) など）
  (base as any).version = CURRENT_SCHEMA_VERSION;

  // lastSyncAt / lastSyncCursor
  if (typeof obj.lastSyncAt === "string" || obj.lastSyncAt === null) {
    base.lastSyncAt = obj.lastSyncAt ?? null;
  }
  if (typeof obj.lastSyncCursor === "string" || obj.lastSyncCursor === null) {
    base.lastSyncCursor = obj.lastSyncCursor ?? null;
  }

  // calendars
  if (Array.isArray(obj.calendars)) {
    base.calendars = obj.calendars as Calendar[];
  }

  // instances
  if (Array.isArray(obj.instances)) {
    base.instances = obj.instances as EventInstance[];
  }

  // tombstones
  if (obj.tombstones && typeof obj.tombstones === "object") {
    const t = obj.tombstones as LocalStoreSchema["tombstones"];
    base.tombstones = {
      calendars: Array.isArray(t?.calendars) ? t!.calendars.slice() : [],
      instances: Array.isArray(t?.instances) ? t!.instances.slice() : [],
    };
  }

  return base;
}
