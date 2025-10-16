// src/store/db.ts
// ===============================================
// ローカルDB + ローカル永続化（snapshot / ops.ndjson）
// - createEventLocal: 1件のイベント作成→ローカルDB反映＆永続化
// - createEventLocalAndShard: ↑に加えて月シャードへもライトスルー
// - replaceAllInstances: メモリDBを丸ごと差し替え
// - listInstancesByDate: 日付での可視インスタンス抽出（ローカルTZ日境界）
// - getAllTags: タグ一覧
// - 購読イベント: subscribeDb / unsubscribeDb / emit
// ===============================================

import dayjs from '../lib/dayjs';
import type { EventInstance, Event, ULID } from '../api/types';
import { startOfLocalDay, endOfLocalDay } from '../utils/time';
import { loadLocalStore, saveLocalStore, appendOps } from './localFile.ts';
// 月シャードAPI（新パス統一）
import { upsertMonthInstances, getMonthInstances } from '../data/persistence/monthShard';

// ====== ULID 生成（Crockford Base32）======
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

// ====== メモリ保持（画面の高速応答 & シンプル化）======
let instances: EventInstance[] = [];
let tagsSet = new Set<string>(); // タグ集合（重複排除）

// 起動時にローカルスナップショットから復元（非同期で許容）
(async () => {
  try {
    const storeAny: any = await loadLocalStore();
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

// ====== 購読管理 ======
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

// 指定日の“可視インスタンス”を取得（ローカル日境界 00:00〜23:59:59）
export function listInstancesByDate(dateISO: string): EventInstance[] {
  const key = dayjs(dateISO).format('YYYY-MM-DD');
  const cached = byDateCache.get(key);
  if (cached) return cached;

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

// ====== CreateEventInput（必要最小限）======
export type CreateEventInput = {
  // 必須
  title: string;
  start_at: string; // ISO（TZ付き/なしOK）
  end_at: string;

  // 任意
  calendar_id?: string;      // 既定: 'CAL_LOCAL_DEFAULT'
  summary?: string | null;   // description は summary で代替
  visibility?: Event['visibility'];

  // UI向けプロパティ（保存対象は任意）
  color?: string;
  style?: { tags?: string[] };
  tz?: string;
};

// Event -> 単発の EventInstance（繰り返しは別途）
function eventToSingleInstance(ev: Event): EventInstance {
  return {
    instance_id: Date.now(), // 一時的ユニークID（必要なら後で廃止可）
    calendar_id: ev.calendar_id,
    event_id: ev.event_id,        // 確定前は cid_ulid と同値
    cid_ulid: ev.cid_ulid ?? null,
    title: ev.title,
    start_at: ev.start_at,
    end_at: ev.end_at,
    occurrence_key: `${ev.event_id}@@${ev.start_at}`, // ユニーク判定用
  };
}

// タグの upsert（ローカル保存にも反映）
async function upsertTagsToStore(newTags: string[]) {
  if (!newTags?.length) return;
  newTags.forEach((t) => {
    const s = String(t).trim();
    if (s) tagsSet.add(s);
  });
  try {
    const storeAny: any = await loadLocalStore();
    const nextTags = Array.from(tagsSet);
    storeAny.tags = nextTags;
    storeAny._tags = nextTags;
    await saveLocalStore(storeAny);
  } catch {}
}

// ====== 作成→ローカル保存（cid_ulid 付与） ======
export async function createEventLocal(input: CreateEventInput): Promise<EventInstance> {
  const nowIso = new Date().toISOString();

  // ★ 一時IDを発行（オフライン作成時の冪等キー）
  const cid = ulid();

  const ev: Event = {
    event_id: cid,                 // 確定前は cid を event_id に仮セット
    cid_ulid: cid,                 // 一時ID保持（同期で置換キーに使う）
    calendar_id: (input.calendar_id ?? 'CAL_LOCAL_DEFAULT') as ULID,
    title: input.title.trim(),
    summary: input.summary ?? null,
    start_at: input.start_at,
    end_at: input.end_at,
    visibility: input.visibility ?? 'private',
  };

  const inst = eventToSingleInstance(ev);

  // メモリDBに反映
  instances = [...instances, inst];
  clearByDateCache();
  emitDbChanged();

  // タグの永続化（style.tags）
  const incomingTags = input.style?.tags ?? [];
  if (incomingTags.length) upsertTagsToStore(incomingTags);

  // ローカル保存（スナップショット + ops 追記）
  (async () => {
    try {
      const storeAny: any = await loadLocalStore();
      if (!Array.isArray(storeAny.instances)) storeAny.instances = [];

      const i = storeAny.instances.findIndex((r: EventInstance) => r.instance_id === inst.instance_id);
      if (i >= 0) storeAny.instances[i] = inst;
      else storeAny.instances.push(inst);

      // 併せて tags も永続側に同期
      const currentTags: string[] = Array.isArray(storeAny.tags) ? storeAny.tags : [];
      const merged = new Set<string>(currentTags);
      incomingTags.forEach((t) => { const s = String(t).trim(); if (s) merged.add(s); });
      storeAny.tags = Array.from(merged);
      storeAny._tags = storeAny.tags;

      await saveLocalStore(storeAny);

      // ★ ops にも cid_ulid を含めて記録（冪等・置換用）
      await appendOps([{ type: 'upsert', entity: 'instance', row: { ...inst, cid_ulid: cid }, updated_at: nowIso }]);
    } catch (e) {
      if (__DEV__) console.warn('[createEventLocal] persist failed:', e);
    }
  })();

  return inst;
}

// ====== 追加：作成時に“月シャードへもライトスルー” ======

// インスタンスの一意キー（occurrence_key > instance_id > event_id+start_at）
function getInstanceKey(x: Pick<EventInstance, 'instance_id' | 'event_id' | 'start_at' | 'occurrence_key' | 'cid_ulid'>) {
  return (x as any).occurrence_key ?? (x as any).instance_id ?? `${x.event_id}@@${x.start_at}`;
}

// 既存＋追加をユニーク結合
function mergeUniqueByKey(existing: EventInstance[], add: EventInstance[]) {
  const m = new Map<string, EventInstance>();
  for (const r of existing) m.set(getInstanceKey(r), r);
  for (const r of add) m.set(getInstanceKey(r), r);
  return Array.from(m.values());
}

/**
 * C対応の公開API：
 * “ローカル作成（従来）”に加えて、該当月のシャードへも即反映します。
 * 画面側は createEventLocal の代わりにこちらを呼んでください。
 */
export async function createEventLocalAndShard(input: CreateEventInput): Promise<EventInstance> {
  // 1) まずローカルDB & 永続化
  const inst = await createEventLocal(input);

  // 2) 対象月（YYYY-MM）を算出（start_at 基準）
  const ym = dayjs(inst.start_at).format('YYYY-MM');

  try {
    // 3) 既存の月配列を取得（なければ空配列）
    const current = (await getMonthInstances(ym)) ?? [];

    // 4) 今回作成分をマージして upsert
    const merged = mergeUniqueByKey(current, [inst]);
    await upsertMonthInstances(ym, merged);
  } catch (e) {
    if (__DEV__) console.warn('[createEventLocalAndShard] month upsert failed:', e);
    // 月シャード反映に失敗しても、作成自体は成功として返す
  }

  return inst;
}

// ====== スナップショット一括置換 ======
export function replaceAllInstances(next: EventInstance[]) {
  instances = [...next];
  clearByDateCache();
  emitDbChanged();
}

// ====== デバッグ／テスト補助 ======
export function getAllInstances(): EventInstance[] {
  return [...instances];
}
export function __clearAllInstancesForTest() {
  instances = [];
  clearByDateCache();
  emitDbChanged();
}

// ====== タグ一覧 ======
export function getAllTags(): string[] {
  return Array.from(tagsSet).sort((a, b) => a.localeCompare(b));
}
