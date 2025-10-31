// src/store/db.ts
// ===============================================
// ローカルDB + ローカル永続化（snapshot/instances.v1.json & ops/instances.ndjson）
// - createEventLocal: 1件のイベント作成→ローカルDB反映＆永続化
// - createEventLocalAndShard: ↑に加えて v2 月シャードへもライトスルー
// - updateEventLocalAndShard: 既存イベントを同一 event_id で上書き（重複防止）
// - deleteEventLocal: event_id でまとめて削除（ローカル）
// - deleteEventLocalAndShard: ↑に加えて v2 月シャードへも削除反映（ベストエフォート）
// - deleteEventLocalByOccurrence: 単一発生日（occurrence）だけ削除（ローカル）
// - replaceAllInstances: メモリDBを丸ごと差し替え
// - listInstancesByDate: 日付での可視インスタンス抽出（ローカルTZ日境界）
// - getAllTags: タグ一覧（※タグの掃除は安全のため自動では行わない）
// - 購読イベント: subscribeDb / unsubscribeDb / emit
// ===============================================

import dayjs from '../lib/dayjs';
import type { EventInstance, Event, ULID, HexColor } from '../api/types';
import { startOfLocalDay, endOfLocalDay } from '../utils/time';

// 低レベルなファイルI/O
import { readFile, writeFile } from './localFile';

// v2 月シャード反映
import { upsertEventV2 } from '../data/persistence/monthShard';

// ====== 永続ファイル（インスタンス/タグ用・アプリ内専用）======
const SNAPSHOT_INST_PATH = 'snapshot/instances.v1.json';
const OPS_LOG_PATH = 'ops/instances.ndjson';

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
  for (let i = 0; i < 16; i++) rand += ALPHABET[(Math.random() * 32) | 0];
  return (timeChars + rand) as ULID;
}

// ====== ローカル永続の軽ラッパ ======
type LocalSnapshot = {
  instances: EventInstance[];
  tags: string[];
};

async function loadLocalSnapshot(): Promise<LocalSnapshot> {
  try {
    const raw = await readFile(SNAPSHOT_INST_PATH);
    const obj = JSON.parse(raw);
    const instances = Array.isArray(obj?.instances) ? (obj.instances as EventInstance[]) : [];
    const tagsSrc = Array.isArray(obj?.tags) ? obj.tags : [];
    const tags = tagsSrc.map(String);
    return { instances, tags };
  } catch {
    return { instances: [], tags: [] };
  }
}

async function saveLocalSnapshot(next: LocalSnapshot): Promise<void> {
  const payload: LocalSnapshot = {
    instances: Array.isArray(next.instances) ? next.instances : [],
    tags: Array.isArray(next.tags) ? next.tags : [],
  };
  await writeFile(SNAPSHOT_INST_PATH, JSON.stringify(payload));
}

async function persistSnapshot(): Promise<void> {
  await saveLocalSnapshot({ instances, tags: Array.from(tagsSet) });
}

async function appendOps(rows: any[]): Promise<void> {
  try {
    const now = new Date().toISOString();
    const lines = rows.map((r) => JSON.stringify({ ...r, _logged_at: now })).join('\n') + '\n';
    let prev = '';
    try { prev = await readFile(OPS_LOG_PATH); } catch { /* 初回 */ }
    await writeFile(OPS_LOG_PATH, prev + lines);
  } catch {
    /* noop（ログは任意） */
  }
}

// ====== メモリ保持（画面の高速応答 & シンプル化）======
let instances: EventInstance[] = [];
let tagsSet = new Set<string>(); // タグ集合（重複排除）

// 起動時にローカルスナップショットから復元（非同期で許容）
(async () => {
  try {
    const store = await loadLocalSnapshot();
    instances = Array.isArray(store.instances) ? store.instances : [];
    tagsSet = new Set<string>((store.tags ?? []).map(String));
  } catch {
    instances = [];
    tagsSet = new Set();
  }
})();

// ====== 購読管理 ======
type Listener = () => void;
const listeners = new Set<Listener>();
function emitDbChanged() {
  listeners.forEach((cb) => { try { cb(); } catch {} });
}
export function subscribeDb(cb: Listener) { listeners.add(cb); }
export function unsubscribeDb(cb: Listener) { listeners.delete(cb); }
export const emitInstancesChanged = () => emitDbChanged();

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
    const a = dayjs(it.dtstart).valueOf();
    const b = dayjs(it.dtend).valueOf();
    return !(b < start || a > end);
  });

  byDateCache.set(key, out);
  return out;
}

