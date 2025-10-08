// src/store/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

/** =========================
 * 基本型（必要に応じて拡張OK）
 * ========================= */
export type ULID = string;
export type ISO8601 = string;

export type Calendar = {
  calendar_id: ULID;
  name: string;
  color?: string | null;
  tz?: string | null;                   // 例: "Asia/Tokyo"
  visibility?: 'private' | 'org' | 'public';
};

export type Event = {
  event_id: ULID;
  calendar_id: ULID;
  title: string;
  description: string | null;
  is_all_day: boolean;
  tz: string | null;                    // 例: "Asia/Tokyo"
  start_at: ISO8601;                    // UTC ISO
  end_at: ISO8601;                      // UTC ISO
  visibility: 'inherit' | 'private' | 'org' | 'public';
};

export type EventInstance = {
  instance_id: number;                  // ← number に統一
  calendar_id: ULID;
  event_id: ULID;
  title: string;
  start_at: ISO8601;                    // UTC ISO
  end_at: ISO8601;                      // UTC ISO
  color?: string | null;
};

/** サーバ同期メタ */
export type SyncMeta = {
  cursor: string | null;                // 次回差分用カーソル
  last_synced_at: ISO8601 | null;       // 最終同期時刻(UTC ISO)
};

/** =========================
 * 永続ファイル構造
 * ========================= */
export type PersistFile = {
  version: 1;
  calendars: Calendar[];                // 小規模想定で配列
  events: Record<ULID, Event>;          // event_id -> Event
  instances: EventInstance[];           // 表示用キャッシュ（任意）
  deleted_event_ids: ULID[];            // tombstones
  deleted_calendar_ids?: ULID[];        // 追加: カレンダーのtombstones
  sync: SyncMeta;
};

/** =========================
 * ストレージキー & 既定値
 * ========================= */
const KEY = 'calect.persist.v1';
const MAX_SAFE_BYTES = 3 * 1024 * 1024; // 3MB超で警告（AsyncStorageは実装依存のため目安）

const emptyFile = (): PersistFile => ({
  version: 1,
  calendars: [],
  events: {},
  instances: [],
  deleted_event_ids: [],
  deleted_calendar_ids: [],
  sync: { cursor: null, last_synced_at: null },
});

/** =========================
 * ユーティリティ
 * ========================= */
async function saveWithGuard(next: PersistFile) {
  const text = JSON.stringify(next);
  if (text.length > MAX_SAFE_BYTES) {
    // eslint-disable-next-line no-console
    console.warn(
      `[storage] PersistFile size is large (${(text.length / (1024 * 1024)).toFixed(
        2
      )} MB). Consider compaction.`
    );
  }
  await AsyncStorage.setItem(KEY, text);
}

function coerceInstanceId(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

/** unknown から PersistFile に正規化（不足フィールドを補完、想定外型は初期値へ） */
function normalizeToPersistFile(input: any): PersistFile {
  const base = emptyFile();
  if (!input || typeof input !== 'object') return base;

  const calendars = Array.isArray(input.calendars) ? input.calendars : base.calendars;

  const events: PersistFile['events'] =
    input.events && typeof input.events === 'object' && !Array.isArray(input.events)
      ? (input.events as PersistFile['events'])
      : base.events;

  // instances は number に正規化（数値変換できないものは捨てる）
  const instances: EventInstance[] = Array.isArray(input.instances)
    ? input.instances
        .map((x: any) => {
          const id = coerceInstanceId(x?.instance_id);
          if (id === undefined) return undefined;
          return {
            instance_id: id,
            calendar_id: String(x.calendar_id ?? ''),
            event_id: String(x.event_id ?? ''),
            title: String(x.title ?? ''),
            start_at: String(x.start_at ?? ''),
            end_at: String(x.end_at ?? ''),
            color: x.color ?? null,
          } as EventInstance;
        })
        .filter((x: EventInstance | undefined): x is EventInstance => !!x)
    : base.instances;

  const deleted_event_ids = Array.isArray(input.deleted_event_ids)
    ? input.deleted_event_ids
    : base.deleted_event_ids;

  const deleted_calendar_ids = Array.isArray(input.deleted_calendar_ids)
    ? input.deleted_calendar_ids
    : [];

  const syncObj: SyncMeta =
    input.sync && typeof input.sync === 'object'
      ? {
          cursor:
            input.sync.cursor === null || typeof input.sync.cursor === 'string'
              ? (input.sync.cursor as string | null)
              : null,
          last_synced_at:
            input.sync.last_synced_at === null || typeof input.sync.last_synced_at === 'string'
              ? (input.sync.last_synced_at as string | null)
              : null,
        }
      : base.sync;

  return {
    version: 1,
    calendars,
    events,
    instances,
    deleted_event_ids,
    deleted_calendar_ids,
    sync: syncObj,
  };
}

/** =========================
 * 基本I/O
 * ========================= */
export async function loadPersistFile(): Promise<PersistFile> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return emptyFile();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyFile();
  }

  return normalizeToPersistFile(parsed);
}

