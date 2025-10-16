// src/api/types.ts
// ========================================================
// Calect Schema v2・医Ο繝ｼ繧ｫ繝ｫ菫晏ｭ労SON縺ｫ貅匁侠・・
// ・・譌｢蟄篭I莠呈鋤縺ｮ譛蟆丞梛 (Calendar / Event / EventInstance / ULID)
// --------------------------------------------------------
// - Server 蛛ｴ菫晏ｭ倡黄縺ｯ ServerDocV2 驟堺ｸ九・ profile/sync/tombstones/entities
// - UI 譌｢蟄倥さ繝ｼ繝峨・ Calendar, Event, EventInstance 繧貞盾辣ｧ縺吶ｋ縺溘ａ谿狗ｽｮ
//   * Calendar/Event 縺ｯ v2鬆・岼繧偵が繝励す繝ｧ繝翫Ν縺ｫ蜀・桁縺嶺ｺ呈鋤縺ｫ縺励※縺・∪縺・
// ========================================================

/** 26譁・ｭ励・ ULID・・ase32・・*/
export type ULID = string;

// --------------------------------------------------------
// 譌｢蟄篭I莠呈鋤・域怙蟆擾ｼ・
// --------------------------------------------------------

/** 譌｢蟄篭I縺悟盾辣ｧ縺励※縺・ｋ譛蟆上き繝ｬ繝ｳ繝繝ｼ蝙具ｼ・2鬆・岼繧偵が繝励す繝ｧ繝翫Ν縺ｧ蛹・性・・*/
export type Calendar = {
  calendar_id: ULID;
  name: string;
  /** 莠呈鋤: 譌｢蟄篭I逕ｨ縲ゅし繝ｼ繝蝉ｿ晏ｭ倥〒縺ｯ HEX (#2563EB 縺ｪ縺ｩ) */
  color?: string | null;
  /** 莠呈鋤: 譌｢蟄篭I逕ｨ・・2縺ｧ縺ｯ profile / org / group 縺ｨ蜈ｱ譛峨〒陦ｨ迴ｾ・・*/
  tz?: string;
  /** 莠呈鋤: 譌｢蟄篭I逕ｨ */
  visibility?: 'private' | 'org' | 'public';

  // --- v2 霑ｽ蜉鬆・岼・亥ｿ・ｦ√↓蠢懊§縺ｦ蛻ｩ逕ｨ・・---
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

/** 譌｢蟄篭I縺後Ο繝ｼ繧ｫ繝ｫ菴懈・譎ゅ↓菴ｿ縺・怙蟆上う繝吶Φ繝亥梛・・I驛ｽ蜷医〒 ISO 繧剃ｿ晄戟・・*/
export type Event = {
  event_id: ULID;
  calendar_id: ULID;
  title: string;
  summary?: string | null;
  /** 譌｢蟄篭I莠呈鋤・唔SO8601譌･譎ゑｼ井ｾ・ 2025-10-08T09:30:00+09:00・・*/
  start_at: string;
  end_at: string;

  /** 譌｢蟄篭I莠呈鋤・壼庄隕也ｯ・峇 */
  visibility: 'inherit' | 'private' | 'org' | 'public' | 'link';
};

/** 譌｢蟄篭I縺後き繝ｬ繝ｳ繝繝ｼ謠冗判縺ｫ菴ｿ縺・怙蟆上う繝ｳ繧ｹ繧ｿ繝ｳ繧ｹ蝙具ｼ亥ｱ暮幕貂医∩1莉ｶ・・*/
export type EventInstance = {
  /** 譌｢蟄篭I莠呈鋤・壽焚蛟､ID・・ate.now() 逕ｱ譚･縺ｪ縺ｩ・・*/
  instance_id: number;
  calendar_id: ULID;
  event_id: ULID;
  title: string;
  /** ISO8601・・I謠冗判縺ｯ縺薙ｌ繧剃ｽｿ逕ｨ・・*/
  start_at: string;
  end_at: string;
};

// --------------------------------------------------------
// v2 繧ｵ繝ｼ繝蝉ｿ晏ｭ倥ラ繧ｭ繝･繝｡繝ｳ繝茨ｼ医Ο繝ｼ繧ｫ繝ｫJSON・・
// --------------------------------------------------------

export type ProfileV2 = {
  current_user_id: string;
  default_tz: string;          // 萓・ "Asia/Tokyo"
  locale: string;              // 萓・ "ja-JP"
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
  plan: string;   // 萓・ "free" | "pro" | "enterprise"
  locale: string; // 萓・ "ja-JP"
  tz: string;     // 萓・ "Asia/Tokyo"
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
  calendar_id: string; // ULID繧呈Φ螳・
  owner_user_id: string | null;
  owner_group_id: string | null;
  name: string;
  color: string; // HEX (#2563EB)
  calendar_shares: CalendarShareV2[];
  updated_at: string;
  deleted_at: string | null;
};

export type EventRecurrenceV2 = {
  /** RFC5545 RRULE 萓・ FREQ=WEEKLY;BYDAY=MO,WE,FR */
  rrule: string;
  /** 髢句ｧ句渕貅厄ｼ・Z蠢・茨ｼ我ｾ・ 2025-10-08T09:30:00+09:00 */
  dtstart: string;
  /** 髯､螟匁律譎・*/
  exdates?: string[];
  /** 霑ｽ蜉譌･譎・*/
  rdates?: string[];
  /** 譛滄俣邨ゆｺ・*/
  until?: string | null;
};

export type EventOverrideV2 = {
  occurrence_date: string; // YYYY-MM-DD
  cancelled?: boolean;     // true縺ｪ繧我ｻ悶ヵ繧｣繝ｼ繝ｫ繝臥┌隕・
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
  /** 髢句ｧ・邨ゆｺ・凾蛻ｻ・医Ο繝ｼ繧ｫ繝ｫ譎ょ綾縺ｮ HH:mm 陦ｨ險假ｼ・*/
  start_at: string; // e.g. "09:30"
  end_at: string;   // e.g. "10:30"

  event_shares?: Array<{
    user_id?: string | null;
    group_id?: string | null;
    content_visibility?: 'busy' | 'full' | 'summary';
  }>;
  followers_share?: boolean | string;
  link_token?: string | null; // Base62 22窶・2 chars, 遏ｭ譛鬱TL謗ｨ螂ｨ
  priority?: 'low' | 'normal' | 'high';

  /** 郢ｰ繧願ｿ斐＠險ｭ螳・*/
  recurrence?: EventRecurrenceV2;

  /** 蛟句挨逋ｺ逕溘・荳頑嶌縺・*/
  overrides?: EventOverrideV2[];

  /** 繧ｿ繧ｰ */
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
  plan_code: string; // "free" 縺ｪ縺ｩ
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

// ---------- Entities 髮・ｴ・----------

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

// ---------- 繝ｫ繝ｼ繝医ラ繧ｭ繝･繝｡繝ｳ繝・----------

export type ServerDocV2 = {
  version: 2;
  profile: ProfileV2;
  sync: { hashes: SyncHashesV2 };
  tombstones: TombstonesV2;
  entities: EntitiesV2;
};

// ========================================================
// 蜿り・ UI繧・せ繝医い縺九ｉ縺ｯ蠕捺擂騾壹ｊ
//  - import type { Calendar, Event, EventInstance, ULID } from '../api/types';
// 繧剃ｽｿ縺医∪縺吶ゅし繝ｼ繝蝉ｿ晏ｭ倡黄繧呈桶縺・ｴ蜷医・ ServerDocV2 / EntitiesV2 遲峨ｒ蜿ら・縺励※縺上□縺輔＞縲・
// ========================================================
