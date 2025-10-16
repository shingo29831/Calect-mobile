// src/store/appData.ts

// ===============================================
// AppData container (server v2 / client prefs v1)
// ===============================================

export type AppData = {
  server?: ServerDocV2 | unknown; // 繧ｵ繝ｼ繝仙酔譛溘ラ繧ｭ繝･繝｡繝ｳ繝茨ｼ・ersion:2諠ｳ螳壹・譛蟆丞ｮ夂ｾｩ・・
  prefs?: ClientPrefsV1 | unknown; // 繧ｯ繝ｩ繧､繧｢繝ｳ繝郁ｨｭ螳夲ｼ・ersion:1・・
};

// -------- Server v2 (譛蟆上・蝙具ｼ壼ｿ・ｦ√↓縺ｪ縺｣縺溘ｉ諡｡蠑ｵ) --------
export type ServerDocV2 = {
  version: 2;
  // 莉雁屓UI縺ｧ縺ｯ譛ｪ菴ｿ逕ｨ縲ょｿ・ｦ√↓縺ｪ縺｣縺溘ｉ螳夂ｾｩ繧定ｶｳ縺励※縺上□縺輔＞縲・
  // profile, entities, calendars, events ...etc
};

// -------- Client Prefs v1・井ｻ雁屓UI縺ｧ菴ｿ縺・Κ蛻・ｒ蜴ｳ蟇・喧・・--------
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
      /** 竊・霑ｽ蜉: 繧ｫ繝ｬ繝ｳ繝繝ｼ縺ｮ蟆上い繧､繧ｳ繝ｳURI・・ile://, content://, https:// 縺ｪ縺ｩ・・*/
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

  // 莉･髯阪・繧ｻ繧ｯ繧ｷ繝ｧ繝ｳ縺ｯ莉雁屓UI縺ｧ縺ｯ譛ｪ菴ｿ逕ｨ・亥ｿ・ｦ∵凾縺ｫ蜿ら・・・
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
// 螳滉ｽ難ｼ医ユ繧ｹ繝育畑繝・・繧ｿ繧貞ｮ夂ｾｩ・・
//  - 蠢・ｦ√↑繧峨ロ繧､繝・ぅ繝悶ｄ襍ｷ蜍墓凾繝ｭ繝ｼ繝峨〒荳頑嶌縺阪＆繧後ｋ諠ｳ螳・
// -----------------------------------------------

export const server: ServerDocV2 | undefined = {
  version: 2,
};

// 笨・縺薙％縺ｫ繝・せ繝育畑縺ｮ閭梧勹逕ｻ蜒剰ｨｭ螳壹ｒ蜈･繧後※縺・∪縺・
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
    // 縺ゅ↑縺溘・繧｢繝励Μ蛛ｴ縺ｧ繝・ヵ繧ｩ繝ｫ繝亥茜逕ｨ縺励※縺・ｋID縺ｫ蜷医ｏ縺帙※縺翫￥縺ｨ諡ｾ繧上ｌ縺ｾ縺・
    // ・井ｾ具ｼ咾AL_LOCAL_DEFAULT・・
    CAL_LOCAL_DEFAULT: {
    //   // 笆ｼ 螂ｽ縺阪↑逕ｻ蜒酋RL縺ｫ蟾ｮ縺玲崛縺医※OK・・ttps/file/content 繧ｹ繧ｭ繝ｼ繝蟇ｾ蠢懶ｼ・
    //   background_image:
    //     'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop',
      icon_image_path:
        'https://images.unsplash.com/photo-1544006659-f0b21884ce1d?q=80&w=100&auto=format&fit=crop',
      event_style_default: {
        // 繝繝ｼ繧ｯ繝・・繝槭〒縺ｮ繝・ヵ繧ｩ繝ｫ繝郁牡・亥ｿ・ｦ√↑繧会ｼ・
        font_color: '#e2e8f0',
        background_color: 'rgba(96,165,250,0.12)',
        border_color: '#60a5fa',
      },
    },

    // 霑ｽ蜉縺ｮ繧ｫ繝ｬ繝ｳ繝繝ｼ萓・
    CAL_TEAM: {
      background_image: null, // 閭梧勹縺ｪ縺暦ｼ・PP_BG縺ｧ陦ｨ遉ｺ縺輔ｌ繧区Φ螳夲ｼ・
      icon_image_path: null,
      event_style_default: {
        font_color: '#e2e8f0',
        background_color: 'rgba(16,185,129,0.12)',
        border_color: '#10b981',
      },
    },
  },
};

// 譌｢蟄連PI・井ｺ呈鋤・・
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

/** 謖・ｮ壹き繝ｬ繝ｳ繝繝ｼ縺ｮ prefs 繧定ｿ斐☆・医↑縺代ｌ縺ｰ undefined・・*/
export function getCalendarPrefs(calendarId?: string | null) {
  if (!isClientPrefsV1(prefs)) return undefined;
  const id = calendarId ? String(calendarId) : '';
  return prefs.calendars?.[id];
}

/** 繧ｫ繝ｬ繝ｳ繝繝ｼ縺ｮ閭梧勹逕ｻ蜒酋RI・域悴險ｭ螳壹↑繧・undefined・・*/
export function getCalendarBackgroundImage(calendarId?: string | null): string | undefined {
  const p = getCalendarPrefs(calendarId);
  const raw = p?.background_image ?? undefined;
  return raw ? String(raw) : undefined;
}

/** 繧ｫ繝ｬ繝ｳ繝繝ｼ縺ｮ繧｢繧､繧ｳ繝ｳ逕ｻ蜒酋RI・域悴險ｭ螳壹↑繧・undefined・・*/
export function getCalendarIconPath(calendarId?: string | null): string | undefined {
  const p = getCalendarPrefs(calendarId);
  const raw = p?.icon_image_path ?? undefined;
  return raw ? String(raw) : undefined;
}

/** 繧ｫ繝ｬ繝ｳ繝繝ｼ縺ｮ譌｢螳壹う繝吶Φ繝医せ繧ｿ繧､繝ｫ・域悴險ｭ螳壹↑繧臥ｩｺ繧ｪ繝悶ず繧ｧ繧ｯ繝茨ｼ・*/
export function getCalendarEventDefaultStyle(calendarId?: string | null): {
  font_family?: string;
  font_color?: string;
  background_color?: string;
  border_color?: string;
} {
  const p = getCalendarPrefs(calendarId);
  return (
    p?.event_style_default ?? {
      // 繝・ヵ繧ｩ繝ｫ繝医・遨ｺ縲６I蛛ｴ縺ｧ繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ濶ｲ繧貞ｽ薙※繧区Φ螳・
    }
  );
}

/** 繝ｦ繝ｼ繧ｶ縺ｮ繝九ャ繧ｯ繝阪・繝・域悴險ｭ螳壹↑繧・undefined・・*/
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