export async function savePersistFile(next: PersistFile): Promise<void> {
  await saveWithGuard(next);
}

export async function resetPersistFile(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** =========================
 * カレンダー CRUD / 取得
 * ========================= */
export async function upsertCalendar(cal: Calendar): Promise<void> {
  const file = await loadPersistFile();
  const idx = file.calendars.findIndex(c => c.calendar_id === cal.calendar_id);
  if (idx >= 0) file.calendars[idx] = cal;
  else file.calendars.push(cal);

  // tombstone から消す
  if (file.deleted_calendar_ids?.length) {
    file.deleted_calendar_ids = file.deleted_calendar_ids.filter(id => id !== cal.calendar_id);
  }
  await savePersistFile(file);
}

export async function upsertCalendars(list: Calendar[]): Promise<void> {
  const file = await loadPersistFile();
  const byId = new Map(file.calendars.map(c => [c.calendar_id, c] as const));
  for (const cal of list) {
    byId.set(cal.calendar_id, cal);
    if (file.deleted_calendar_ids?.length) {
      file.deleted_calendar_ids = file.deleted_calendar_ids.filter(id => id !== cal.calendar_id);
    }
  }
  file.calendars = Array.from(byId.values());
  await savePersistFile(file);
}

export async function softDeleteCalendar(calendar_id: ULID): Promise<void> {
  const file = await loadPersistFile();
  file.calendars = file.calendars.filter(c => c.calendar_id !== calendar_id);

  // 紐づくイベントも削除（tombstoneへ）
  const relatedEventIds = Object.values(file.events)
    .filter(ev => ev.calendar_id === calendar_id)
    .map(ev => ev.event_id);

  for (const id of relatedEventIds) {
    delete file.events[id];
    if (!file.deleted_event_ids.includes(id)) file.deleted_event_ids.push(id);
  }

  // カレンダーのtombstone
  if (!file.deleted_calendar_ids) file.deleted_calendar_ids = [];
  if (!file.deleted_calendar_ids.includes(calendar_id)) {
    file.deleted_calendar_ids.push(calendar_id);
  }

  await savePersistFile(file);
}

export async function getAllCalendars(): Promise<Calendar[]> {
  const file = await loadPersistFile();
  return file.calendars;
}

export async function getCalendar(calendar_id: ULID): Promise<Calendar | undefined> {
  const file = await loadPersistFile();
  return file.calendars.find(c => c.calendar_id === calendar_id);
}

/** =========================
 * イベント CRUD / 取得
 * ========================= */
export async function upsertEvent(ev: Event): Promise<void> {
  const file = await loadPersistFile();
  file.events[ev.event_id] = ev;
  // tombstone から消す
  file.deleted_event_ids = file.deleted_event_ids.filter(id => id !== ev.event_id);
  await savePersistFile(file);
}

export async function upsertEvents(list: Event[]): Promise<void> {
  const file = await loadPersistFile();
  for (const ev of list) {
    file.events[ev.event_id] = ev;
    file.deleted_event_ids = file.deleted_event_ids.filter(id => id !== ev.event_id);
  }
  await savePersistFile(file);
}

export async function softDeleteEvent(event_id: ULID): Promise<void> {
  const file = await loadPersistFile();
  delete file.events[event_id];
  if (!file.deleted_event_ids.includes(event_id)) {
    file.deleted_event_ids.push(event_id);
  }
  await savePersistFile(file);
}

export async function getAllEvents(): Promise<Event[]> {
  const file = await loadPersistFile();
  return Object.values(file.events);
}

export async function getEvent(event_id: ULID): Promise<Event | undefined> {
  const file = await loadPersistFile();
  return file.events[event_id];
}

export async function getEventsByCalendar(calendar_id: ULID): Promise<Event[]> {
  const file = await loadPersistFile();
  return Object.values(file.events).filter(ev => ev.calendar_id === calendar_id);
}

/** 期間でざっくり抽出（UTC ISO文字列で比較） */
export async function getEventsByRange(rangeStartISO: ISO8601, rangeEndISO: ISO8601): Promise<Event[]> {
  const file = await loadPersistFile();
  const s = Date.parse(rangeStartISO);
  const e = Date.parse(rangeEndISO);
  return Object.values(file.events).filter(ev => {
    const a = Date.parse(ev.start_at);
    const b = Date.parse(ev.end_at);
    return !(b <= s || e <= a); // 交差していれば採用
  });
}

/** =========================
 * Instances キャッシュ
 * ========================= */
export async function replaceInstances(instances: EventInstance[]): Promise<void> {
  const file = await loadPersistFile();
  file.instances = instances.slice();
  await savePersistFile(file);
}

export async function appendInstances(instances: EventInstance[]): Promise<void> {
  const file = await loadPersistFile();
  file.instances.push(...instances);
  await savePersistFile(file);
}

export async function getAllInstances(): Promise<EventInstance[]> {
  const file = await loadPersistFile();
  return file.instances;
}

export async function getInstancesByRange(rangeStartISO: ISO8601, rangeEndISO: ISO8601): Promise<EventInstance[]> {
  const file = await loadPersistFile();
  const s = Date.parse(rangeStartISO);
  const e = Date.parse(rangeEndISO);
  return file.instances.filter(ins => {
    const a = Date.parse(ins.start_at);
    const b = Date.parse(ins.end_at);
    return !(b <= s || e <= a);
  });
}

/** =========================
 * 同期メタ
 * ========================= */
export async function getSyncMeta(): Promise<SyncMeta> {
  const file = await loadPersistFile();
  return file.sync;
}

export async function setSyncMeta(next: Partial<SyncMeta>): Promise<void> {
  const file = await loadPersistFile();
  file.sync = { ...file.sync, ...next };
  await savePersistFile(file);
}

/** =========================
 * インポート/エクスポート
 * ========================= */
export async function exportJson(): Promise<string> {
  const file = await loadPersistFile();
  return JSON.stringify(file, null, 2);
}

export async function importJson(json: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }
  const normalized = normalizeToPersistFile(parsed);
  await savePersistFile(normalized);
}