// ====== CreateEventInput / UpdateEventInput ======
export type CreateEventInput = {
  calendar_id?: string;      // 既定: 'CAL_LOCAL_DEFAULT'
  title: string;
  summary?: string | null;

  rrule?: string; // RFC5545
  start_at: string; // "HH:mm"
  end_at: string;   // "HH:mm"
  dtstart: string;  // "YYYY-MM-DD"
  dtend: string;    // "YYYY-MM-DD"
  tz?: string;

  // UI向けプロパティ
  color?: HexColor;
  tags?: string[];
  visibility?: Event['visibility'];
  priority?: Event['priority'];
  style?: {  };
};

export type UpdateEventInput = CreateEventInput & {
  event_id: string; // 既存イベントIDを維持して上書き
};

// ====== ヘルパ：ローカル upsert / 削除 ======
function makeOccurrenceKey(evId: string, dtstart: string) {
  return `${evId}@@${dtstart}`;
}

function upsertLocal(next: EventInstance) {
  const key = next.occurrence_key ?? makeOccurrenceKey(next.event_id, next.dtstart);
  let replaced = false;
  instances = instances.map((row) => {
    const rowKey = row.occurrence_key ?? makeOccurrenceKey(row.event_id, row.dtstart);
    if (rowKey === key) {
      replaced = true;
      return { ...row, ...next };
    }
    return row;
  });
  if (!replaced) instances = [...instances, next];

  clearByDateCache();
  emitDbChanged();
}

// タグの upsert（ローカル保存にも反映）
async function upsertTagsToStore(newTags: string[]) {
  if (!newTags?.length) return;
  newTags.forEach((t) => {
    const s = String(t).trim();
    if (s) tagsSet.add(s);
  });
  try {
    await persistSnapshot();
  } catch {/* noop */}
}

// ====== Event -> 単発の EventInstance（繰り返しは別途） ======
function eventToSingleInstance(ev: Event): EventInstance {
  return {
    instance_id: Date.now(), // 簡易一意
    event_id: ev.event_id,
    cid_ulid: (ev as any).cid_ulid ?? ev.event_id,
    calendar_id: ev.calendar_id,
    title: ev.title,
    summary: ev.summary ?? null,
    start_at: ev.start_at,
    end_at: ev.end_at,
    dtstart: ev.dtstart,
    dtend: ev.dtend,
    tags: (ev.tags as any) ?? [],
    color: ev.color,
    visibility: ev.visibility,
    occurrence_key: makeOccurrenceKey(ev.event_id, ev.dtstart),
  } as any;
}

// ====== 作成→ローカル保存（cid_ulid 付与） ======
export async function createEventLocal(input: CreateEventInput): Promise<EventInstance> {
  const nowIso = new Date().toISOString();

  // 一時ID発行
  const cid = ulid();

  const ev: Event = {
    event_id: cid,                 // サーバ同期前は一時ID
    cid_ulid: cid,                 // 型に無いがローカル置換キーで使う
    calendar_id: (input.calendar_id ?? 'CAL_LOCAL_DEFAULT') as ULID,
    title: input.title.trim(),
    summary: input.summary ?? null,
    rrule: input.rrule ?? '',
    start_at: input.start_at,
    end_at: input.end_at,
    dtstart: input.dtstart,
    dtend: input.dtend,
    tz: input.tz ?? 'local',
    tags: (input.tags ?? []).map(String),
    color: input.color,
    visibility: (input.visibility as any) ?? 'Hidden',
    priority: input.priority ?? 'Normal',
  };

  const inst = eventToSingleInstance(ev);

  // メモリ upsert
  upsertLocal(inst);

  // タグ処理
  const incomingTags = (input.tags ?? []).map(String).filter(Boolean);
  if (incomingTags.length) upsertTagsToStore(incomingTags);

  // ローカル保存（スナップショット + ops 追記）
  (async () => {
    try {
      await persistSnapshot();
      await appendOps([
        { type: 'upsert', entity: 'instance', row: { ...inst, cid_ulid: cid }, updated_at: nowIso },
      ]);
    } catch (e) {
      if (__DEV__) console.warn('[createEventLocal] persist failed:', e);
    }
  })();

  return inst;
}

