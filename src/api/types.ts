// src/api/types.ts
// ========================================================
// Calect Schema v2 / ローカル最小モデル（Calendar / Event / EventInstance / ULID）
// --------------------------------------------------------
// - Server 側完全保存は ServerDocV2 （profile/sync/tombstones/entities）
// - UI/ローカルは軽量モデル（Calendar, Event, EventInstance）を使用
//   * Event に cid_ulid（クライアント一時ID）を追加
//   * Instance に occurrence_key（event_id@@start_at）を追加
// ========================================================

/** 26桁の ULID（Crockford Base32） */
export type ULID = string;

// --------------------------------------------------------
// ローカル最小モデル
// --------------------------------------------------------

/** カレンダー（軽量） */
export type Calendar = {
  calendar_id: ULID;
  name: string;
  /** HEX (#2563EB など) */
  color?: string | null;
  /** タイムゾーン */
  tz?: string;
  /** 公開範囲 */
  visibility?: 'private' | 'org' | 'public';

  // v2 互換で使う可能性のある属性（任意）
  owner_user_id?: string | null;
  owner_group_id?: string | null;
  calendar_shares?: Array<{
    user_id?: string | null;
    group_id?: string | null;
    content_visibility?: 'busy' | 'full' | 'summary';
  }>;
  updated_at?: string;
  deleted_at?: string | null;
};

/** 論理イベント本体（ローカル最小） */
export type Event = {
  /** サーバ確定ID（確定前は一時的に cid_ulid と同値を入れてOK） */
  event_id: ULID;

  /** クライアント一時ID（オフライン作成時のみ） */
  cid_ulid?: ULID | null;

  calendar_id: ULID;
  title: string;
  summary?: string | null;

  /** ISO8601（例: 2025-10-08T09:30:00+09:00） */
  start_at: string;
  end_at: string;

  /** 公開範囲 */
  visibility: 'inherit' | 'private' | 'org' | 'public' | 'link';
};

/** 画面描画用の“発生回”インスタンス（計算結果の表現） */
export type EventInstance = {
  /** 一時ユニークID（互換のため残す。将来的に廃止可） */
  instance_id: number;

  calendar_id: ULID;

  /** サーバ確定前は cid_ulid が入る場合あり（create直後） */
  event_id: ULID;

  /** オフライン由来のときに残すことがある（ops/debug 用、任意） */
  cid_ulid?: ULID | null;

  title: string;

  /** ISO8601 */
  start_at: string;
  end_at: string;

  /** ユニーク判定用の派生キー（`event_id@@start_at`） */
  occurrence_key?: string;
};

// --------------------------------------------------------
// v2 サーバ完全保存向け型（ServerDocV2）
// --------------------------------------------------------

export type ProfileV2 = {
  current_user_id: string;
  default_tz: string;          // e.g. "Asia/Tokyo"
  locale: string;              // e.g. "ja-JP"
  profile_image_path?: string | null;
  username?: string | null;
  username_url?: string | null; // ^[a-z0-9-]{3,32}$
  display_name?: string | null;
  email?: string | null;
  updated_at: string;          // ISO
};

export type SyncHashesV2 = {
  document: string;
  profile: string;
  tombstones: string;
  organizations: string;
  follows: string;
  groups: string;
  org_relationships: string;
  calendars: string;
  events: string;
  push_reminders: string;
  event_tags: string;
  plans: string;
  subscriptions: string;
};

export type TombstonesV2 = {
  organizations: string[];
  follows: string[];
  groups: string[];
  org_relationships: string[];
  calendars: string[];
  events: string[];
  push_reminders: string[];
  event_tags: string[];
  subscriptions: string[];
  plans: string[];
  updated_at: string;
};

// ---------- Entities ----------

export type OrganizationV2 = {
  org_id: string;
  name: string;
  plan: string;   // "free" | "pro" | "enterprise" 等
  locale: string; // "ja-JP"
  tz: string;     // "Asia/Tokyo"
};

export type FollowV2 = {
  user_id: string;
  display_name?: string;
  profile_image_path?: string | null;
};

export type GroupMemberV2 = {
  user_id: string;
  name?: string;
  role?: 'owner' | 'member' | 'admin';
  can_share?: boolean | string;
  can_invite?: boolean | string;
};

export type GroupV2 = {
  group_id: string;
  owner_org_id: string | null;
  owner_user_id: string | null;
  name: string;
  members?: Record<string, GroupMemberV2>;
  updated_at: string;
};

