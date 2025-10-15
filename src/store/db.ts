// src/store/db.ts
// ===============================================
// 単純メモリDB + ローカル保存（snapshot / ops.ndjson）
// - createEventLocal: 追加直後に非同期でローカル保存（タグも永続化）
// - replaceAllInstances: 同期などでインメモリを丸ごと差し替え
// - listInstancesByDate: 指定日のインスタンスを取得（ローカル日）
// - getAllTags: 既存タグ一覧を取得（永続化）
// - 変更通知: subscribeDb / unsubscribeDb / emit
// ===============================================

import dayjs from '../lib/dayjs';
import type { EventInstance, Event, ULID } from '../api/types';
import { startOfLocalDay, endOfLocalDay } from '../utils/time';
import { loadLocalStore, saveLocalStore, appendOps } from './localFile';

// ====== ULID 生成（Event.event_id 用：Crockford Base32, 長さ26） ======
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulid(now = Date.now()): ULID {
  let ts = now;
  const timeChars = Array(10)
    .fill(0)
    .map(() => {
      const mod = ts % 32;
      ts = Math.floor(ts / 32);
      return ALPHABET[mod];
    })
    .reverse()
    .join('');
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += ALPHABET[(Math.random() * 32) | 0];
  }
  return (timeChars + rand) as ULID;
}

// ====== メモリ保持（既存UI互換：インスタンス配列 & タグ） ======
let instances: EventInstance[] = [];
let tagsSet = new Set<string>(); // 既存タグ（永続化）

// 初期ロード（存在すれば）
(async () => {
  try {
    const storeAny: any = await loadLocalStore(); // any で拡張フィールド(tags)を許容
    instances = Array.isArray(storeAny.instances) ? storeAny.instances : [];
    const tagsSrc: unknown[] =
      Array.isArray(storeAny.tags) ? storeAny.tags :
      Array.isArray(storeAny._tags) ? storeAny._tags : [];
    tagsSet = new Set<string>(tagsSrc.map((s: unknown) => String(s)));
  } catch {
    instances = [];
    tagsSet = new Set();
  }
})();

// ====== 変更通知 ======
type Listener = () => void;
const listeners = new Set<Listener>();
function emitDbChanged() {
  listeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}
export function subscribeDb(cb: Listener) {
  listeners.add(cb);
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

  // number(ms) に正規化してから比較
  const start = dayjs(startOfLocalDay(dateISO)).valueOf();
  const end   = dayjs(endOfLocalDay(dateISO)).valueOf();

  const out = instances.filter((it) => {
    const a = dayjs(it.start_at).valueOf();
    const b = dayjs(it.end_at).valueOf();
    return !(b < start || a > end);
  });

  byDateCache.set(key, out);
  return out;
}

// ====== CreateEventInput（UIからの入力型） ======
export type CreateEventInput = {
  // 必須
  title: string;
  start_at: string; // ISO（ローカルTZを含むフォーマットでOK）
  end_at: string;

  // 任意
  calendar_id?: string;      // 既定: 'CAL_LOCAL_DEFAULT'
  summary?: string | null;   // descriptionは廃止。summaryで統一
  // location / all_day はUI側で処理し、保存はしない
  visibility?: Event['visibility'];

  // UI拡張（永続化は tags のみ）
  color?: string;
  style?: { tags?: string[] };
  // tz は UI 専用（Event 型に無いので保存しない）
  tz?: string;
};

// Event -> 既存UI互換の単一インスタンスへ展開
function eventToSingleInstance(ev: Event): EventInstance {
  return {
    instance_id: Date.now(), // 簡易一意（同ms多重はごく稀）
    calendar_id: ev.calendar_id,
    event_id: ev.event_id,
    title: ev.title,
    start_at: ev.start_at,
    end_at: ev.end_at,
  };
}

// 既存タグを更新して永続化
async function upsertTagsToStore(newTags: string[]) {
  if (!newTags?.length) return;
  newTags.forEach((t) => {
    const s = String(t).trim();
    if (s) tagsSet.add(s);
  });
  try {
    const storeAny: any = await loadLocalStore();
    const nextTags = Array.from(tagsSet);
    // 互換のため両方に書く（将来スキーマで正式化するまで）
    storeAny.tags = nextTags;
    storeAny._tags = nextTags;
    await saveLocalStore(storeAny);
  } catch {}
}

// ====== 追加（ローカルDB＆ファイルへ） ======
export async function createEventLocal(input: CreateEventInput): Promise<EventInstance> {
  const nowIso = new Date().toISOString();

  const ev: Event = {
    event_id: ulid(),
    calendar_id: (input.calendar_id ?? 'CAL_LOCAL_DEFAULT') as ULID,
    title: input.title.trim(),
    summary: input.summary ?? null,
    start_at: input.start_at,
    end_at: input.end_at,
    visibility: input.visibility ?? 'private',
    // tz / color / style は Event 型に無い可能性があるため保存しない
  };

  const inst = eventToSingleInstance(ev);

  // メモリに反映
  instances = [...instances, inst];
  clearByDateCache();
  emitDbChanged();

  // タグの永続化（style.tags のみ保存対象）
  const incomingTags = input.style?.tags ?? [];
  if (incomingTags.length) upsertTagsToStore(incomingTags);

  // 非同期で永続化（フルスナップショット＋差分ログ）
  (async () => {
    try {
      const storeAny: any = await loadLocalStore();
      if (!Array.isArray(storeAny.instances)) storeAny.instances = [];

      const i = storeAny.instances.findIndex((r: EventInstance) => r.instance_id === inst.instance_id);
      if (i >= 0) storeAny.instances[i] = inst;
      else storeAny.instances.push(inst);

      // 保険：同時に tags も反映
      const currentTags: string[] = Array.isArray(storeAny.tags) ? storeAny.tags : [];
      const merged = new Set<string>(currentTags);
      incomingTags.forEach((t) => { const s = String(t).trim(); if (s) merged.add(s); });
      storeAny.tags = Array.from(merged);
      storeAny._tags = storeAny.tags;

      await saveLocalStore(storeAny);
      await appendOps([{ type: 'upsert', entity: 'instance', row: inst, updated_at: nowIso }]);
    } catch (e) {
      if (__DEV__) console.warn('[createEventLocal] persist failed:', e);
    }
  })();

  return inst;
}

// ====== 同期などでインメモリを丸ごと差し替える ======
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

// ====== 既存タグの取得 ======
export function getAllTags(): string[] {
  return Array.from(tagsSet).sort((a, b) => a.localeCompare(b));
}
