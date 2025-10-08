// src/store/localTypes.ts

/**
 * ローカル保存の型定義（完全刷新版）
 * - ServerDataset: サーバ同期対象のスナップショット（サーバJSONに対応）
 * - ClientPrefs: 端末固有の設定（クライアントJSONに対応・同期しない）
 *
 * 目的:
 *  - 画面や保存処理が、型に沿って実装できるようにする
 *  - 旧 "calendars / instances" などの互換は破棄（要求通り）
 */

// ---------------------------------------------
// 共通プリミティブ型
// ---------------------------------------------
export type ID = string;
export type ISODateTime = string;     // 例: '2025-10-08T09:30:00+09:00' / '2025-10-01T00:00:00Z'
export type ISODate = string;         // 例: '2025-10-15'
export type TimeHM = string;          // 例: '09:30'
export type HexColor = string;        // 例: '#2563EB'
export type UrlOrPath = string;       // URLまたはローカルパス
export type TrueFalseStr = 'true' | 'false'; // プレースホルダに {true/false} を使う箇所の実体は boolean 推奨

// ---------------------------------------------
// サーバ同期用データセット（サーバJSONに対応）
// ---------------------------------------------

export type ServerProfile = {
  current_user_id: ID;                            // {ログインユーザID}
  default_tz: string;                             // {ユーザのタイムゾーン 例: Asia/Tokyo}
  locale: string;                                 // {ユーザの国・地域 例: ja-JP}
  profile_image_path: UrlOrPath;                  // {プロフィール画像URLまたはパス}
  username: string;                               // {本名などの企業向けの名前}
  username_url: string;                           // {一意なURL用の名前 例: taro-yamada｜正規表現 ^[a-z0-9-]{3,32}$ }
  display_name: string;                           // {外部公開用の表示名}
  email: string;                                  // {メールアドレス}
  updated_at: ISODateTime;                        // {更新日時}
};