export type OrgRelationshipV2 = {
  org_id: string;
  role: 'owner' | 'member' | 'admin';
  can_invite: boolean | string;
  can_share: boolean | string;
  updated_at: string;
};

export type CalendarShareV2 = {
  user_id?: string | null;
  group_id?: string | null;
  content_visibility?: 'busy' | 'full' | 'summary';
};

export type CalendarV2 = {
  calendar_id: string; // ULID 推奨
  owner_user_id: string | null;
  owner_group_id: string | null;
  name: string;
  color: string; // HEX (#2563EB)
  calendar_shares: CalendarShareV2[];
  updated_at: string;
  deleted_at: string | null;
};

export type EventRecurrenceV2 = {
  /** RFC5545 RRULE (例: FREQ=WEEKLY;BYDAY=MO,WE,FR) */
  rrule: string;
  /** 開始日時（TZ必須、例: 2025-10-08T09:30:00+09:00） */
  dtstart: string;
  /** 除外日時（ISO8601） */
  exdates?: string[];
  /** 追加発生日時（ISO8601） */
  rdates?: string[];
  /** 終了日時（ISO8601）または null */
  until?: string | null;
};

export type EventOverrideV2 = {
  occurrence_date: string; // YYYY-MM-DD
  cancelled?: boolean;     // true の場合、他フィールドは無視
  title?: string;
  summary?: string;
  start_at?: string;       // HH:mm
  end_at?: string;         // HH:mm
  priority?: 'low' | 'normal' | 'high';
};

export type EventTagRefV2 = { tag_id: string };

export type EventV2 = {
  event_id: string;
  calendar_id: string;
  title: string;
  summary?: string | null;

  /** ローカルでは ISO を保持するが、サーバ v2 は日内の時刻（HH:mm）で表現 */
  start_at: string; // e.g. "09:30"
  end_at: string;   // e.g. "10:30"

  event_shares?: Array<{
    user_id?: string | null;
    group_id?: string | null;
    content_visibility?: 'busy' | 'full' | 'summary';
  }>;
  followers_share?: boolean | string;
  /** 共有リンク用トークン（Base62/短期TTL推奨） */
  link_token?: string | null;
  priority?: 'low' | 'normal' | 'high';

  /** 繰り返し設定 */
  recurrence?: EventRecurrenceV2;

  /** 個別上書き */
  overrides?: EventOverrideV2[];

  /** タグ参照 */
  tags?: EventTagRefV2[];

  updated_by: string;
  updated_at: string;
};

export type PushReminderV2 = {
  reminder_id: string;
  event_id: string;
  absolute_at: string; // ISO8601
  updated_at: string;
};

export type EventTagV2 = {
  tag_id: string;
  name: string;
  updated_at: string;
};

export type PlanV2 = {
  plan_code: string; // "free" 等
  name: string;
  summary?: string | null;
  max_group_members_per_group: number;
  max_groups_per_owner: number;
  max_calendars_per_owner: number;
  price_monthly_cents: number;
  currency: string; // "JPY"
  updated_at: string;
};

export type SubscriptionV2 = {
  sub_id: string;
  org_id: string;
  user_id: string | null;
  plan_code: string;
  status: 'active' | 'canceled' | 'past_due';
  trial_end?: string | null;
  current_period_start: string; // YYYY-MM-DD
  current_period_end: string;   // YYYY-MM-DD
  updated_at: string;
};

// ---------- Entities ----------

export type EntitiesV2 = {
  organizations: Record<string, OrganizationV2>;
  follows: Record<string, FollowV2>;
  groups: Record<string, GroupV2>;
  org_relationships: OrgRelationshipV2[];
  calendars: Record<string, CalendarV2>;
  events: Record<string, EventV2>;
  push_reminders: PushReminderV2[];
  event_tags: Record<string, EventTagV2>;
  plans: Record<string, PlanV2>;
  subscriptions: Record<string, SubscriptionV2>;
};

// ---------- サーバ完全ドキュメント ----------

export type ServerDocV2 = {
  version: 2;
  profile: ProfileV2;
  sync: { hashes: SyncHashesV2 };
  tombstones: TombstonesV2;
  entities: EntitiesV2;
};

// ========================================================
// 使い方メモ
//  - import type { Calendar, Event, EventInstance, ULID } from '../api/types';
//  - サーバ完全保存用は ServerDocV2 / EntitiesV2 を使用
// ========================================================
