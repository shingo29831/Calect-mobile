// src/store/serverDoc.ts
// =======================================================
// Server Sync Document (v2) 保存/読込 & イベント登録ユーティリティ
// スキーマ：recurrence の dtstart / until は "YYYY-MM-DD"（日付のみ）
// - recurrence: { rrule, tz, start_at, end_at, dtstart(YYYY-MM-DD), until(YYYY-MM-DD|null) }
// - 単発は rrule=FREQ=DAILY;COUNT=1, dtstart=until=同日
// - tags は string[] / {tag_id:string}[] どちらでも受け取り保存時に正規化
// =======================================================

import RNFS from 'react-native-fs';
import dayjs from '../lib/dayjs';

/** 保存先 */
const SERVER_DIR  = `${RNFS.DocumentDirectoryPath}/calect/server`;
const TMP_DIR     = `${RNFS.CachesDirectoryPath}/calect/_tmp`;
const SERVER_FILE = `${SERVER_DIR}/server.v2.json`;
const TMP_FILE    = `${TMP_DIR}/server.v2.json.tmp`;

/** ULID（簡易） */
type ULID = string;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulid(now = Date.now()): ULID {
  let ts = now, timeChars = '';
  for (let i = 0; i < 10; i++) { timeChars = ALPHABET[ts % 32] + timeChars; ts = Math.floor(ts / 32); }
  let rand = '';
  for (let i = 0; i < 16; i++) rand += ALPHABET[(Math.random() * 32) | 0];
  return (timeChars + rand) as ULID;
}

/* ==================== 型 ==================== */

type TagObj = { tag_id: string };

export type ServerSyncDocV2 = {
  version: 2;
  profile: {
    current_user_id: string;
    default_tz: string;
    locale: string;
    profile_image_path?: string | null;
    username: string;
    username_url: string;
    display_name: string;
    email: string;
    updated_at: string;
  };
  sync: {
    hashes: Record<
      | 'document' | 'profile' | 'tombstones' | 'organizations' | 'follows'
      | 'groups' | 'org_relationships' | 'calendars' | 'events'
      | 'push_reminders' | 'event_tags' | 'plans' | 'subscriptions',
      string
    >;
  };
  tombstones: {
    organizations?: string[]; follows?: string[]; groups?: string[];
    org_relationships?: string[]; calendars?: string[]; events?: string[];
    push_reminders?: string[]; event_tags?: string[]; subscriptions?: string[];
    plans?: string[]; updated_at: string;
  };
  entities: {
    organizations?: Record<string, any>;
    follows?: Record<string, any>;
    groups?: Record<string, any>;
    org_relationships?: Array<any>;
    calendars?: Record<string, any>;
    events?: Record<string, {
      event_id: string;
      title?: string;
      summary?: string;
      color?: string;

      calendar_links?: Array<{
        link_id: string; calendar_id: string;
        content_visibility: 'busy' | 'summary' | 'full';
        role?: 'mirror' | 'alias' | 'copy';
        created_by: string; updated_at: string; deleted_at: string | null;
      }>;

      event_shares?: Array<{
        user_id: string | null; group_id: string | null;
        content_visibility: 'busy' | 'summary' | 'full';
      }>;

      followers_share?: boolean | string;
      link_token?: string | null;
      priority?: 'low' | 'normal' | 'high';

      recurrence: {
        rrule: string;        // 例: "FREQ=WEEKLY;BYDAY=MO,WE,FR"
        tz: string;           // 例: "Asia/Tokyo"
        start_at: string;     // "HH:mm" 各回の開始時刻
        end_at: string;       // "HH:mm" 各回の終了時刻
        dtstart: string;      // "YYYY-MM-DD" 初回発生日（時刻なし）
        until: string | null; // "YYYY-MM-DD" or null（時刻なし）
      };

      overrides?: Array<{
        occurrence_date: string;      // "YYYY-MM-DD"
        cancelled?: boolean;
        title?: string;
        summary?: string;
        start_at?: string;            // "HH:mm"
        end_at?: string;              // "HH:mm"
        priority?: 'low' | 'normal' | 'high';
      }>;

      tags?: TagObj[];

      created_by?: string;
      updated_by?: string;
      updated_at: string; // ISO8601
    }>;
    push_reminders?: Array<{ reminder_id: string; event_id: string; absolute_at: string; updated_at: string }>;
    event_tags?: Record<string, { tag_id: string; name: string; updated_at: string }>;
    plans?: Record<string, {
      plan_code: string; name: string; summary?: string | null;
      max_group_members_per_group: number;
      max_groups_per_owner: number;
      max_calendars_per_owner: number;
      price_monthly_cents: number;
      currency: string;
      updated_at: string;
    }>;
    subscriptions?: Record<string, {
      sub_id: string; org_id: string; user_id: string | null;
      plan_code: string; status: 'active'|'canceled'|'past_due';
      trial_end: string | null;
      current_period_start: string; current_period_end: string;
      updated_at: string;
    }>;
  };
};

