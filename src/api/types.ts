// src/api/types.ts
// ========================================================
// Calect Schema v2（ローカル保存JSONに準拠）
// ＋ 既存UI互換の最小型 (Calendar / Event / EventInstance / ULID)
// --------------------------------------------------------
// - Server 側保存物は ServerDocV2 配下の profile/sync/tombstones/entities
// - UI 既存コードは Calendar, Event, EventInstance を参照するため残置
//   * Calendar/Event は v2項目をオプショナルに内包し互換にしています
// ========================================================

/** 26文字の ULID（Base32） */
export type ULID = string;

// --------------------------------------------------------
// 既存UI互換（最小）
// --------------------------------------------------------

/** 既存UIが参照している最小カレンダー型（v2項目をオプショナルで包含） */
export type Calendar = {
  calendar_id: ULID;
  name: string;
  /** 互換: 既存UI用。サーバ保存では HEX (#2563EB など) */
  color?: string | null;
  /** 互換: 既存UI用（v2では profile / org / group と共有で表現） */
  tz?: string;
  /** 互換: 既存UI用 */
  visibility?: 'private' | 'org' | 'public';

  // --- v2 追加項目（必要に応じて利用） ---
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

/** 既存UIがローカル作成時に使う最小イベント型（UI都合で ISO を保持） */
export type Event = {
  event_id: ULID;
  calendar_id: ULID;
  title: string;
  description?: string | null;

  /** 既存UI互換：終日フラグ */
  is_all_day: boolean;

  /** 既存UI互換：表示用TZ */
  tz: string;

  /** 既存UI互換：ISO8601日時（例: 2025-10-08T09:30:00+09:00） */
  start_at: string;
  end_at: string;

  /** 既存UI互換：可視範囲 */
  visibility: 'inherit' | 'private' | 'org' | 'public' | 'link';
};

/** 既存UIがカレンダー描画に使う最小インスタンス型（展開済み1件） */
export type EventInstance = {
  /** 既存UI互換：数値ID（Date.now() 由来など） */
  instance_id: number;
  calendar_id: ULID;
  event_id: ULID;
  title: string;
  /** ISO8601（UI描画はこれを使用） */
  start_at: string;
  end_at: string;
};

// --------------------------------------------------------
// v2 サーバ保存ドキュメント（ローカルJSON）
// --------------------------------------------------------

export type ProfileV2 = {
  current_user_id: string;
  default_tz: string;          // 例: "Asia/Tokyo"
  locale: string;              // 例: "ja-JP"
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
  plan: string;   // 例: "free" | "pro" | "enterprise"
  locale: string; // 例: "ja-JP"
  tz: string;     // 例: "Asia/Tokyo"
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
  calendar_id: string; // ULIDを想定
  owner_user_id: string | null;
  owner_group_id: string | null;
  name: string;
  color: string; // HEX (#2563EB)
  calendar_shares: CalendarShareV2[];
  updated_at: string;
  deleted_at: string | null;
};

export type EventRecurrenceV2 = {
  /** RFC5545 RRULE 例: FREQ=WEEKLY;BYDAY=MO,WE,FR */
  rrule: string;
  /** 開始基準（TZ必須）例: 2025-10-08T09:30:00+09:00 */
  dtstart: string;
  /** 除外日時 */
  exdates?: string[];
  /** 追加日時 */
  rdates?: string[];
  /** 期間終了 */
  until?: string | null;
};

export type EventOverrideV2 = {
  occurrence_date: string; // YYYY-MM-DD
  cancelled?: boolean;     // trueなら他フィールド無視
  title?: string;
  description?: string;
  start_at?: string;       // HH:mm
  end_at?: string;         // HH:mm
  priority?: 'low' | 'normal' | 'high';
};

export type EventTagRefV2 = { tag_id: string };

export type EventV2 = {
  event_id: string;
  calendar_id: string;
  title: string;
  description?: string | null;
  /** 開始/終了時刻（ローカル時刻の HH:mm 表記） */
  start_at: string; // e.g. "09:30"
  end_at: string;   // e.g. "10:30"

  event_shares?: Array<{
    user_id?: string | null;
    group_id?: string | null;
    content_visibility?: 'busy' | 'full' | 'summary';
  }>;
  followers_share?: boolean | string;
  link_token?: string | null; // Base62 22–32 chars, 短期TTL推奨
  priority?: 'low' | 'normal' | 'high';

  /** 繰り返し設定 */
  recurrence?: EventRecurrenceV2;

  /** 個別発生の上書き */
  overrides?: EventOverrideV2[];

  /** タグ */
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
  plan_code: string; // "free" など
  name: string;
  description?: string | null;
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

// ---------- Entities 集約 ----------

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

// ---------- ルートドキュメント ----------

export type ServerDocV2 = {
  version: 2;
  profile: ProfileV2;
  sync: { hashes: SyncHashesV2 };
  tombstones: TombstonesV2;
  entities: EntitiesV2;
};

// ========================================================
// 参考: UIやストアからは従来通り
//  - import type { Calendar, Event, EventInstance, ULID } from '../api/types';
// を使えます。サーバ保存物を扱う場合は ServerDocV2 / EntitiesV2 等を参照してください。
// ========================================================