// ====== 追加：作成時に“v2 月シャードへもライトスルー” ======
export async function createEventLocalAndShard(input: CreateEventInput): Promise<EventInstance> {
  // まずローカルDB
  const inst = await createEventLocal(input);

  // v2イベント形式にして upsert（繰り返しなしの単発）
  try {
    const now = dayjs().toISOString();
    const tagObjs = (input.tags ?? [])
      .map(t => String(t).trim())
      .filter(Boolean)
      .map(tag_id => ({ tag_id }));

    await upsertEventV2({
      event_id: inst.event_id,
      title: input.title.trim(),
      summary: input.summary ?? '',

      rrule: input.rrule ?? 'NONE',
      start_at: input.start_at,
      end_at: input.end_at,
      dtstart: input.dtstart,
      dtend: input.dtend,
      tz: input.tz ?? 'local',

      color: input.color ?? null,

      calendar_links: [
        {
          link_id: ulid(),
          calendar_id: (input.calendar_id ?? 'CAL_LOCAL_DEFAULT') as ULID,
          content_visibility: (input.visibility as any) ?? 'Hidden',
          created_by: 'me',
          updated_at: now,
          deleted_at: null,
        },
      ],
      event_shares: [],
      link_token: null,
      priority: input.priority ?? 'Normal',
      overrides: [],
      tags: tagObjs,                // ← {tag_id}[]
      created_by: 'me',
      updated_by: 'me',
      updated_at: now,
    } as any);
  } catch (e) {
    if (__DEV__) console.warn('[createEventLocalAndShard] v2 upsert failed:', e);
    // 月シャード反映に失敗しても、作成自体は成功として返す
  }

  return inst;
}

// ====== 追加：更新（同じ event_id で上書き。二重登録を防止） ======
export async function updateEventLocalAndShard(input: UpdateEventInput): Promise<EventInstance> {
  const nowIso = new Date().toISOString();

  // 受け取り tags は string[] 想定
  const tagIds = Array.from(
    new Set((input.tags ?? []).map(t => String(t).trim()).filter(Boolean))
  );

  // ローカル側の置換対象 occurrence_key
  const occKey = makeOccurrenceKey(input.event_id, input.dtstart);

  // ローカル upsert 用インスタンス
  const inst: EventInstance = {
    instance_id: Date.now(),
    event_id: input.event_id,
    cid_ulid: input.event_id,
    calendar_id: (input.calendar_id ?? 'CAL_LOCAL_DEFAULT') as ULID,
    title: input.title.trim(),
    summary: input.summary ?? null,
    start_at: input.start_at,
    end_at: input.end_at,
    dtstart: input.dtstart,
    dtend: input.dtend,
    tags: tagIds,
    color: input.color ?? undefined,
    visibility: (input.visibility as any) ?? 'Hidden',
    occurrence_key: occKey,
  } as any;

  // メモリ upsert（occurrence_key 一致で置換）
  upsertLocal(inst);

  // タグも保存
  if (tagIds.length) await upsertTagsToStore(tagIds);

  // スナップショット & ndjson
  try {
    await persistSnapshot();
    await appendOps([
      { type: 'upsert', entity: 'instance', row: inst, updated_at: nowIso },
    ]);
  } catch (e) {
    if (__DEV__) console.warn('[updateEventLocalAndShard] persist failed:', e);
  }

  // 月シャード（V2）へも上書き
  try {
    const now = dayjs().toISOString();
    const tagObjs = tagIds.map(tag_id => ({ tag_id }));

    await upsertEventV2({
      event_id: input.event_id,
      title: input.title.trim(),
      summary: input.summary ?? '',

      rrule: input.rrule ?? 'NONE',
      start_at: input.start_at,
      end_at: input.end_at,
      dtstart: input.dtstart,
      dtend: input.dtend,
      tz: input.tz ?? 'local',

      color: input.color ?? null,

      calendar_links: [
        {
          // 既存 link_id を厳密に維持できなくても UI 影響は軽微。
          // 固定化したい場合は monthShard 側で既存を採番再利用。
          link_id: `${input.event_id}-link`,
          calendar_id: (input.calendar_id ?? 'CAL_LOCAL_DEFAULT') as ULID,
          content_visibility: (input.visibility as any) ?? 'Hidden',
          created_by: 'me',
          updated_at: now,
          deleted_at: null,
        },
      ],
      event_shares: [],
      link_token: null,
      priority: input.priority ?? 'Normal',
      overrides: [],
      tags: tagObjs,               // ← {tag_id}[]
      created_by: 'me',
      updated_by: 'me',
      updated_at: now,
    } as any);
  } catch (e) {
    if (__DEV__) console.warn('[updateEventLocalAndShard] v2 upsert failed:', e);
  }

  return inst;
}

