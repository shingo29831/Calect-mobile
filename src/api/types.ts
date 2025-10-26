// src/api/types.ts
// ======================================================
// Calect API / Local schema (Version 2) — TypeScript types
// - サーバ由来の「ドキュメント」（profile/sync/hashes/tombstones/entities…）
// - アプリ内部で使う軽量 Event / EventInstance 型（現行UI互換）
// - ULID / IDs / helpers
// ======================================================

export type ULID = string;          // "01JC2X7M3A9Z6..." (Crockford Base32 26桁想定)
export type Base62 = string;        // 共有リンクなど
export type ISODate = string;       // "2025-10-03"
export type ISODateTime = string;   // "2025-10-03T12:34:56Z" or "...+09:00"
export type Time = string;         // "hh:mm"
export type HexColor = string;      // "#2563EB" / "#e4a982ff"

export type YesNoBool = boolean | 'true' | 'false'; // JSON混在対策（段階移行用）

export type EventVisibility = 'Hidden' | 'Busy' | 'Title' | 'Summary';
export type PriorityLevel = 'Low' | 'Normal' | 'High';

// ------------------------------------------------------
// v2 Server Document (サーバが返すルートJSONの型)
// ------------------------------------------------------
export type ServerDocV2 = {
  version: 2;

  profile: {
    current_user_id: ULID;
    default_tz: string;         // e.g., "Asia/Tokyo"
    locale: string;             // e.g., "ja-JP"
    profile_image_path: string | null;
    username: string | null;
    username_url: string | null;  // ^[a-z0-9-]{3,32}$
    display_name: string | null;
    email: string | null;
    updated_at: ISODateTime;
  };

  sync: {
    hashes: {
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
  };

  tombstones: {
    organizations: ULID[];
    follows: ULID[];
    groups: ULID[];
    org_relationships: ULID[];
    calendars: ULID[];
    events: ULID[];
    push_reminders: ULID[];
    event_tags: ULID[];
    subscriptions: ULID[];
    plans: string[];         // plan_code
    updated_at: ISODateTime;
  };

  entities: {
    organizations: Record<ULID, {
      org_id: ULID;
      name: string;
      plan: string;          // "free" | "pro" | ...
      locale: string;
      tz: string;
    }>;

    follows: Record<ULID, {
      user_id: ULID;
      display_name: string;
      profile_image_path: string | null;
    }>;

    groups: Record<ULID, {
      group_id: ULID;
      owner_org_id: ULID | null;
      owner_user_id: ULID | null;
      name: string;
      members: Record<ULID, {
        user_id: ULID;
        name: string;
        role: 'owner' | 'member' | 'admin';
        can_share: YesNoBool;
        can_invite: YesNoBool;
      }>;
      updated_at: ISODateTime;
    }>;

    org_relationships: Array<{
      org_id: ULID;
      role: 'owner' | 'member' | 'admin';
      can_invite: YesNoBool;
      can_share: YesNoBool;
      updated_at: ISODateTime;
    }>;

    calendars: Record<ULID, {
      calendar_id: ULID;
      owner_user_id: ULID | null;
      owner_group_id: ULID | null;
      name: string;
      color: HexColor;
      calendar_shares: Array<{
        user_id: ULID | null;
        group_id: ULID | null;
        content_visibility: EventVisibility;
      }>;
      updated_at: ISODateTime;
      deleted_at: ISODateTime | null;
    }>;

    events: Record<ULID, {
      event_id: ULID;
      title: string;
      summary: string | null;

      rrule: string;                       // RFC5545
      start_at: Time;                    // "HH:mm"
      end_at: Time;                      // "HH:mm"
      dtstart: ISODate;                    // series start
      dtend: ISODate;               // series end
      tz: string;

      color: HexColor | null;

      // 1イベントが複数カレンダーへ「リンク」される（mirror/alias/copy など）
      calendar_links: Array<{
        link_id: string;                     // ULID/Base62 任意
        calendar_id: ULID;
        content_visibility: EventVisibility;
        role?: 'mirror' | 'alias' | 'copy';
        created_by: ULID;
        updated_at: ISODateTime;
        deleted_at: ISODateTime | null;
      }>;

      event_shares: Array<{
        user_id: ULID | null;
        group_id: ULID | null;
        content_visibility: EventVisibility
      }>;

      //followers_share: YesNoBool; // フォロワーへの共有はevent_sharesに統合
      link_token: Base62 | null;             // 22–32桁推奨・TTL運用

      priority: PriorityLevel;

      overrides?: Array<{
        occurrence_date: ISODate;
        cancelled?: YesNoBool;
        title?: string;
        summary?: string;
        start_at?: Time;                   // "HH:mm"
        end_at?: Time;                     // "HH:mm"
        priority?: PriorityLevel;
      }>;

      tags?: Array<{ tag_id: ULID }>;

      created_by: ULID;
      updated_by: ULID;
      updated_at: ISODateTime;
    }>;

    push_reminders: Array<{
      reminder_id: ULID;
      event_id: ULID;
      absolute_at: ISODateTime;
      updated_at: ISODateTime;
    }>;

    event_tags: Record<ULID, {
      tag_id: ULID;
      name: string;
      updated_at: ISODateTime;
    }>;

    plans: Record<string, {
      plan_code: string;     // "free" etc.
      name: string;
      summary: string | null;
      max_group_members_per_group: number;
      max_groups_per_owner: number;
      max_calendars_per_owner: number;
      price_monthly_cents: number;
      currency: string;      // "JPY" etc.
      updated_at: ISODateTime;
    }>;

    subscriptions: Record<ULID, {
      sub_id: ULID;
      org_id: ULID;
      user_id: ULID | null;
      plan_code: string;
      status: 'active' | 'canceled' | 'past_due';
      trial_end: ISODateTime | null;
      current_period_start: ISODate;
      current_period_end: ISODate;
      updated_at: ISODateTime;
    }>;
  };
};

// ------------------------------------------------------
// UI/ローカルが使う軽量イベント構造（現行UI互換）
//   - 既存コードが参照している Event / EventInstance を維持
//   - recurrence 展開は月シャードで実施
// ------------------------------------------------------


export type Event = {
  event_id: ULID;                // サーバ確定ID or 一時ID(=cid_ulid)
  cid_ulid?: ULID | null;        // 一時ID（オフライン作成時）
  calendar_id: ULID;             // UIが選んだ表示元カレンダー
  title: string;
  summary: string | null;
  rrule: string;                       // RFC5545
  start_at: Time;                    // "HH:mm"
  end_at: Time;                      // "HH:mm"
  dtstart: ISODate;                    // series start
  dtend: ISODate;               // series end
  tz: string | 'local';
  tags?: string[];
  visibility: EventVisibility;
  priority: PriorityLevel;
};

export type EventInstance = {
  instance_id: number | string;  // UI用一意キー
  event_id: ULID;
  cid_ulid?: ULID | null;
  calendar_id: ULID;
  title: string;
  summary: string | null;
  rrule: string;                       // RFC5545
  start_at: Time;                    // "HH:mm"
  end_at: Time;                      // "HH:mm"
  dtstart: ISODate;                    // series start
  dtend: ISODate;               // series end
  tz: string | 'local';
  tags?: string[];
  visibility: EventVisibility;
  priority: PriorityLevel;
  occurrence_key?: string;       // `${event_id}@@${start_at}`
};

// Client-side preferences（UI設定） — 既存画面の一部で参照
export type ClientPrefsV1 = {
  version: number;
  meta?: { updated_at?: ISODateTime; app_version?: string; device_id?: string };
  display?: { week_start?: 'mon' | 'sun'; theme?: 'light'|'dark'|'system'; time_format?: '24h'|'12h' };
  calendars?: Record<string, {
    background_image?: string | null;
    event_style_default?: { font_family?: string; font_color?: string; background_color?: string; border_color?: string };
    overlays?: Array<{ calendar_id: string; event_filters?: unknown }>;
  }>;
};