export function isServerSyncDocV2(v: any): v is ServerSyncDocV2 {
  return v && typeof v === 'object' && v.version === 2 && v.profile && v.entities && v.sync;
}

/* ==================== 内部ユーティリティ ==================== */

async function ensureDirs() {
  if (!(await RNFS.exists(SERVER_DIR))) await RNFS.mkdir(SERVER_DIR);
  if (!(await RNFS.exists(TMP_DIR)))     await RNFS.mkdir(TMP_DIR);
}

export async function loadServerDoc(): Promise<ServerSyncDocV2 | null> {
  try {
    await ensureDirs();
    if (!(await RNFS.exists(SERVER_FILE))) return null;
    const txt = await RNFS.readFile(SERVER_FILE, 'utf8');
    const obj = JSON.parse(txt);
    return isServerSyncDocV2(obj) ? obj : null;
  } catch { return null; }
}

export async function saveServerDoc(doc: ServerSyncDocV2): Promise<void> {
  if (!isServerSyncDocV2(doc)) throw new Error('saveServerDoc: invalid document (version must be 2).');
  await ensureDirs();
  const json = JSON.stringify(doc, null, 2);
  await RNFS.writeFile(TMP_FILE, json + '\n', 'utf8');
  await RNFS.moveFile(TMP_FILE, SERVER_FILE);
}

export async function removeServerDoc(): Promise<void> {
  await ensureDirs();
  if (await RNFS.exists(SERVER_FILE)) await RNFS.unlink(SERVER_FILE);
}

export function getServerDocPath() { return SERVER_FILE; }

/* ====== バリデーション ====== */
const RE_HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const RE_YMD  = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const RE_TZ   = /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/; // ざっくりチェック

function assertHHmm(label: string, v: string) {
  if (!RE_HHMM.test(v)) throw new Error(`${label} は "HH:mm" 形式で指定してください: ${v}`);
}
function assertYMD(label: string, v: string) {
  if (!RE_YMD.test(v)) throw new Error(`${label} は "YYYY-MM-DD" 形式で指定してください: ${v}`);
}
function assertRRule(rrule: string) {
  if (typeof rrule !== 'string' || !/^FREQ=/.test(rrule)) {
    throw new Error(`RRULE が不正です（"FREQ=" で始まる完全な RRULE を指定）: ${rrule}`);
  }
}
function assertTZ(label: string, v: string) {
  if (!RE_TZ.test(v)) throw new Error(`${label} は IANA タイムゾーン（例: Asia/Tokyo）で指定してください: ${v}`);
}

/** タグ正規化：string[] | {tag_id:string}[] -> {tag_id:string}[] */
function normalizeTags(tags?: Array<string | TagObj> | null): TagObj[] {
  if (!tags) return [];
  return tags.map((t) => (typeof t === 'string' ? { tag_id: t } : t));
}

/** 空文書（最小） */
function makeEmptyDoc(nowIso: string): ServerSyncDocV2 {
  return {
    version: 2,
    profile: {
      current_user_id: '', default_tz: 'Asia/Tokyo', locale: 'ja-JP',
      profile_image_path: null, username: '', username_url: '',
      display_name: '', email: '', updated_at: nowIso,
    },
    sync: { hashes: {
      document:'', profile:'', tombstones:'', organizations:'', follows:'',
      groups:'', org_relationships:'', calendars:'', events:'',
      push_reminders:'', event_tags:'', plans:'', subscriptions:''
    }},
    tombstones: { updated_at: nowIso },
    entities: {
      organizations:{}, follows:{}, groups:{}, org_relationships:[],
      calendars:{}, events:{}, push_reminders:[], event_tags:{}, plans:{}, subscriptions:{}
    }
  };
}

async function loadOrInitDoc(): Promise<ServerSyncDocV2> {
  const nowIso = dayjs().toISOString();
  let doc = await loadServerDoc();
  if (!doc) doc = makeEmptyDoc(nowIso);
  if (!doc.entities.events) doc.entities.events = {};
  return doc;
}

/* ==================== イベント API ==================== */

