// src/store/appData.ts

// ===============================================
// AppData container (server v2 / client prefs v1)
// ===============================================

export type AppData = {
  server?: ServerDocV2 | unknown; // サーバ同期ドキュメント（version:2想定・最小定義）
  prefs?: ClientPrefsV1 | unknown; // クライアント設定（version:1）
};

// -------- Server v2 (最小の型：必要になったら拡張) --------
export type ServerDocV2 = {
  version: 2;
  // 今回UIでは未使用。必要になったら定義を足してください。
  // profile, entities, calendars, events ...etc
};

// -------- Client Prefs v1（今回UIで使う部分を厳密化） --------
export type ClientPrefsV1 = {
  version: 1;
  meta?: {
    schema?: string;
    updated_at?: string;
    app_version?: string;
    device_id?: string;
  };
  users?: {
    nicknames?: Record<string, string>;
  };
  calendars?: Record<
    string,
    {
      background_image?: string | null;
      /** ← 追加: カレンダーの小アイコンURI（file://, content://, https:// など） */
      icon_image_path?: string | null;

      event_style_default?: {
        font_family?: string;
        font_color?: string;
        background_color?: string;
        border_color?: string;
      };

      overlays?: Array<{
        calendar_id?: string;
        event_filters?: {
          tags_include?: string[];
          tags_exclude?: string[];
          priority_min?: 'low' | 'normal' | 'high';
        };
      }>;
    }
  >;

  events?: {
    style_overrides?: Record<
      string,
      {
        font_family?: string;
        font_color?: string;
        background_color?: string;
        border_color?: string;
      }
    >;
    notifications?: Record<
      string,
      Array<{
        type?: 'offset' | 'absolute';
        at?: string; // ISO8601
        offset_minutes?: number;
        channel?: string;
        allow_override?: boolean;
      }>
    >;
  };

  notifications?: {
    channels?: Record<
      string,
      {
        importance?: 'default' | 'low' | 'min' | 'high';
        sound?: 'default' | 'none' | string;
        vibrate?: boolean;
      }
    >;
    requires_exact_alarm?: boolean;
    ignore_battery_optimizations_hint?: boolean;
    reschedule_after_boot?: boolean;
  };

  // 以降のセクションは今回UIでは未使用（必要時に参照）
  sync?: unknown;
  storage?: unknown;
  display?: {
    theme?: 'light' | 'dark' | 'system';
    week_start?: 'mon' | 'sun';
    show_holidays?: boolean;
    show_week_numbers?: boolean;
    time_format?: '24h' | '12h';
    tz_follow_device?: boolean;
  };
  accessibility?: unknown;
  privacy?: unknown;
  security?: unknown;
  logging?: unknown;
  features?: unknown;
};

// -----------------------------------------------
// 実体（テスト用データを定義）
//  - 必要ならネイティブや起動時ロードで上書きされる想定
// -----------------------------------------------

export const server: ServerDocV2 | undefined = {
  version: 2,
};

// ✅ ここにテスト用の背景画像設定を入れています
export const prefs: ClientPrefsV1 | undefined = {
  version: 1,
  meta: {
    schema: 'client-prefs-v1',
    updated_at: new Date().toISOString(),
    app_version: '0.1.0',
  },
  display: {
    theme: 'dark',
    week_start: 'sun',
    time_format: '24h',
    tz_follow_device: true,
    show_holidays: false,
    show_week_numbers: false,
  },
  users: {
    nicknames: {
      u1: 'Alice',
      u2: 'Bob',
    },
  },
  calendars: {
    // あなたのアプリ側でデフォルト利用しているIDに合わせておくと拾われます
    // （例：CAL_LOCAL_DEFAULT）
    CAL_LOCAL_DEFAULT: {
      // ▼ 好きな画像URLに差し替えてOK（https/file/content スキーム対応）
    //   background_image:
    //     'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop',
      icon_image_path:
        'https://images.unsplash.com/photo-1544006659-f0b21884ce1d?q=80&w=100&auto=format&fit=crop',
      event_style_default: {
        // ダークテーマでのデフォルト色（必要なら）
        font_color: '#e2e8f0',
        background_color: 'rgba(96,165,250,0.12)',
        border_color: '#60a5fa',
      },
    },

    // 追加のカレンダー例
    CAL_TEAM: {
      background_image: null, // 背景なし（APP_BGで表示される想定）
      icon_image_path: null,
      event_style_default: {
        font_color: '#e2e8f0',
        background_color: 'rgba(16,185,129,0.12)',
        border_color: '#10b981',
      },
    },
  },
};

// 既存API（互換）
export function getAppData(): AppData {
  return { server, prefs };
}

// ===============================================
// Type Guards
// ===============================================
function isClientPrefsV1(v: any): v is ClientPrefsV1 {
  return v && typeof v === 'object' && v.version === 1;
}

// ===============================================
// Safe getters for UI
// ===============================================

/** 指定カレンダーの prefs を返す（なければ undefined） */
export function getCalendarPrefs(calendarId?: string | null) {
  if (!isClientPrefsV1(prefs)) return undefined;
  const id = calendarId ? String(calendarId) : '';
  return prefs.calendars?.[id];
}

/** カレンダーの背景画像URI（未設定なら undefined） */
export function getCalendarBackgroundImage(calendarId?: string | null): string | undefined {
  const p = getCalendarPrefs(calendarId);
  const raw = p?.background_image ?? undefined;
  return raw ? String(raw) : undefined;
}

/** カレンダーのアイコン画像URI（未設定なら undefined） */
export function getCalendarIconPath(calendarId?: string | null): string | undefined {
  const p = getCalendarPrefs(calendarId);
  const raw = p?.icon_image_path ?? undefined;
  return raw ? String(raw) : undefined;
}

/** カレンダーの既定イベントスタイル（未設定なら空オブジェクト） */
export function getCalendarEventDefaultStyle(calendarId?: string | null): {
  font_family?: string;
  font_color?: string;
  background_color?: string;
  border_color?: string;
} {
  const p = getCalendarPrefs(calendarId);
  return (
    p?.event_style_default ?? {
      // デフォルトは空。UI側でフォールバック色を当てる想定
    }
  );
}

/** ユーザのニックネーム（未設定なら undefined） */
export function getNickname(userId?: string | null): string | undefined {
  if (!isClientPrefsV1(prefs)) return undefined;
  const id = userId ? String(userId) : '';
  const name = prefs.users?.nicknames?.[id];
  return name ? String(name) : undefined;
}

export default {
  server,
  prefs,
  getAppData,
  getCalendarPrefs,
  getCalendarIconPath,
  getCalendarBackgroundImage,
  getCalendarEventDefaultStyle,
  getNickname,
};
