// src/store/db.ts
// ===============================================
// ローカルDB + ローカル永続化（snapshot/instances.v1.json & ops/instances.ndjson）
// - createEventLocal: 1件のイベント作成→ローカルDB反映＆永続化
// - createEventLocalAndShard: ↑に加えて v2 月シャードへもライトスルー
// - replaceAllInstances: メモリDBを丸ごと差し替え
// - listInstancesByDate: 日付での可視インスタンス抽出（ローカルTZ日境界）
// - getAllTags: タグ一覧
// - 購読イベント: subscribeDb / unsubscribeDb / emit
// ===============================================

import dayjs from '../lib/dayjs';
import type { EventInstance, Event, ULID } from '../api/types';
import { startOfLocalDay, endOfLocalDay } from '../utils/time';

// ★ 旧 localStore API は存在しないため、低レベルなファイルI/Oを直接利用
import { readFile, writeFile } from './localFile';

// ★ v2 月シャード反映
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
  _tags?: string[]; // 互換
};

async function loadLocalSnapshot(): Promise<LocalSnapshot> {
  try {
    const raw = await readFile(SNAPSHOT_INST_PATH);
    const obj = JSON.parse(raw);
    const instances = Array.isArray(obj?.instances) ? (obj.instances as EventInstance[]) : [];
    const tagsSrc: unknown[] =
      Array.isArray(obj?.tags) ? obj.tags :
      Array.isArray(obj?._tags) ? obj._tags : [];
    const tags = tagsSrc.map(String);
    return { instances, tags, _tags: tags };
  } catch {
    return { instances: [], tags: [], _tags: [] };
  }
}

async function saveLocalSnapshot(next: LocalSnapshot): Promise<void> {
  const payload: LocalSnapshot = {
    instances: Array.isArray(next.instances) ? next.instances : [],
    tags: Array.isArray(next.tags) ? next.tags : [],
    _tags: Array.isArray(next._tags) ? next._tags : Array.isArray(next.tags) ? next.tags : [],
  };
  await writeFile(SNAPSHOT_INST_PATH, JSON.stringify(payload));
}

async function appendOps(rows: any[]): Promise<void> {
  try {
    const now = new Date().toISOString();
    const lines = rows.map((r) => JSON.stringify({ ...r, _logged_at: now })).join('\n') + '\n';
    // 追記APIが無いので、既存を読んで足す
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
    cid_ulid: (ev as any).cid_ulid ?? null,
    title: ev.title,
    start_at: ev.start_at,
    end_at: ev.end_at,
    occurrence_key: `${ev.event_id}@@${ev.start_at}`, // ユニーク判定用
  } as any;
}

// タグの upsert（ローカル保存にも反映）
async function upsertTagsToStore(newTags: string[]) {
  if (!newTags?.length) return;
  newTags.forEach((t) => {
    const s = String(t).trim();
    if (s) tagsSet.add(s);
  });
  try {
    const current = await loadLocalSnapshot();
    const nextTags = Array.from(tagsSet);
    await saveLocalSnapshot({ ...current, tags: nextTags, _tags: nextTags });
  } catch {/* noop */}
}

// ====== 作成→ローカル保存（cid_ulid 付与） ======
export async function createEventLocal(input: CreateEventInput): Promise<EventInstance> {
  const nowIso = new Date().toISOString();

  // ★ 一時IDを発行（オフライン作成時の冪等キー）
  const cid = ulid();

  const ev: Event = {
    event_id: cid,                 // 確定前は cid を event_id に仮セット
    // @ts-expect-error: 既存UI向けの最小 Event 型を満たすため暫定で埋める
    is_all_day: false,
    tz: 'local',
    // ----
    // 型に無いがローカル置換キーで使う
    cid_ulid: cid,
    calendar_id: (input.calendar_id ?? 'CAL_LOCAL_DEFAULT') as ULID,
    title: input.title.trim(),
    summary: input.summary ?? null,
    start_at: input.start_at,
    end_at: input.end_at,
    visibility: (input.visibility as any) ?? 'private',
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
      const store = await loadLocalSnapshot();
      const list = Array.isArray(store.instances) ? [...store.instances] : [];
      const i = list.findIndex((r) => (r as any).instance_id === inst.instance_id);
      if (i >= 0) list[i] = inst;
      else list.push(inst);

      const currentTags: string[] = Array.isArray(store.tags) ? store.tags : [];
      const merged = new Set<string>(currentTags);
      for (const t of incomingTags) { const s = String(t).trim(); if (s) merged.add(s); }

      await saveLocalSnapshot({ instances: list, tags: Array.from(merged), _tags: Array.from(merged) });

      // ops ログに冪等キー（cid_ulid）付きで残す
      await appendOps([{ type: 'upsert', entity: 'instance', row: { ...inst, cid_ulid: cid }, updated_at: nowIso }]);
    } catch (e) {
      if (__DEV__) console.warn('[createEventLocal] persist failed:', e);
    }
  })();

  return inst;
}

// ====== 追加：作成時に“v2 月シャードへもライトスルー” ======

/**
 * 公開API：
 * “ローカル作成（従来）”に加えて、v2 月シャードへも即反映します。
 * 画面側は createEventLocal の代わりにこちらを呼んでください。
 */
export async function createEventLocalAndShard(input: CreateEventInput): Promise<EventInstance> {
  // 1) まずローカルDB & 永続化
  const inst = await createEventLocal(input);

  // 2) v2イベント形式にして upsert（繰り返しなしの単発）
  try {
    const now = dayjs().toISOString();
    const tags = (input.style?.tags ?? []).map((t) => ({ tag_id: String(t) }));

    // monthShard の V2Event 仕様に合わせる（calendar_links / tags / updated_at など）
    await upsertEventV2({
      event_id: inst.event_id,
      title: input.title.trim(),
      summary: input.summary ?? '',
      color: input.color ?? null,
      calendar_links: [
        {
          link_id: ulid(),
          calendar_id: (input.calendar_id ?? 'CAL_LOCAL_DEFAULT') as ULID,
          content_visibility: 'full',
          updated_at: now,
          deleted_at: null,
        },
      ],
      event_shares: [],
      followers_share: false,
      priority: 'normal',
      overrides: [],
      tags,
      updated_at: now,
    } as any);
  } catch (e) {
    if (__DEV__) console.warn('[createEventLocalAndShard] v2 upsert failed:', e);
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