/** 単発（COUNT=1）: dtstart / until は同日(YYYY-MM-DD)。start/end は "HH:mm"。 */
export type UpsertOneShotInput = {
  title: string;
  date: string;                  // "YYYY-MM-DD"（この日だけ発生）
  start_at: string;              // "HH:mm"
  end_at: string;                // "HH:mm"
  tz?: string;                   // 省略時 profile.default_tz
  calendar_id?: string;
  summary?: string | null;
  color?: string;
  priority?: 'low' | 'normal' | 'high';
  tags?: Array<string | TagObj>;
  created_by?: string;
  updated_by?: string;
  event_id?: string;
};

export async function upsertEventOneShot(input: UpsertOneShotInput): Promise<{ event_id: string }> {
  assertYMD('date', input.date);
  assertHHmm('start_at', input.start_at);
  assertHHmm('end_at', input.end_at);

  const doc = await loadOrInitDoc();
  const nowIso = dayjs().toISOString();
  const events = doc.entities.events!;
  const event_id = input.event_id ?? ulid();
  const prev = events[event_id] ?? {};
  const tz = input.tz ?? doc.profile.default_tz ?? 'Asia/Tokyo';
  assertTZ('tz', tz);

  const recurrence = {
    rrule: 'FREQ=DAILY;COUNT=1',
    tz,
    start_at: input.start_at,
    end_at: input.end_at,
    dtstart: input.date,   // 日付のみ
    until: input.date,     // 日付のみ
  };

  events[event_id] = {
    event_id,
    title: input.title,
    summary: input.summary ?? prev.summary ?? '',
    color: input.color ?? prev.color,
    priority: input.priority ?? prev.priority ?? 'normal',
    recurrence,
    overrides: prev.overrides ?? [],
    tags: normalizeTags(input.tags ?? (prev as any)?.tags),
    created_by: input.created_by ?? (prev as any)?.created_by ?? undefined,
    updated_by: input.updated_by ?? (prev as any)?.updated_by ?? undefined,
    updated_at: nowIso,
    ...(input.calendar_id
      ? {
          calendar_links: [{
            link_id: (prev as any)?.calendar_links?.[0]?.link_id ?? ulid(),
            calendar_id: input.calendar_id,
            content_visibility: 'full',
            role: 'mirror',
            created_by: input.created_by ?? (prev as any)?.created_by ?? '',
            updated_at: nowIso,
            deleted_at: null
          }]
        }
      : ((prev as any)?.calendar_links ? { calendar_links: (prev as any).calendar_links } : {})),
  };

  await saveServerDoc(doc);
  return { event_id };
}

/** 繰り返し: dtstart / until は "YYYY-MM-DD"、start/end は "HH:mm" */
export type UpsertRecurringInput = {
  title: string;
  rrule: string;                 // 完全 RRULE（FREQ=...）
  tz?: string;                   // 省略時 profile.default_tz
  start_at: string;              // "HH:mm"
  end_at: string;                // "HH:mm"
  dtstart: string;               // "YYYY-MM-DD"
  until?: string | null;         // "YYYY-MM-DD" or null
  calendar_id?: string;
  summary?: string | null;
  color?: string;
  priority?: 'low' | 'normal' | 'high';
  tags?: Array<string | TagObj>;
  created_by?: string;
  updated_by?: string;
  event_id?: string;
};

export async function upsertEventRecurring(input: UpsertRecurringInput): Promise<{ event_id: string }> {
  assertRRule(input.rrule);
  assertYMD('dtstart', input.dtstart);
  if (input.until !== undefined && input.until !== null) assertYMD('until', input.until);
  assertHHmm('start_at', input.start_at);
  assertHHmm('end_at', input.end_at);

  const doc = await loadOrInitDoc();
  const nowIso = dayjs().toISOString();
  const events = doc.entities.events!;
  const event_id = input.event_id ?? ulid();
  const prev = events[event_id] ?? {};
  const tz = input.tz ?? doc.profile.default_tz ?? 'Asia/Tokyo';
  assertTZ('tz', tz);

  const recurrence = {
    rrule: input.rrule,
    tz,
    start_at: input.start_at,
    end_at: input.end_at,
    dtstart: input.dtstart,           // 日付のみ
    until: input.until ?? null,       // 日付のみ or null
  };

  events[event_id] = {
    event_id,
    title: input.title,
    summary: input.summary ?? (prev as any)?.summary ?? '',
    color: input.color ?? (prev as any)?.color,
    priority: input.priority ?? (prev as any)?.priority ?? 'normal',
    recurrence,
    overrides: (prev as any)?.overrides ?? [],
    tags: normalizeTags(input.tags ?? (prev as any)?.tags),
    created_by: input.created_by ?? (prev as any)?.created_by ?? undefined,
    updated_by: input.updated_by ?? (prev as any)?.updated_by ?? undefined,
    updated_at: nowIso,
    ...(input.calendar_id
      ? {
          calendar_links: [{
            link_id: (prev as any)?.calendar_links?.[0]?.link_id ?? ulid(),
            calendar_id: input.calendar_id,
            content_visibility: 'full',
            role: 'mirror',
            created_by: input.created_by ?? (prev as any)?.created_by ?? '',
            updated_at: nowIso,
            deleted_at: null
          }]
        }
      : ((prev as any)?.calendar_links ? { calendar_links: (prev as any).calendar_links } : {})),
  };

  await saveServerDoc(doc);
  return { event_id };
}

