// src/store/localTypes.ts
import type { Calendar, EventInstance } from '../api/types';

export type LocalStoreSchema = {
  version: 1;
  lastSyncAt: string | null;
  lastSyncCursor: string | null;
  calendars: Calendar[];
  instances: EventInstance[]; // 互換のため保持（分割導入後はオプションで空にしてOK）
  tombstones?: {
    calendars: string[];
    instances: Array<number | string>;
  };
};

export const emptyStore: LocalStoreSchema = {
  version: 1,
  lastSyncAt: null,
  lastSyncCursor: null,
  calendars: [],
  instances: [],
  tombstones: { calendars: [], instances: [] },
};

// 差分ログ（NDJSON 1行＝1オペ）
export type InstanceOp =
  | { type: 'upsert'; entity: 'instance'; row: EventInstance; updated_at?: string | null }
  | { type: 'delete'; entity: 'instance'; id: number | string; updated_at?: string | null };

export type CalendarOp =
  | { type: 'upsert'; entity: 'calendar'; row: Calendar; updated_at?: string | null }
  | { type: 'delete'; entity: 'calendar'; id: string; updated_at?: string | null };

export type AnyOp = InstanceOp | CalendarOp;
