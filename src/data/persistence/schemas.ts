// src/data/persistence/schemas.ts
export type ID = string;

export type V2Profile = {
  current_user_id?: string;
  default_tz?: string;
  locale?: string;
  profile_image_path?: string | null;
  username?: string | null;
  username_url?: string | null;
  display_name?: string | null;
  email?: string | null;
  updated_at?: string;
};

export type V2Organization = {
  org_id: ID;
  name: string;
  plan?: string;
  locale?: string;
  tz?: string;
};

export type V2Follow = {
  user_id: ID;
  display_name?: string;
  profile_image_path?: string | null;
};

export type V2GroupMember = {
  user_id: ID;
  name?: string;
  role?: 'owner'|'member'|'admin';
  can_share?: boolean | string;
  can_invite?: boolean | string;
};

export type V2Group = {
  group_id: ID;
  owner_org_id?: ID | null;
  owner_user_id?: ID | null;
  name: string;
  updated_at?: string;
  members?: Record<ID, V2GroupMember>;
};

export type V2CalendarShare = {
  user_id?: ID | null;
  group_id?: ID | null;
  content_visibility: 'busy'|'summary'|'full';
};

export type V2Calendar = {
  calendar_id: ID;
  owner_user_id?: ID | null;
  owner_group_id?: ID | null;
  name: string;
  color?: string;
  calendar_shares?: V2CalendarShare[];
  updated_at?: string;
  deleted_at?: string | null;
};

export type V2EventCalendarLink = {
  link_id: ID;               // ULID or Base62
  calendar_id: ID;
  content_visibility: 'busy'|'summary'|'full';
  role?: 'mirror'|'alias'|'copy';
  created_by: ID;
  updated_at: string;        // ISO Z
  deleted_at: string | null;
};

export type V2EventShare = {
  user_id?: ID | null;
  group_id?: ID | null;
  content_visibility: 'busy'|'summary'|'full';
};

export type V2EventRecurrence = {
  rrule: string;             // RFC5545
  tz: string;
  start_at: string;          // "HH:mm"
  end_at: string;            // "HH:mm"
  dtstart: string;           // "YYYY-MM-DD"
  until: string | null;
};

export type V2EventOverride = {
  occurrence_date: string;   // "YYYY-MM-DD"
  cancelled?: boolean;
  title?: string;
  summary?: string;
  start_at?: string;         // "HH:mm"
  end_at?: string;           // "HH:mm"
  priority?: 'low'|'normal'|'high';
};

export type V2EventTag = { tag_id: ID };

export type V2Event = {
  event_id: ID;
  title: string;
  summary?: string;
  color?: string;
  calendar_links?: V2EventCalendarLink[];
  event_shares?: V2EventShare[];
  followers_share?: boolean | string;
  link_token?: string | null;
  priority?: 'low'|'normal'|'high';
  recurrence?: V2EventRecurrence;
  overrides?: V2EventOverride[];
  tags?: V2EventTag[];
  created_by?: ID;
  updated_by?: ID;
  updated_at: string;        // ISO Z
};

export type V2PushReminder = {
  reminder_id: ID;
  event_id: ID;
  absolute_at: string;       // ISO+09:00 OK
  updated_at: string;        // ISO Z
};

export type V2EventTagEntity = {
  tag_id: ID;
  name: string;
  updated_at: string;
};

export type V2Plan = {
  plan_code: string;
  name: string;
  summary?: string | null;
  max_group_members_per_group: number;
  max_groups_per_owner: number;
  max_calendars_per_owner: number;
  price_monthly_cents: number;
  currency: string;
  updated_at: string;
};

export type V2Subscription = {
  sub_id: ID;
  org_id: ID;
  user_id?: ID | null;
  plan_code: string;
  status: 'active'|'canceled'|'past_due';
  trial_end?: string | null;
  current_period_start: string; // YYYY-MM-DD
  current_period_end: string;   // YYYY-MM-DD
  updated_at: string;
};

export type V2Entities = {
  organizations?: Record<ID, V2Organization>;
  follows?: Record<ID, V2Follow>;
  groups?: Record<ID, V2Group>;
  calendars?: Record<ID, V2Calendar>;
  events?: Record<ID, V2Event>;
  push_reminders?: V2PushReminder[];
  event_tags?: Record<ID, V2EventTagEntity>;
  plans?: Record<string, V2Plan>;
  subscriptions?: Record<ID, V2Subscription>;
};

export type V2SyncHashes = {
  document?: string;
  profile?: string;
  tombstones?: string;
  organizations?: string;
  follows?: string;
  groups?: string;
  org_relationships?: string;
  calendars?: string;
  events?: string;
  push_reminders?: string;
  event_tags?: string;
  plans?: string;
  subscriptions?: string;
};

export type V2Tombstones = {
  organizations?: ID[];
  follows?: ID[];
  groups?: ID[];
  org_relationships?: ID[];
  calendars?: ID[];
  events?: ID[];
  push_reminders?: ID[];
  event_tags?: ID[];
  subscriptions?: ID[];
  plans?: string[];
  updated_at?: string;
};

export type ServerDocV2 = {
  version: 2;
  profile?: V2Profile;
  sync?: { hashes?: V2SyncHashes };
  tombstones?: V2Tombstones;
  entities?: V2Entities;
};