// ====== 追加：削除（ローカル・全発生日まとめて） ======
export async function deleteEventLocal(event_id: string): Promise<number> {
  if (!event_id) return 0;

  const before = instances.length;
  const removed = instances.filter(r => r.event_id === event_id);
  instances = instances.filter(r => r.event_id !== event_id);

  clearByDateCache();
  emitDbChanged();

  const nowIso = new Date().toISOString();
  try {
    await persistSnapshot();
    // まとめて1行の delete ログ（必要に応じて occurrence_key を添付）
    await appendOps([
      {
        type: 'delete',
        entity: 'instance',
        where: { event_id, occurrence_keys: removed.map(r => r.occurrence_key ?? makeOccurrenceKey(r.event_id, r.dtstart)) },
        deleted_at: nowIso,
      },
    ]);
  } catch (e) {
    if (__DEV__) console.warn('[deleteEventLocal] persist failed:', e);
  }

  return before - instances.length;
}

// ====== 追加：削除（ローカル・単一 occurrence を指定） ======
export async function deleteEventLocalByOccurrence(event_id: string, dtstart: string): Promise<boolean> {
  if (!event_id || !dtstart) return false;

  const key = makeOccurrenceKey(event_id, dtstart);
  const before = instances.length;
  const target = instances.find(r => (r.occurrence_key ?? makeOccurrenceKey(r.event_id, r.dtstart)) === key);
  if (!target) return false;

  instances = instances.filter(r => (r.occurrence_key ?? makeOccurrenceKey(r.event_id, r.dtstart)) !== key);

  clearByDateCache();
  emitDbChanged();

  const nowIso = new Date().toISOString();
  try {
    await persistSnapshot();
    await appendOps([
      {
        type: 'delete',
        entity: 'instance',
        where: { event_id, occurrence_key: key },
        deleted_at: nowIso,
      },
    ]);
  } catch (e) {
    if (__DEV__) console.warn('[deleteEventLocalByOccurrence] persist failed:', e);
  }

  return before !== instances.length;
}

// ====== 追加：削除（v2 月シャードにも反映：ベストエフォート） ======
export async function deleteEventLocalAndShard(event_id: string): Promise<number> {
  // まずローカルを確実に削除
  const removedCount = await deleteEventLocal(event_id);

  // 月シャード側：全リンクを「論理削除」扱いで upsert
  // （※ monthShard 実装により物理削除 API があるならそちらを使ってOK）
  if (removedCount > 0) {
    try {
      const now = dayjs().toISOString();
      // 既知の情報が無いので最小限のイベント骨子で upsert → calendar_links.deleted_at を立てる
      await upsertEventV2({
        event_id,
        title: '',
        summary: '',
        rrule: 'NONE',
        start_at: '00:00',
        end_at: '00:00',
        dtstart: '1970-01-01',
        dtend: '1970-01-01',
        tz: 'local',
        color: null,
        calendar_links: [
          {
            link_id: `${event_id}-link`,
            calendar_id: 'CAL_LOCAL_DEFAULT' as ULID,
            content_visibility: 'Hidden',
            created_by: 'me',
            updated_at: now,
            deleted_at: now, // ← 論理削除
          },
        ],
        event_shares: [],
        link_token: null,
        priority: 'Normal',
        overrides: [],
        tags: [],
        created_by: 'me',
        updated_by: 'me',
        updated_at: now,
      } as any);
    } catch (e) {
      if (__DEV__) console.warn('[deleteEventLocalAndShard] v2 reflect failed:', e);
      // v2 反映に失敗してもローカル削除は完了扱い
    }
  }

  return removedCount;
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
