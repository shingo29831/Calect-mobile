// src/store/db.ts
// ===============================================
// 単純メモリDB + ローカル保存（snapshot / ops.ndjson）
// - createEventLocal: 追加直後に非同期でローカル保存
// - replaceAllInstances: 同期などでインメモリを丸ごと差し替え
// - listInstancesByDate: 指定日のインスタンスを取得
// - 変更通知: subscribeDb / unsubscribeDb / emit
// ===============================================

import dayjs from '../lib/dayjs';
import type { EventInstance, Event, ULID } from '../api/types';
import { startOfLocalDay, endOfLocalDay } from '../utils/time';
import { loadLocalStore, saveLocalStore, appendOps } from './localFile';

// ====== ULID 生成（Event.event_id 用） ======
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function makeUlid(len = 26): ULID {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out as ULID;
}

// ====== instance_id（number）生成器（同ミリ秒でも一意化） ======
let __lastMs = 0;
let __seq = 0;
function makeInstanceId(): number {
  const now = Date.now();
  if (now === __lastMs) {
    __seq++;
  } else {
    __lastMs = now;
    __seq = 0;
  }
  // 同一ms内で最大1000件まで確実にユニーク（ms * 1000 + seq）
  return now * 1000 + __seq;
}

// ====== メモリ上のインスタンス配列 ======
let instances: EventInstance[] = [];

// ====== 変更通知（購読） ======
type Listener = () => void;
const listeners = new Set<Listener>();
function emitDbChanged() {
  for (const l of [...listeners]) { try { l(); } catch {} }
}
export function subscribeDb(cb: Listener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function unsubscribeDb(cb: Listener) {
  listeners.delete(cb);
}

// ====== 日別キャッシュ ======
const byDateCache = new Map<string, EventInstance[]>();
function clearByDateCache() { byDateCache.clear(); }

// 指定日のインスタンス列挙（ローカル日の 00:00〜23:59:59 に少しでもかかるもの）
export function listInstancesByDate(dateISO: string): EventInstance[] {
  const key = dayjs(dateISO).format('YYYY-MM-DD');
  const cached = byDateCache.get(key);
  if (cached) return cached;

  const start = startOfLocalDay(dateISO);
  const end = endOfLocalDay(dateISO);
  const sMs = dayjs(start).valueOf();
  const eMs = dayjs(end).valueOf();

  const rows = instances.filter((ins) => {
    const a = dayjs(ins.start_at).valueOf();
    const b = dayjs(ins.end_at).valueOf();
    return !(b < sMs || a > eMs); // 1msでも重なれば含める
  });

  byDateCache.set(key, rows);
  return rows;
}

// ====== Event -> 最小 EventInstance（単発用） ======
function eventToSingleInstance(ev: Event): EventInstance {
  return {
    instance_id: makeInstanceId(),           // number に統一（types.ts v2）
    event_id: ev.event_id,
    calendar_id: ev.calendar_id,
    title: ev.title,
    start_at: ev.start_at,
    end_at: ev.end_at,
  };
}

// ====== 公開API：イベント追加（ローカル保存も行う） ======
export type CreateEventInput = {
  // 必須（UIから来る最小情報）
  title: string;
  start_at: string; // ISO
  end_at: string;   // ISO
  // 任意（省略時は安全なデフォルト）
  calendar_id?: string;          // 既定: 'CAL_LOCAL_DEFAULT'
  is_all_day?: boolean;          // 既定: false
  tz?: string;                   // 既定: 'Asia/Tokyo'
  visibility?: Event['visibility']; // 既定: 'private'
};

export async function createEventLocal(input: CreateEventInput): Promise<EventInstance> {
  const nowIso = new Date().toISOString();

  // types.ts v2 の Event 必須項目をすべて満たす（最小 & デフォルト埋め）
  const ev: Event = {
    event_id: makeUlid(),
    calendar_id: (input.calendar_id ?? 'CAL_LOCAL_DEFAULT') as ULID,
    title: input.title,
    description: null,
    is_all_day: !!input.is_all_day,
    tz: input.tz ?? 'Asia/Tokyo',
    start_at: input.start_at,
    end_at: input.end_at,
    visibility: input.visibility ?? 'private',
  };

  const inst = eventToSingleInstance(ev);

  // メモリへ反映
  instances.push(inst);
  clearByDateCache();
  emitDbChanged();

  // === 非同期でローカル保存（snapshot + ops） ===
  (async () => {
    try {
      const store = await loadLocalStore();
      const i = store.instances.findIndex(r => r.instance_id === inst.instance_id);
      if (i >= 0) store.instances[i] = inst;
      else store.instances.push(inst);

      await saveLocalStore(store);

      await appendOps([
        { type: 'upsert', entity: 'instance', row: inst, updated_at: nowIso }
      ]);
    } catch (e) {
      if (__DEV__) console.warn('[createEventLocal] persist failed:', e);
    }
  })();

  return inst;
}

// ====== 公開API：インメモリ差し替え（同期時など） ======
export function replaceAllInstances(next: EventInstance[]) {
  instances = [...next];
  clearByDateCache();
  emitDbChanged();
}

// ====== 便利関数：全件取得・クリア（デバッグ用） ======
export function getAllInstances(): EventInstance[] {
  return [...instances];
}
export function __clearAllInstancesForTest() {
  instances = [];
  clearByDateCache();
  emitDbChanged();
}
