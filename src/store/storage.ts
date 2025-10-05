// src/store/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

/** ====== 型（あなたの既存型に合わせてください） ====== */
export type ULID = string;
export type ISO8601 = string;

export type Event = {
  event_id: ULID;
  calendar_id: ULID;
  title: string;
  description: string | null;
  is_all_day: boolean;
  tz: string | null;          // 例: "Asia/Tokyo"
  start_at: ISO8601;          // UTC ISO
  end_at: ISO8601;            // UTC ISO
  visibility: 'inherit' | 'private' | 'org' | 'public';
};

export type EventInstance = {
  instance_id: number | string;
  calendar_id: ULID;
  event_id: ULID;
  title: string;
  start_at: ISO8601;          // UTC ISO
  end_at: ISO8601;            // UTC ISO
  color?: string | null;
};

/** サーバ同期のためのメタ */
export type SyncMeta = {
  /** 差分APIの続きから取るためのカーソルやEtag等 */
  cursor: string | null;
  /** 最終同期時刻(UTC ISO) */
  last_synced_at: ISO8601 | null;
};

/** 保存ファイル全体の形（バージョン付き） */
export type PersistFile = {
  version: 1;
  calendars: Array<{ calendar_id: ULID; name: string; color?: string | null; tz?: string | null; visibility?: string }>;
  events: Record<ULID, Event>;                 // イベント本体（event_id→Event）
  instances: EventInstance[];                  // 表示用インスタンスのキャッシュ（任意）
  deleted_event_ids: ULID[];                   // 削除トゥームストーン（同期向け）
  sync: SyncMeta;
};

/** ====== ストレージキー ====== */
const KEY = 'calect.persist.v1';

/** ====== 既定の空ファイル ====== */
const emptyFile = (): PersistFile => ({
  version: 1,
  calendars: [],
  events: {},
  instances: [],
  deleted_event_ids: [],
  sync: { cursor: null, last_synced_at: null },
});

/** ====== 基本I/O ====== */
export async function loadPersistFile(): Promise<PersistFile> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return emptyFile();
  try {
    const obj = JSON.parse(raw) as PersistFile;
    // 将来のために簡単なマイグレーションフック
    if (!('version' in obj)) return emptyFile();
    return obj;
  } catch {
    // 壊れていたら作り直す
    return emptyFile();
  }
}

/** まとめて保存（小規模なので JSON 丸ごとでOK） */
export async function savePersistFile(next: PersistFile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

/** 全消去（テスト用） */
export async function resetPersistFile(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** ====== 高レベルAPI：イベントCRUD ====== */

/** 新規イベントを追加（同時に instances へも反映したい場合は caller で追加） */
export async function upsertEvent(ev: Event): Promise<void> {
  const file = await loadPersistFile();
  file.events[ev.event_id] = ev;
  // tombstone に入っていたら除去
  file.deleted_event_ids = file.deleted_event_ids.filter(id => id !== ev.event_id);
  await savePersistFile(file);
}

/** 複数 upsert（サーバ差分適用など） */
export async function upsertEvents(list: Event[]): Promise<void> {
  const file = await loadPersistFile();
  for (const ev of list) {
    file.events[ev.event_id] = ev;
    file.deleted_event_ids = file.deleted_event_ids.filter(id => id !== ev.event_id);
  }
  await savePersistFile(file);
}

/** 物理削除はせず tombstone 記録（サーバと突き合わせるため） */
export async function softDeleteEvent(event_id: ULID): Promise<void> {
  const file = await loadPersistFile();
  delete file.events[event_id];
  if (!file.deleted_event_ids.includes(event_id)) {
    file.deleted_event_ids.push(event_id);
  }
  await savePersistFile(file);
}

/** すべてのイベント（Map風に返す） */
export async function getAllEvents(): Promise<Event[]> {
  const file = await loadPersistFile();
  return Object.values(file.events);
}

/** 1件取得 */
export async function getEvent(event_id: ULID): Promise<Event | undefined> {
  const file = await loadPersistFile();
  return file.events[event_id];
}

/** ====== Instances キャッシュ ======
 * 大量に毎回計算するのが重い場合、サーバから受け取ったフラットな Instance を
 * そのままキャッシュしておく運用もできます。
 */
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

/** ====== 同期メタ ====== */
export async function getSyncMeta(): Promise<SyncMeta> {
  const file = await loadPersistFile();
  return file.sync;
}

export async function setSyncMeta(next: Partial<SyncMeta>): Promise<void> {
  const file = await loadPersistFile();
  file.sync = { ...file.sync, ...next };
  await savePersistFile(file);
}

/** ====== インポート/エクスポート ====== */
export async function exportJson(): Promise<string> {
  const file = await loadPersistFile();
  return JSON.stringify(file, null, 2);
}

export async function importJson(json: string): Promise<void> {
  const obj = JSON.parse(json) as PersistFile;
  if (!obj || typeof obj !== 'object') throw new Error('Invalid file');
  await savePersistFile(obj);
}

/** ====== サーバ差分の簡易マージ例 ======
 * - upserts: サーバから届いた新規/更新
 * - deletes: サーバから届いた削除ID
 * - cursor:  次回差分のカーソル
 */
export async function mergeServerDelta(params: {
  upserts?: Event[];
  deletes?: ULID[];
  cursor?: string | null;
  instances?: EventInstance[];  // サーバが instances を返すなら一気に差し替え
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
    file.instances = params.instances.slice();
  }

  if (params.cursor !== undefined) {
    file.sync.cursor = params.cursor;
  }
  file.sync.last_synced_at = new Date().toISOString();

  await savePersistFile(file);
}