/** =========================
 * サーバ差分の簡易マージ
 * ========================= */
export async function mergeServerDelta(params: {
  upserts?: Event[];
  deletes?: ULID[];
  cursor?: string | null;
  instances?: EventInstance[]; // サーバが instances を返すなら差し替え
}): Promise<void> {
  const file = await loadPersistFile();

  if (params.upserts?.length) {
    for (const ev of params.upserts) {
      file.events[ev.event_id] = ev;
      file.deleted_event_ids = file.deleted_event_ids.filter(id => id !== ev.event_id);
    }
  }

  if (params.deletes?.length) {
    for (const id of params.deletes) {
      delete file.events[id];
      if (!file.deleted_event_ids.includes(id)) file.deleted_event_ids.push(id);
    }
  }

  if (params.instances) {
    // 受け取り側も型を保証（ここで万一 string が来ても弾く）
    file.instances = params.instances
      .map((x) => {
        const id = coerceInstanceId((x as any).instance_id);
        if (id === undefined) return undefined;
        return { ...x, instance_id: id } as EventInstance;
      })
      .filter((x): x is EventInstance => !!x);
  }

  if (params.cursor !== undefined) {
    file.sync.cursor = params.cursor;
  }
  file.sync.last_synced_at = new Date().toISOString();

  await savePersistFile(file);
}

/** =========================
 * メンテナンス（任意）
 * ========================= */
export async function compact(options?: { dropEventTombstones?: boolean; dropCalendarTombstones?: boolean }) {
  const file = await loadPersistFile();
  if (options?.dropEventTombstones) file.deleted_event_ids = [];
  if (options?.dropCalendarTombstones && file.deleted_calendar_ids) file.deleted_calendar_ids = [];
  await savePersistFile(file);
}