/** recurrence の部分更新（必要な項目だけ差し替え・日付は YYYY-MM-DD） */
export type UpdateRecurrenceInput = {
  event_id: string;
  rrule?: string;
  tz?: string;
  start_at?: string;
  end_at?: string;
  dtstart?: string;   // "YYYY-MM-DD"
  until?: string | null; // "YYYY-MM-DD" or null
  updated_by?: string;
};

export async function updateEventRecurrence(input: UpdateRecurrenceInput): Promise<void> {
  const doc = await loadOrInitDoc();
  const ev = doc.entities.events![input.event_id];
  if (!ev) throw new Error('event not found');

  const next = { ...ev.recurrence };
  if (input.rrule !== undefined) { assertRRule(input.rrule); next.rrule = input.rrule; }
  if (input.tz !== undefined)    { assertTZ('tz', input.tz); next.tz = input.tz; }
  if (input.start_at !== undefined) { assertHHmm('start_at', input.start_at); next.start_at = input.start_at; }
  if (input.end_at !== undefined)   { assertHHmm('end_at', input.end_at);     next.end_at   = input.end_at; }
  if (input.dtstart !== undefined)  { assertYMD('dtstart', input.dtstart);    next.dtstart  = input.dtstart; }
  if (input.until !== undefined)    {
    if (input.until !== null) assertYMD('until', input.until);
    next.until = input.until ?? null;
  }

  ev.recurrence = next;
  ev.updated_by = input.updated_by ?? ev.updated_by;
  ev.updated_at = dayjs().toISOString();
  await saveServerDoc(doc);
}

/** overrides：その回の上書き or 取消（occurrence_date は "YYYY-MM-DD"） */
export type SetOccurrenceOverrideInput = {
  event_id: string;
  occurrence_date: string;     // "YYYY-MM-DD"
  cancelled?: boolean;
  title?: string;
  summary?: string;
  start_at?: string;           // "HH:mm"
  end_at?: string;             // "HH:mm"
  priority?: 'low'|'normal'|'high';
  updated_by?: string;
};

export async function setOccurrenceOverride(input: SetOccurrenceOverrideInput): Promise<void> {
  assertYMD('occurrence_date', input.occurrence_date);
  if (input.start_at !== undefined) assertHHmm('start_at', input.start_at);
  if (input.end_at   !== undefined) assertHHmm('end_at',   input.end_at);

  const doc = await loadOrInitDoc();
  const ev = doc.entities.events![input.event_id];
  if (!ev) throw new Error('event not found');

  ev.overrides = ev.overrides ?? [];
  const idx = ev.overrides.findIndex(o => o.occurrence_date === input.occurrence_date);
  const prev = idx >= 0 ? ev.overrides[idx] : undefined;
  const next = {
    ...(prev ?? { occurrence_date: input.occurrence_date }),
    cancelled: input.cancelled ?? prev?.cancelled,
    title: input.title ?? prev?.title,
    summary: input.summary ?? prev?.summary,
    start_at: input.start_at ?? prev?.start_at,
    end_at: input.end_at ?? prev?.end_at,
    priority: input.priority ?? prev?.priority,
  };
  if (idx >= 0) ev.overrides[idx] = next; else ev.overrides.push(next);

  ev.updated_by = input.updated_by ?? ev.updated_by;
  ev.updated_at = dayjs().toISOString();
  await saveServerDoc(doc);
}

/** overrides の削除（元に戻す） */
export async function clearOccurrenceOverride(event_id: string, occurrence_date: string, updated_by?: string): Promise<void> {
  assertYMD('occurrence_date', occurrence_date);
  const doc = await loadOrInitDoc();
  const ev = doc.entities.events![event_id];
  if (!ev) throw new Error('event not found');

  ev.overrides = (ev.overrides ?? []).filter(o => o.occurrence_date !== occurrence_date);
  ev.updated_by = updated_by ?? ev.updated_by;
  ev.updated_at = dayjs().toISOString();
  await saveServerDoc(doc);
}