export type ServerSyncHashes = {
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

export type ServerTombstones = {
  organizations: ID[];
  follows: ID[];
  groups: ID[];
  org_relationships: ID[];
  calendars: ID[];
  events: ID[];
  push_reminders: ID[];
  event_tags: ID[];
  subscriptions: ID[];
  plans: ID[];
  updated_at: ISODateTime;
};

export type Organization = {
  org_id: ID;
  name: string;
  plan: string; // 例: 'free' | 'pro' | 'enterprise'
  locale: string;
  tz: string;
};

export type FollowUser = {
  user_id: ID;
  display_name: string;
  profile_image_path: UrlOrPath;
};

export type GroupMember = {
  user_id: ID;
  name: string;                // グループ内表示名
  role: 'owner' | 'member' | 'admin';
  can_share: boolean;
  can_invite: boolean;
};

export type Group = {
  group_id: ID;
  owner_org_id: ID;
  owner_user_id: ID | null;
  name: string;
  members: Record<ID, GroupMember>;
  updated_at: ISODateTime;
};

export type OrgRelationship = {
  org_id: ID;
  role: 'owner' | 'member' | 'admin';
  can_invite: boolean;
  can_share: boolean;
  updated_at: ISODateTime;
};

export type CalendarShare = {
  user_id: ID | null;
  group_id: ID | null;
  content_visibility: 'busy' | 'full' | 'summary';
};

export type CalendarEntity = {
  calendar_id: ID;
  owner_user_id: ID | null;
  owner_group_id: ID | null;
  name: string;
  color: HexColor;                           // 表示色
  calendar_shares: CalendarShare[];
  updated_at: ISODateTime;
  deleted_at: ISODateTime | null;
};

export type EventShare = {
  user_id: ID | null;
  group_id: ID | null;
  content_visibility: 'busy' | 'full' | 'summary';
};

export type EventRecurrence = {
  rrule: string;                // RFC5545 RRULE
  dtstart: ISODateTime;         // TZ必須推奨
  exdates?: ISODateTime[] | null;
  rdates?: ISODateTime[] | null;
  until?: ISODateTime | null;
};

export type EventOverride = {
  occurrence_date: ISODate;     // 例: '2025-10-15'
  cancelled: boolean;
  title?: string;
  description?: string;
  start_at?: TimeHM;
  end_at?: TimeHM;
  priority?: 'low' | 'normal' | 'high';
};

export type EventTagRef = {
  tag_id: ID;
};

export type EventEntity = {
  event_id: ID;
  calendar_id: ID;
  title: string;
  description: string;
  start_at: TimeHM;             // 'HH:mm'
  end_at: TimeHM;               // 'HH:mm'
  event_shares: EventShare[];
  followers_share: boolean;
  link_token: string | null;    // 推奨: 難読なBase62(22–32桁), 短期TTL運用
  priority: 'low' | 'normal' | 'high';
  recurrence?: EventRecurrence;
  overrides: EventOverride[];
  tags: EventTagRef[];
  updated_by: ID;
  updated_at: ISODateTime;
};

export type PushReminder = {
  reminder_id: ID;
  event_id: ID;
  absolute_at: ISODateTime;
  updated_at: ISODateTime;
};

export type EventTag = {
  tag_id: ID;
  name: string;
  updated_at: ISODateTime;
};

export type Plan = {
  plan_code: string; // 例: 'free'
  name: string;
  description: string | null;
  max_group_members_per_group: number;
  max_groups_per_owner: number;
  max_calendars_per_owner: number;
  price_monthly_cents: number;
  currency: string;  // 例: 'JPY'
  updated_at: ISODateTime;
};

export type Subscription = {
  sub_id: ID;
  org_id: ID;
  user_id: ID | null;
  plan_code: string;
  status: 'active' | 'canceled' | 'past_due';
  trial_end: ISODateTime | null;
  current_period_start: string; // 'YYYY-MM-DD'
  current_period_end: string;   // 'YYYY-MM-DD'
  updated_at: ISODateTime;
};

export type ServerEntities = {
  organizations: Record<ID, Organization>;
  follows: Record<ID, FollowUser>;
  groups: Record<ID, Group>;
  org_relationships: OrgRelationship[];
  calendars: Record<ID, CalendarEntity>;
  events: Record<ID, EventEntity>;
  push_reminders: PushReminder[];
  event_tags: Record<ID, EventTag>;
  plans: Record<string, Plan>;
  subscriptions: Record<ID, Subscription>;
};

export type ServerDataset = {
  version: 2;
  profile: ServerProfile;
  sync: { hashes: ServerSyncHashes };
  tombstones: ServerTombstones;
  entities: ServerEntities;
};

// ---------------------------------------------
// クライアント側（端末固有・同期しない）設定（クライアントJSONに対応）
// ---------------------------------------------

export type ClientMeta = {
  schema: string;           // 例: 'client_prefs.v1'
  updated_at: ISODateTime;  // 最終更新
  app_version: string;      // 例: '0.1.0'
  device_id: string;        // 例: 'android-pixel-6a'
};

export type ClientNicknames = Record<ID, string>;

export type ClientCalendarStyle = {
  font_family: string;
  font_color: HexColor;
  background_color: HexColor;
  border_color: HexColor;
};

export type ClientCalendarPrefs = {
  background_image?: UrlOrPath;         // ローカルURI or content://
  event_style_default: ClientCalendarStyle;
  overlays?: Array<{
    calendar_id: ID;                    // 重ねて表示するカレンダー
    event_filters?: {                   // オプションの絞り込み
      tags_in?: ID[];
      text_query?: string;
      priority_in?: Array<'low' | 'normal' | 'high'>;
    };
  }>;
};

export type ClientEventStyleOverrides = Record<
  ID,
  {
    font_family?: string;
    font_color?: HexColor;
    background_color?: HexColor;
    border_color?: HexColor;
  }
>;

export type ClientEventNotification =
  | {
      type: 'absolute';
      at: ISODateTime;                 // 絶対時刻
      channel: string;                 // 例: 'reminders' | 'default'
      allow_override?: boolean;
    }
  | {
      type: 'offset';
      offset_minutes: number;          // 例: 15
      channel: string;
      allow_override?: boolean;
    };

export type ClientEventNotifications = Record<ID, ClientEventNotification[]>;

export type ClientNotificationChannel = {
  importance: 'default' | 'low' | 'min' | 'high';
  sound: 'default' | 'none' | UrlOrPath;
  vibrate: boolean;
};

export type ClientNotificationsConfig = {
  channels: Record<string, ClientNotificationChannel>;
  requires_exact_alarm: boolean;
  ignore_battery_optimizations_hint: boolean;
  reschedule_after_boot: boolean;
};

export type ClientSyncPrefs = {
  auto_on_app_start: boolean;
  auto_on_foreground: boolean;
  periodic_minutes: number; // 例: 60
  network: {
    wifi_only: boolean;
    allow_roaming: boolean;
  };
  conflict_policy: 'last_write_wins' | 'client_wins' | 'server_wins';
};

export type ClientStoragePrefs = {
  cache: {
    max_mb: number;
    avatar_ttl_hours: number;
    bg_image_ttl_hours: number;
  };
  backup: {
    allow_os_backup: boolean;
  };
};

export type ClientDisplayPrefs = {
  theme: 'light' | 'dark' | 'system';
  week_start: 'mon' | 'sun';
  show_holidays: boolean;
  show_week_numbers: boolean;
  time_format: '24h' | '12h';
  tz_follow_device: boolean;
};

export type ClientAccessibilityPrefs = {
  max_font_scale: number; // 例: 1.3
  high_contrast: boolean;
  reduce_motion: boolean;
};

export type ClientPrivacyPrefs = {
  redaction_level: 'none' | 'title_only' | 'busy_only';
};

export type ClientSecurityPrefs = {
  app_lock: {
    enabled: boolean;
    method: 'biometric' | 'pin' | 'pattern';
    auto_lock_seconds: number;
  };
};

export type ClientLoggingPrefs = {
  send_crash_reports: boolean;
  log_level: 'error' | 'warn' | 'info' | 'debug';
};

export type ClientFeatureFlags = {
  follows: boolean;
  tags: boolean;
  experimental: {
    agenda_compact_mode: boolean;
  };
};

export type ClientPrefs = {
  version: 1;
  meta: ClientMeta;
  users: { nicknames: ClientNicknames };
  calendars: Record<ID, ClientCalendarPrefs>;
  events: {
    style_overrides: ClientEventStyleOverrides;
    notifications: ClientEventNotifications;
  };
  notifications: ClientNotificationsConfig;
  sync: ClientSyncPrefs;
  storage: ClientStoragePrefs;
  display: ClientDisplayPrefs;
  accessibility: ClientAccessibilityPrefs;
  privacy: ClientPrivacyPrefs;
  security: ClientSecurityPrefs;
  logging: ClientLoggingPrefs;
  features: ClientFeatureFlags;
};

// ---------------------------------------------
// 空オブジェクト（初期生成用）
// ---------------------------------------------

export const emptyServerDataset: ServerDataset = {
  version: 2,
  profile: {
    current_user_id: '{ログインユーザID}',
    default_tz: '{ユーザのタイムゾーン 例: Asia/Tokyo}',
    locale: '{ユーザの国・地域 例: ja-JP}',
    profile_image_path: '{プロフィール画像URLまたはパス}',
    username: '{本名などの企業向けの名前}',
    username_url: '{一意なURL用の名前 例: taro-yamada}',
    display_name: '{外部公開用の表示名}',
    email: '{メールアドレス}',
    updated_at: '{更新日時 例: 2025-10-01T00:00:00Z}',
  },
  sync: {
    hashes: {
      document: '{更新用ハッシュ値}',
      profile: '{更新用ハッシュ値}',
      tombstones: '{更新用ハッシュ値}',
      organizations: '{更新用ハッシュ値}',
      follows: '{更新用ハッシュ値}',
      groups: '{更新用ハッシュ値}',
      org_relationships: '{更新用ハッシュ値}',
      calendars: '{更新用ハッシュ値}',
      events: '{更新用ハッシュ値}',
      push_reminders: '{更新用ハッシュ値}',
      event_tags: '{更新用ハッシュ値}',
      plans: '{更新用ハッシュ値}',
      subscriptions: '{更新用ハッシュ値}',
    },
  },
  tombstones: {
    organizations: [],
    follows: [],
    groups: [],
    org_relationships: [],
    calendars: [],
    events: [],
    push_reminders: [],
    event_tags: [],
    subscriptions: [],
    plans: [],
    updated_at: '{更新日時 例: 2025-10-01T00:00:00Z}',
  },
  entities: {
    organizations: {},
    follows: {},
    groups: {},
    org_relationships: [],
    calendars: {},
    events: {},
    push_reminders: [],
    event_tags: {},
    plans: {},
    subscriptions: {},
  },
};

export const emptyClientPrefs: ClientPrefs = {
  version: 1,
  meta: {
    schema: 'client_prefs.v1',
    updated_at: '{更新日時 例: 2025-10-08T00:00:00Z}',
    app_version: '{アプリ版数 例: 0.1.0}',
    device_id: '{デバイス識別子 例: android-pixel-6a}',
  },
  users: {
    nicknames: {},
  },
  calendars: {},
  events: {
    style_overrides: {},
    notifications: {},
  },
  notifications: {
    channels: {
      default: { importance: 'default', sound: 'default', vibrate: true },
      reminders: { importance: 'high', sound: 'default', vibrate: true },
      silent: { importance: 'low', sound: 'none', vibrate: false },
    },
    requires_exact_alarm: false,
    ignore_battery_optimizations_hint: false,
    reschedule_after_boot: true,
  },
  sync: {
    auto_on_app_start: true,
    auto_on_foreground: true,
    periodic_minutes: 60,
    network: { wifi_only: false, allow_roaming: false },
    conflict_policy: 'last_write_wins',
  },
  storage: {
    cache: { max_mb: 128, avatar_ttl_hours: 168, bg_image_ttl_hours: 720 },
    backup: { allow_os_backup: true },
  },
  display: {
    theme: 'system',
    week_start: 'mon',
    show_holidays: true,
    show_week_numbers: false,
    time_format: '24h',
    tz_follow_device: true,
  },
  accessibility: {
    max_font_scale: 1.3,
    high_contrast: false,
    reduce_motion: false,
  },
  privacy: { redaction_level: 'none' },
  security: {
    app_lock: { enabled: false, method: 'biometric', auto_lock_seconds: 120 },
  },
  logging: { send_crash_reports: true, log_level: 'info' },
  features: { follows: true, tags: true, experimental: { agenda_compact_mode: false } },
};
