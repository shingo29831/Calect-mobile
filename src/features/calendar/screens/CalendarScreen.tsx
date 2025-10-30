// src/features/calendar/screens/CalendarScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue, memo } from 'react';
import {
  View, Text, Pressable, Platform, TextInput, KeyboardAvoidingView, Animated,
  Image, StyleSheet, Switch, PanResponder, GestureResponderEvent, PanResponderGestureState, ScrollView, Alert
} from 'react-native';
import type { AppStateStatus } from 'react-native';
import { CalendarList } from 'react-native-calendars';
import { Calendar as MiniCalendar } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import dayjs from '../../../lib/dayjs';
import { listInstancesByDate, getAllTags } from '../../../store/db';
import { upsertEvent, type UpsertEventInput } from '../services/eventUpsert';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation';
import LinearGradient from 'react-native-linear-gradient';


//  月シャードAPI（新パス固定）
import {
  ensureMonths as ensureMonthsLoaded,
  loadMonth as ensureMonthLoaded,
  // イベントの上書き保存（既存 event_id を upsert）
  upsertEventV2,
} from '../../../data/persistence/monthShard';

//  ローカル全初期化（snapshot / ops / months / queue 等）
import { resetLocalData } from '../../../data/persistence/localStore';

// インスタンス表示の即時反映に使うローカルスナップショット操作
import { writeFile as _lf_write, readFile as _lf_read } from '../../../store/localFile';
// UIへリスト反映を飛ばす（store/db 側の購読に通知）
import { replaceAllInstances } from '../../../store/db';

import {
  EntityItem,
  getMonthRangeDates,
  WeekHeader,
  DayCell,
  SCREEN_H,
  SCREEN_W,
  HAIR_SAFE,
  DAY_FONT,
  MONTH_TITLE_HEIGHT,
  ROWS,
  FIRST_DAY as FIRST_DAY_FALLBACK,
  PROFILE_ICON_SIZE,
  // ▼ 追記：前月・当月・来月のISOレンジ
  getPrevCurrNextRange,
} from '../components/CalendarParts';

import LeftDrawer from '../components/LeftDrawer';
import ProfileDrawer from '../components/ProfileDrawer';
import DayEventsSheet from '../components/DayEventsSheet';
import { useAnimatedDrawer } from '../hooks/useAnimatedDrawer';
import { useMonthEvents } from '../hooks/useMonthEvents';
import { styles } from '../styles/calendarStyles';
import { useAppTheme } from '../../../theme';
import type { ServerDocV2 } from '../../../data/persistence/schemas';
import { EventVisibility } from 'src/api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Calendar'>;
type SortMode = 'span' | 'start';

/* =======================
 * 今日文字列を日付またぎで更新するフック
 * ======================= */
function useTodayTick(fmt: string = 'YYYY-MM-DD') {
  const [todayStr, setTodayStr] = useState(() => dayjs().format(fmt));

  useEffect(() => {
    let timer: any;
    const schedule = () => {
      const now = dayjs();
      const next = now.add(1, 'day').startOf('day');
      const ms = Math.max(1000, next.diff(now, 'millisecond'));
      timer = setTimeout(() => {
        setTodayStr(dayjs().format(fmt));
        schedule();
      }, ms);
    };
    schedule();
    return () => timer && clearTimeout(timer);
  }, [fmt]);

  return todayStr;
}

/* --------- 新JSON(v2)に完全対応した型定義 --------- */
type Hashes = {
  document?: string; profile?: string; tombstones?: string; organizations?: string; follows?: string;
  groups?: string; org_relationships?: string; calendars?: string; events?: string; push_reminders?: string;
  event_tags?: string; plans?: string; subscriptions?: string;
};

type ClientPrefsV1 = {
  version: number;
  meta?: { updated_at?: string; app_version?: string; device_id?: string };
  display?: { week_start?: 'mon' | 'sun'; theme?: 'light'|'dark'|'system'; time_format?: '24h'|'12h' };
  calendars?: Record<string, {
    background_image?: string | null;
    event_style_default?: { font_family?: string; font_color?: string; background_color?: string; border_color?: string };
    overlays?: Array<{ calendar_id: string; event_filters?: unknown }>;
  }>;
};

async function loadAppData(): Promise<{ server?: ServerDocV2; prefs?: ClientPrefsV1 }> {
  try {
    const m: any = await import('../../../config/appData');
    if (typeof m?.getAppData === 'function') return m.getAppData();
    if (m?.default && (m.default.server || m.default.prefs)) return m.default;
    return { server: m.server, prefs: m.prefs };
  } catch {
    return {};
  }
}

/** ==================
 *  HourDial
 *  ================== */
type HourDialProps = {
  size?: number;
  innerRatio?: number;
  outerRatio?: number;
  thresholdRatio?: number;
  value?: number | null;
  onChange: (hour: number) => void;
  onConfirm: (hour: number) => void;
  selectedColor?: string;
  textColor?: string;
};
const HourDial: React.FC<HourDialProps> = memo(({
  size = 380,
  innerRatio = 0.50,
  outerRatio = 0.78,
  thresholdRatio = 0.64,
  value = null,
  onChange,
  onConfirm,
  selectedColor = '#2563eb',
  textColor = '#111',
}) => {
  const radius = size / 2;
  const itemsInner = Array.from({ length: 12 }, (_, h) => h);
  const itemsOuter = Array.from({ length: 12 }, (_, i) => i + 12);

  const pickFromXY = useCallback((x: number, y: number) => {
    const dx = x - radius;
    const dy = y - radius;

    let ang = Math.atan2(dy, dx);
    ang = ang + Math.PI / 2;
    if (ang < 0) ang += Math.PI * 2;
    const deg = (ang * 180) / Math.PI;

    const r = Math.sqrt(dx * dx + dy * dy);
    const ratio = r / radius;
    const isOuter = ratio >= thresholdRatio;

    const index = Math.round((deg / 360) * 12) % 12;
    const hour = isOuter ? (12 + index) % 24 : index;
    return hour;
  }, [radius, thresholdRatio]);

  const handleMove = useCallback((evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    const h = pickFromXY(locationX, locationY);
    onChange(h);
  }, [pickFromXY, onChange]);

  const handleRelease = useCallback((evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    const h = pickFromXY(locationX, locationY);
    onConfirm(h);
  }, [pickFromXY, onConfirm]);

  const ring = (items: number[], ringRatio: number) => (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none">
      {items.map((h) => {
        const idx = h % 12;
        const angle = ((idx / 12) * 360 - 90) * (Math.PI / 180);
        const r = radius * ringRatio;
        const x = radius + r * Math.cos(angle);
        const y = radius + r * Math.sin(angle);
        const selected = value === h;
        return (
          <View
            key={h}
            style={{
              position: 'absolute',
              left: x - 24,
              top:  y - 24,
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? selectedColor : 'transparent',
            }}
          >
            <Text style={{ fontWeight: '800', fontSize: 16, color: selected ? '#fff' : textColor }}>{h}</Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleMove}
      onResponderMove={handleMove}
      onResponderRelease={handleRelease}
      onResponderTerminate={handleRelease}
    >
      {ring(itemsOuter, outerRatio)}
      {ring(itemsInner, innerRatio)}

      <View
        style={{
          width: radius * 0.9,
          height: radius * 0.9,
          borderRadius: (radius * 0.9) / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        pointerEvents="none"
      >
        <Text style={{ fontSize: 28, fontWeight: '900', color: textColor }}>{value ?? '--'}:00</Text>
      </View>
    </View>
  );
});

/** ==================
 *  MinuteDial
 *  ================== */
type MinuteDialProps = {
  size?: number;
  ringRatio?: number;
  value?: number | null;
  onChange: (min: number) => void;
  onConfirm: (min: number) => void;
  selectedColor?: string;
  textColor?: string;
};
const MinuteDial: React.FC<MinuteDialProps> = memo(({
  size = 380,
  ringRatio = 0.78,
  value = null,
  onChange,
  onConfirm,
  selectedColor = '#2563eb',
  textColor = '#111',
}) => {
  const radius = size / 2;

  const pickFromXY = useCallback((x: number, y: number) => {
    const dx = x - radius;
    const dy = y - radius;
    let ang = Math.atan2(dy, dx);
    ang = ang + Math.PI / 2;
    if (ang < 0) ang += Math.PI * 2;
    const minFloat = (ang / (Math.PI * 2)) * 60;
    const m = Math.round(minFloat) % 60;
    return m;
  }, [radius]);

  const handleMove = useCallback((evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    const m = pickFromXY(locationX, locationY);
    onChange(m);
  }, [pickFromXY, onChange]);

  const handleRelease = useCallback((evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;
    const m = pickFromXY(locationX, locationY);
    onConfirm(m);
  }, [pickFromXY, onConfirm]);

  const items = Array.from({ length: 60 }, (_, i) => i);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleMove}
      onResponderMove={handleMove}
      onResponderRelease={handleRelease}
      onResponderTerminate={handleRelease}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none">
        {items.map((m) => {
          const angle = ((m / 60) * 360 - 90) * (Math.PI / 180);
          const r = radius * 0.78;
          const x = radius + r * Math.cos(angle);
          const y = radius + r * Math.sin(angle);
          const showLabel = m % 5 === 0;
          const selected = value === m;
          return (
            <View
              key={m}
              style={{
                position: 'absolute',
                left: x - (showLabel ? 22 : 6),
                top: y - (showLabel ? 22 : 6),
                width: showLabel ? 44 : 12,
                height: showLabel ? 44 : 12,
                borderRadius: showLabel ? 22 : 6,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? selectedColor : 'transparent',
              }}
            >
              {showLabel ? (
                <Text style={{ fontWeight: '800', fontSize: 14, color: selected ? '#fff' : textColor }}>{m}</Text>
              ) : (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: selected ? '#fff' : textColor, opacity: 0.35 }} />
              )}
            </View>
          );
        })}
      </View>
      <View
        style={{
          width: radius * 0.9,
          height: radius * 0.9,
          borderRadius: (radius * 0.9) / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        pointerEvents="none"
      >
        <Text style={{ fontSize: 28, fontWeight: '900', color: textColor }}>{value ?? '--'}分</Text>
      </View>
    </View>
  );
});

const useMeasure = () => {
  const ref = useRef<View>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  }, []);
  return { ref, size, onLayout };
};

/** Hue 連続バー */
const HueBar = ({
  hue,
  onChange,
  theme,
  onDragStateChange,
}: {
  hue: number;
  onChange: (h: number) => void;
  theme: ReturnType<typeof useAppTheme>;
  onDragStateChange?: (dragging: boolean) => void;
}) => {
  const { ref, size, onLayout } = useMeasure();
  const handle = useCallback(
    (x: number) => {
      const w = Math.max(1, size.w);
      const ratio = clamp01(x / w);
      onChange(ratio * 360);
    },
    [size.w, onChange]
  );

  const BAR_H = 16;
  const MARK = 12;

  return (
    <View style={{ height: BAR_H, borderRadius: 6, overflow: 'hidden', borderWidth: HAIR_SAFE, borderColor: theme.border }}>
      <View ref={ref as any} onLayout={onLayout} style={{ height: BAR_H }}>
        <LinearGradient
          colors={[0, 60, 120, 180, 240, 300, 360].map((h) => hsvToHex(h, 1, 1))}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            onDragStateChange?.(true);
            handle(e.nativeEvent.locationX);
          }}
          onResponderMove={(e) => handle(e.nativeEvent.locationX)}
          onResponderRelease={() => onDragStateChange?.(false)}
          onResponderTerminate={() => onDragStateChange?.(false)}
        />
        {/* 現在位置マーカー */}
        <View
          style={{
            position: 'absolute',
            left: clamp01(hue / 360) * Math.max(1, size.w) - MARK / 2,
            top: BAR_H / 2 - MARK / 2,
            width: MARK,
            height: MARK,
            borderRadius: MARK / 2,
            borderWidth: 2,
            borderColor: theme.surface,
            backgroundColor: hsvToHex(hue, 1, 1),
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          }}
        />
      </View>
    </View>
  );
};



/** SV 連続ピッカー（ピクセル単位） */
const SVPicker = ({
  hue,
  s,
  v,
  onChange,
  theme,
  onDragStateChange,
}: {
  hue: number;
  s: number;
  v: number;
  onChange: (s: number, v: number) => void;
  theme: ReturnType<typeof useAppTheme>;
  onDragStateChange?: (dragging: boolean) => void;
}) => {
  const { ref, size, onLayout } = useMeasure();

  const handle = useCallback(
    (x: number, y: number) => {
      const w = Math.max(1, size.w);
      const h = Math.max(1, size.h);
      const ss = clamp01(x / w);
      const vv = clamp01(1 - y / h); // 上=明るい(1), 下=暗い(0)
      onChange(ss, vv);
    },
    [size.w, size.h, onChange]
  );

  const markerX = clamp01(s) * Math.max(1, size.w);
  const markerY = (1 - clamp01(v)) * Math.max(1, size.h);

  const R = 10;
  const MARK = 14;

  return (
    <View
      ref={ref as any}
      onLayout={onLayout}
      style={{
        aspectRatio: 1,
        borderRadius: R,
        overflow: 'hidden',
        borderWidth: HAIR_SAFE,
        borderColor: theme.border,
      }}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: hsvToHex(hue, 1, 1) }]} />
      <LinearGradient colors={['#FFFFFF', '#FFFFFF00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['#00000000', '#000000FF']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />

      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          onDragStateChange?.(true);
          handle(e.nativeEvent.locationX, e.nativeEvent.locationY);
        }}
        onResponderMove={(e) => handle(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        onResponderRelease={() => onDragStateChange?.(false)}
        onResponderTerminate={() => onDragStateChange?.(false)}
      />

      {/* マーカー */}
      <View
        style={{
          position: 'absolute',
          left: markerX - MARK / 2,
          top: markerY - MARK / 2,
          width: MARK,
          height: MARK,
          borderRadius: MARK / 2,
          borderWidth: 2,
          borderColor: '#fff',
          backgroundColor: hsvToHex(hue, s, v),
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
        }}
      />
    </View>
  );
};



// ===== フォールバック定数 =====
const ORGS_FALLBACK: EntityItem[] = [
  { id: 'org_me',   label: 'My Schedule', emoji: '🗓️', kind: 'me' },
  { id: 'org_fam',  label: 'Family',      emoji: '👨‍👩‍👧‍👦', kind: 'org' },
  { id: 'org_team', label: 'Team',        emoji: '👥', kind: 'org' },
];

const GROUPS_BY_ORG_FALLBACK: Record<string, EntityItem[]> = {
  org_me:  [ { id: 'grp_me_private', label: 'Private', emoji: '🔒', kind: 'group' } ],
  org_fam: [
    { id: 'grp_fam_all',     label: 'All Members', emoji: '👨‍👩‍👧‍👦', kind: 'group' },
    { id: 'grp_fam_parents', label: 'Parents',     emoji: '🧑‍🦰',      kind: 'group' },
  ],
  org_team: [
    { id: 'grp_team_all', label: 'All Hands',  emoji: '🙌', kind: 'group' },
    { id: 'grp_team_dev', label: 'Developers', emoji: '💻', kind: 'group' },
    { id: 'grp_team_des', label: 'Designers',  emoji: '🎨', kind: 'group' },
  ],
};

const FOLLOWS_FALLBACK: EntityItem[] = [
  { id: 'u1', label: 'Alice', emoji: '👩', kind: 'user' },
  { id: 'u2', label: 'Bob',   emoji: '👨', kind: 'user' },
  { id: 'u3', label: 'Chris', emoji: '🧑', kind: 'user' },
];

// ===== 追加：HSV → HEX ユーティリティ & パレット =====
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
function hsvToHex(h: number, s: number, v: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp01(s);
  v = clamp01(v);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(R)}${toHex(G)}${toHex(B)}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = hex.trim().match(/^#?([0-9a-f]{6})/i);
  if (!m) return { h: 0, s: 0, v: 0 };
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60; if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

/* === 追記：HEX<->RGBA ヘルパー群 === */
const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX8 = /^#([0-9a-f]{8})$/i;

function hexToRgb(hex: string) {
  const m6 = HEX6.exec(hex);
  const m8 = HEX8.exec(hex);
  const raw = (m8 ? m8[1].slice(0, 6) : m6 ? m6[1] : null);
  if (!raw) return { r: 0, g: 0, b: 0 };
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return { r, g, b };
}
function rgbaStringFrom(hex6: string, alpha01: number) {
  const { r, g, b } = hexToRgb(hex6);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha01))})`;
}
function appendAlpha(hex6: string, alpha01: number) {
  const a = Math.round(Math.max(0, Math.min(1, alpha01)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return HEX6.test(hex6) ? `${hex6}${a}` : hex6;
}
function extractAlpha01(hex: string) {
  if (!HEX8.test(hex)) return 1;
  const aa = hex.slice(-2);
  return parseInt(aa, 16) / 255;
}

/** === 追記：Alpha 連続バー === */
const AlphaBar = ({
  width = 260,
  height = 18,
  value,
  onChange,
  baseHex, // #RRGGBB
}: {
  width?: number;
  height?: number;
  value: number;                   // 0..1
  onChange: (a01: number) => void;
  baseHex: string;                 // 不透明の基準色 (#RRGGBB)
}) => {
  const { onLayout, size, ref } = useMeasure();
  const theme = useAppTheme();
  const w = size.w || width;
  const knobX = Math.round(Math.max(0, Math.min(1, value)) * (w - 20));

  const start = rgbaStringFrom(baseHex, 0);
  const end   = rgbaStringFrom(baseHex, 1);

  const pan = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        const a = Math.max(0, Math.min(1, x / Math.max(1, w)));
        onChange(a);
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        const a = Math.max(0, Math.min(1, x / Math.max(1, w)));
        onChange(a);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  return (
    <View style={{ width, alignItems: 'center' }}>
      <View
        ref={ref}
        onLayout={onLayout}
        {...pan.panHandlers}
        style={{
          width, height, borderRadius: 10, overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border,
        }}
      >
        <LinearGradient
          colors={[start, end]}
          style={{ width: '100%', height: '100%' }}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
        />
        {/* ノブ */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', left: knobX, top: -4, width: 20, height: height + 8,
            borderRadius: 10, borderWidth: 2, borderColor: theme.surface,
            backgroundColor: rgbaStringFrom(baseHex, value),
            shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
          }}
        />
      </View>
      <Text style={{ marginTop: 6, fontSize: 11, color: theme.textSecondary }}>
        透明度（Alpha）: {Math.round(value * 100)}%
      </Text>
    </View>
  );
};


// よく使う色のチップ
const COLOR_PALETTE: string[] = [
  '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4',
  '#3B82F6', '#22C55E', '#EAB308', '#F97316', '#EC4899', '#14B8A6',
  '#0EA5E9', '#84CC16', '#E11D48', '#A855F7', '#F43F5E', '#38BDF8',
  '#34D399', '#C084FC', '#111827', '#6B7280', '#D1D5DB', '#FFFFFF'
];

// ステータスバッジ
function StatusBadge({ text }: { text: string }) {
  const theme = useAppTheme();
  return (
    <View style={{
      position: 'absolute', right: 12, top: 8,
      backgroundColor: theme.surface, paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 9999, borderWidth: HAIR_SAFE, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
      elevation: 4, zIndex: 10,
    }}>
      <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export default function CalendarScreen({ navigation }: Props) {
  const theme = useAppTheme();

  //  今日（YYYY-MM-DD）を 0:00 で更新
  const todayStr = useTodayTick('YYYY-MM-DD');

  // ===== スキーマ・プロフィール読み込み =====
  const [{ server, prefs }, setAppData] = useState<{ server?: ServerDocV2; prefs?: ClientPrefsV1 }>({});
  const [schemaReady, setSchemaReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded = await loadAppData();
      if (!alive) return;
      setAppData(loaded);
      setSchemaReady(true);
    })();
    return () => { alive = false; };
  }, []);

  // 背景画像
  const bgImageUri = useMemo(() => {
    const all = Object.values(prefs?.calendars ?? {});
    const first = all.find(c => !!c?.background_image)?.background_image ?? null;
    return (typeof first === 'string' && first.length > 0) ? first : null;
  }, [prefs]);

  // UI 用エンティティ
  const ORGS: EntityItem[] = useMemo(() => {
    const list: EntityItem[] = [];
    const displayName =
      server?.profile?.display_name ||
      server?.profile?.username ||
      'My Schedule';
    list.push({ id: 'org_me', label: displayName, emoji: '🗓️', kind: 'me' });

    const orgs = Object.values(server?.entities?.organizations ?? {});
    for (const o of orgs) list.push({ id: o.org_id, label: o.name, emoji: '🏢', kind: 'org' });
    return list.length ? list : ORGS_FALLBACK;
  }, [server]);

  const GROUPS_BY_ORG: Record<string, EntityItem[]> = useMemo(() => {
    const map: Record<string, EntityItem[]> = {};
    map['org_me'] = [{ id: 'grp_me_private', label: 'Private', emoji: '🔒', kind: 'group' }];
    const groups = Object.values(server?.entities?.groups ?? {});
    for (const g of groups) {
      const ownerOrg = g.owner_org_id || 'org_me';
      (map[ownerOrg] ||= []).push({ id: g.group_id, label: g.name, emoji: '👥', kind: 'group' });
    }
    return Object.keys(map).length ? map : GROUPS_BY_ORG_FALLBACK;
  }, [server]);

  const FOLLOWS: EntityItem[] = useMemo(() => {
    const follows = Object.values(server?.entities?.follows ?? {}).map(f => ({
      id: f.user_id, label: f.display_name || f.user_id, emoji: '🧑', kind: 'user' as const
    }));
    return follows.length ? follows : FOLLOWS_FALLBACK;
  }, [server]);

  // 週の開始曜日
  const FIRST_DAY = useMemo(() => {
    const wk = prefs?.display?.week_start;
    if (wk === 'mon') return 1;
    if (wk === 'sun') return 0;
    return FIRST_DAY_FALLBACK;
  }, [prefs]);

  // ===== 画面状態 =====
  const [selected, setSelected] = useState<string>(todayStr);
  const [currentMonth, setCurrentMonth] = useState<string>(dayjs().format('YYYY-MM'));
  const monthLabel = useMemo(() => dayjs(currentMonth + '-01').format('YYYY年M月'), [currentMonth]);
  const [sortMode, setSortMode] = useState<SortMode>('span');

  const [selectedEntityId, setSelectedEntityId] = useState<string>('org_me');
  const selectedEntity = useMemo<EntityItem>(
    () =>
      [...ORGS, ...Object.values(GROUPS_BY_ORG).flat(), ...FOLLOWS].find((x) => x.id === selectedEntityId) ??
      ORGS[0],
    [selectedEntityId, ORGS, GROUPS_BY_ORG, FOLLOWS]
  );
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>('org_me');

  const [innerW, setInnerW] = useState<number>(0);
  const [gridH, setGridH] = useState<number>(0);
  const [weekHeaderH, setWeekHeaderH] = useState<number>(0);

  // シート高さ
  const SHEET_MAX = Math.floor(SCREEN_H * 0.8);

  // DB
  const [dbReady, setDbReady] = useState(false);

  // 同期
  const [syncing, setSyncing] = useState(false);
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const hasSyncedRef = useRef(false);
  const syncRunIdRef = useRef(0);

  // ドロワー
  const left = useAnimatedDrawer(Math.floor(Math.min(360, SCREEN_W * 0.84)), 'left');
  const right = useAnimatedDrawer(Math.floor(Math.min(360, SCREEN_W * 0.9)), 'right');

  // DayEventsSheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetDate, setSheetDate] = useState<string>(todayStr);
  const [sheetItems, setSheetItems] = useState<any[]>([]);
  const sheetY = useRef(new Animated.Value(0)).current;

  // 追加シート（イベント作成・編集共通UI）
  const [addVisible, setAddVisible] = useState(false);
  const MAX_SHEET_H = Math.floor(SCREEN_H * 0.9);
  const SNAP_HEIGHTS = [
    Math.floor(SCREEN_H * 0.40),
    Math.floor(SCREEN_H * 0.65),
    Math.floor(SCREEN_H * 0.90),
  ];
  const [currentSnap, setCurrentSnap] = useState(1);
  const addSheetTranslateY = useRef(new Animated.Value(MAX_SHEET_H)).current;

  const openAddSheet = useCallback((snapIndex: number) => {
    setCurrentSnap(snapIndex);
    const visibleH = SNAP_HEIGHTS[snapIndex];
    const targetY = MAX_SHEET_H - visibleH;
    addSheetTranslateY.stopAnimation();
    Animated.timing(addSheetTranslateY, { toValue: targetY, duration: 260, useNativeDriver: true }).start();
  }, [MAX_SHEET_H, SNAP_HEIGHTS, addSheetTranslateY]);

  const closeAddSheet = useCallback(() => {
    addSheetTranslateY.stopAnimation();
    Animated.timing(addSheetTranslateY, { toValue: MAX_SHEET_H, duration: 220, useNativeDriver: true }).start(() => setAddVisible(false));
  }, [MAX_SHEET_H, addSheetTranslateY]);

  const expandAddSheet = useCallback(() => {
    const snapIndex = SNAP_HEIGHTS.length - 1;
    setCurrentSnap(snapIndex);
    const visibleH = SNAP_HEIGHTS[snapIndex];
    const targetY = MAX_SHEET_H - visibleH;
    addSheetTranslateY.stopAnimation();
    Animated.timing(addSheetTranslateY, { toValue: targetY, duration: 220, useNativeDriver: true }).start();
  }, [SNAP_HEIGHTS, MAX_SHEET_H, addSheetTranslateY]);

  // スワイプ制御
  const DRAG_ACTIVATE_DY = 6;
  const scrollYRef = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => {
        const atTop = scrollYRef.current <= 1;
        return atTop && Math.abs(g.dy) > DRAG_ACTIVATE_DY && Math.abs(g.dy) > Math.abs(g.dx);
      },
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_e, g) => {
        const atTop = scrollYRef.current <= 1;
        return atTop && Math.abs(g.dy) > DRAG_ACTIVATE_DY && Math.abs(g.dy) > Math.abs(g.dx);
      },
      onPanResponderGrant: () => {
        addSheetTranslateY.stopAnimation();
      },
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const baseY = MAX_SHEET_H - SNAP_HEIGHTS[currentSnap];
        let nextY = baseY + g.dy;
        const minY = MAX_SHEET_H - SNAP_HEIGHTS[SNAP_HEIGHTS.length - 1];
        const maxY = MAX_SHEET_H;
        if (nextY < minY) nextY = minY;
        if (nextY > maxY) nextY = maxY;
        addSheetTranslateY.setValue(nextY);
      },
      onPanResponderRelease: (_e, g) => {
        const currentY = (addSheetTranslateY as any).__getValue?.() ?? MAX_SHEET_H;
        const snapTargets = SNAP_HEIGHTS.map(h => MAX_SHEET_H - h);

        const NEAR_BOTTOM_PX = 16;
        if (currentY >= MAX_SHEET_H - NEAR_BOTTOM_PX) {
          Animated.timing(addSheetTranslateY, { toValue: MAX_SHEET_H, duration: 160, useNativeDriver: true })
            .start(() => setAddVisible(false));
          return;
        }

        if (g.vy > 1.0 || (g.dy > 80 && Math.abs(g.vy) > 0.2)) {
          Animated.timing(addSheetTranslateY, { toValue: MAX_SHEET_H, duration: 180, useNativeDriver: true })
            .start(() => setAddVisible(false));
          return;
        }

        let nearest = 0;
        let best = Infinity;
        snapTargets.forEach((y, i) => {
          const d = Math.abs(currentY - y);
          if (d < best) { best = d; nearest = i; }
        });
        setCurrentSnap(nearest);
        Animated.timing(addSheetTranslateY, { toValue: snapTargets[nearest], duration: 180, useNativeDriver: true }).start();
      },
    })
  ).current;

  // フォーム状態
  const [formTitle, setFormTitle] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formAllDay, setFormAllDay] = useState(false);
  const [formColor, setFormColor] = useState<string>('');
  const [formVisibility, setFormVisibility] = useState<EventVisibility>('Hidden');
  const [formTz, setFormTz] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  //  カラーパレット用状態
  const [colorOpen, setColorOpen] = useState(false);
  const [tempColor, setTempColor] = useState<string>('#2563EB'); // 決定前の一時色（#RRGGBB）
  const [tempAlpha, setTempAlpha] = useState<number>(1);         // 追記：透明度(0..1)
  const [hue, setHue] = useState<number>(210); // 初期はブルー寄り
  // 彩度・明度（S, V）
  const [svS, setSvS] = useState<number>(1);
  const [svV, setSvV] = useState<number>(1);

  const HUE_STEPS = 12;            // 12色バー
  const SV_STEPS = 12;             // 12x12 グリッド

  const [allTags, setAllTags] = useState<string[]>([]);
  useEffect(() => { setAllTags(getAllTags()); }, [addVisible]);

  //RRULE
  const [FREQ, setFREQ] = useState<string>('NONE');
  const [COUNT, setCOUNT] = useState<string>('NONE');
  const [INTERVAL, setINTERVAL] = useState<string>('NONE');
  const [BYDAY, setBYDAY] = useState<string>('NONE');
  const [BYMONTHDAY, setBYMONTHDAY] = useState<string>('NONE');
  const [BYYEARDAY, setBYYEARDAY] = useState<string>('NONE');
  const [BYWEEKNO, setBYWEEKNO] = useState<string>('NONE');
  const [BYMONTH, setBYMONTH] = useState<string>('NONE');
  const [BYYEAR, setBYYEAR] = useState<string>('NONE');
  const [BYSETPOS, setBYSETPOS] = useState<string>('NONE');

  const [startDate, setStartDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [endDate, setEndDate]     = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [startTime, setStartTime] = useState<string>('10:00');
  const [endTime, setEndTime]     = useState<string>('15:00');

  const [startCalOpen, setStartCalOpen] = useState(false);
  const [endCalOpen, setEndCalOpen]     = useState(false);

  // 時刻オーバーレイ用
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  const [startHour, setStartHour] = useState<number | null>(10);
  const [endHour, setEndHour] = useState<number | null>(11);

  // 分ダイヤル
  const [startMinuteOpen, setStartMinuteOpen] = useState(false);
  const [endMinuteOpen, setEndMinuteOpen] = useState(false);
  const [startMinute, setStartMinute] = useState<number | null>(0);
  const [endMinute, setEndMinute] = useState<number | null>(0);

  const DEFAULT_CAL_ID = 'CAL_LOCAL_DEFAULT';
  const [formCalId, setFormCalId] = useState<string>(DEFAULT_CAL_ID);

  const [refreshKey, setRefreshKey] = useState(0);

  // ★ 追加：編集モード状態
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const isEditing = !!editingItem;

  // カラーピッカー内でドラッグ中はスクロールを止める
  const [draggingColor, setDraggingColor] = useState(false);


  const initialCurrent = useRef(dayjs().startOf('month').format('YYYY-MM-DD')).current;

  const calRef = useRef<any>(null);

  // ======= 日付・時刻の整合性ヘルパー =======
  const parseHM = useCallback((t: string): number | null => {
    const m = String(t || '').match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
    const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
    return hh * 60 + mm;
  }, []);

  const ensureEndDateNotBeforeStart = useCallback((s: string, e: string) => {
    if (dayjs(e).isBefore(dayjs(s))) {
      setEndDate(s);
    }
  }, []);

  const ensureEndTimeNotBeforeStart = useCallback((s: string, e: string) => {
    if (formAllDay) return;
    const sm = parseHM(s);
    const em = parseHM(e);
    if (sm != null && em != null && em < sm) {
      setEndTime(s);
      setEndHour(Math.floor(sm / 60));
      setEndMinute(sm % 60);
    }
  }, [formAllDay, parseHM]);

  useEffect(() => {
    ensureEndDateNotBeforeStart(startDate, endDate);
  }, [startDate, endDate, ensureEndDateNotBeforeStart]);

  useEffect(() => {
    ensureEndTimeNotBeforeStart(startTime, endTime);
  }, [startTime, endTime, ensureEndTimeNotBeforeStart]);

  // グリッド高さ計算
  const pageHeight = useMemo(() => {
    if (gridH <= 0) return 0;
    const weekH = Math.max(weekHeaderH, 24);
    const usable = Math.max(0, gridH - weekH);
    const cell = Math.max(1, Math.floor(usable / ROWS));
    return cell * ROWS;
  }, [gridH, weekHeaderH]);

  const cellH = useMemo(() => (pageHeight <= 0 ? 0 : Math.floor(pageHeight / ROWS)), [pageHeight]);

  // CalendarList 準備OK？
  const [calReady, setCalReady] = useState(false);
  useEffect(() => { setCalReady(innerW > 0 && pageHeight > 0); }, [innerW, pageHeight]);

  useEffect(() => { if (!calReady || !calRef.current) return; calRef.current?.scrollToMonth?.(initialCurrent, 0, true); }, [calReady, initialCurrent]);

  // 可視月変更
  const monthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onVisibleMonthsChange = useCallback((months: Array<{ year: number; month: number }>) => {
    if (!months?.length) return;
    const m = months[0];
    const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
    if (monthDebounceRef.current) clearTimeout(monthDebounceRef.current);
    monthDebounceRef.current = setTimeout(() => { setCurrentMonth((prev) => (prev === key ? prev : key)); }, 80);
  }, []);
  useEffect(() => () => { if (monthDebounceRef.current) clearTimeout(monthDebounceRef.current); }, []);

  // 列幅
  const colWBase = useMemo(() => (innerW > 0 ? Math.floor(innerW / 7) : 0), [innerW]);
  const colWLast = useMemo(() => (innerW > 0 ? innerW - colWBase * 6 : 0), [innerW, colWBase]);

  // 可視グループ
  const getVisibleGroupIds = useCallback((): string[] => {
    if (selectedEntity.kind === 'group') return [selectedEntity.id];
    if (selectedEntity.kind === 'org' || selectedEntity.kind === 'me') {
      return (GROUPS_BY_ORG[selectedEntity.id] ?? []).map((g) => g.id);
    }
    return [];
  }, [selectedEntity, GROUPS_BY_ORG]);

  const filterEventsByEntity = useCallback((listRaw: any[]) => {
    const visibleGroupIds = getVisibleGroupIds();
    const getGroupId = (ev: any) => ev?.group_id ?? ev?.groupId ?? ev?.owner_group_id ?? null;
    return listRaw.filter((ev) => {
      const gid = getGroupId(ev);
      if (!gid) return true;
      if (selectedEntity.kind === 'group') return gid === selectedEntity.id;
      if (selectedEntity.kind === 'org' || selectedEntity.kind === 'me') {
        return visibleGroupIds.length === 0 ? true : visibleGroupIds.includes(gid);
      }
      return true;
    });
  }, [getVisibleGroupIds, selectedEntity]);

  // ======== 3ヶ月分の描画対象日 ========
  const deferredMonth = useDeferredValue(currentMonth);
  const threeMonthsDates = useMemo(() => {
    const { startISO, endISO } = getPrevCurrNextRange(deferredMonth);
    const start = dayjs(startISO).startOf('day');
    const end   = dayjs(endISO).startOf('day');
    const out: string[] = [];
    for (let cur = start; cur.isBefore(end) || cur.isSame(end, 'day'); cur = cur.add(1, 'day')) {
      out.push(cur.format('YYYY-MM-DD'));
    }
    return out;
  }, [deferredMonth]);

  const enabledMonthDates = dbReady ? threeMonthsDates : [];
  const { eventsByDate, overflowByDate } = useMonthEvents(enabledMonthDates, filterEventsByEntity, sortMode, refreshKey);

  // ====== 初回同期 ======
  useEffect(() => {
    if (hasSyncedRef.current) return;

    const thisRunId = ++syncRunIdRef.current;
    let hardTimer: any = null;
    let finished = false;

    setSyncing(true);
    const finish = (opts: { ok: boolean; timedOut?: boolean }) => {
      if (finished) return;
      finished = true;
      if (syncRunIdRef.current !== thisRunId) return;
      hasSyncedRef.current = true; setDbReady(true); setSyncing(false);
      if (opts.timedOut) setSyncTimedOut(true);
      if (hardTimer) clearTimeout(hardTimer);
    };

    (async () => {
      try {
        const center = dayjs(currentMonth + '-01');
        const months = [center.subtract(1,'month').format('YYYY-MM'), center.format('YYYY-MM'), center.add(1,'month').format('YYYY-MM')];

        hardTimer = setTimeout(() => finish({ ok: false, timedOut: true }), 2500);
        await ensureMonthsLoaded(months);
        finish({ ok: true });
      } catch {
        finish({ ok: false });
      }
    })();

    return () => { if (hardTimer) clearTimeout(hardTimer); };
  }, [currentMonth]);

  useEffect(() => {
    if (!syncTimedOut) return;
    const t = setTimeout(() => setSyncTimedOut(false), 2500);
    return () => clearTimeout(t);
  }, [syncTimedOut]);

  // ====== ローカルデータのリセット ======
  const visitedMonthsRef = useRef<Set<string>>(new Set());
  const runResetLocal = useCallback(async () => {
    try {
      setSyncing(true);
      await resetLocalData();
      try {
        const ms = await import('../../../data/persistence/monthShard');
        (ms as any).clearMonthCache?.();
      } catch {}
      try {
        const db = await import('../../../store/db');
        db.replaceAllInstances?.([]);
      } catch {}
      visitedMonthsRef.current.clear();
      setSheetVisible(false);

      setDbReady(false);
      setRefreshKey((v) => v + 1);

      const center = dayjs(currentMonth + '-01');
      const months = [
        center.subtract(1, 'month').format('YYYY-MM'),
        center.format('YYYY-MM'),
        center.add(1, 'month').format('YYYY-MM'),
      ];
      await ensureMonthsLoaded(months);

      setDbReady(true);
      Alert.alert('リセット完了', 'ローカルデータを初期化しました。');
    } catch (e) {
      console.warn('[runResetLocal] failed:', e);
      Alert.alert('リセットに失敗しました', String(e ?? 'unknown error'));
    } finally {
      setSyncing(false);
      setSyncTimedOut(false);
    }
  }, [currentMonth]);


  // FIRST_DAY=0(日) → Tue=2,  FIRST_DAY=1(月) → Tue=1
  const tueStartCol = useMemo(() => ((2 - FIRST_DAY + 7) % 7), [FIRST_DAY]);
  const nameOverlayLeft = useMemo(() => tueStartCol * colWBase, [tueStartCol, colWBase]);
  const nameOverlayWidth = useMemo(() => colWBase * 3, [colWBase]);

  const nameOverlayTop = useMemo(() => {
    if (pageHeight <= 0 || cellH <= 0) return 0;
    const gridTop = weekHeaderH;
    const centerY = gridTop + (ROWS - 1) * cellH + Math.floor(cellH / 2);
    return Math.max(weekHeaderH, centerY - 18);
  }, [weekHeaderH, pageHeight, cellH]);

  const bottomRowTop = useMemo(
    () => weekHeaderH + (cellH * (ROWS - 1)) + 4,
    [weekHeaderH, cellH]
  );

  // ===== ヘッダー設定 =====
  useEffect(() => {
    const headerLeft = () => (
      <Pressable onPress={left.openDrawer} hitSlop={12} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <View style={{ gap: 4 }}>
          <View style={{ width: 20, height: 2, backgroundColor: theme.textPrimary, borderRadius: 1 }} />
          <View style={{ width: 16, height: 2, backgroundColor: theme.textPrimary, borderRadius: 1 }} />
          <View style={{ width: 20, height: 2, backgroundColor: theme.textPrimary, borderRadius: 1 }} />
        </View>
      </Pressable>
    );
    const headerRight = () => (
      <Pressable onPress={right.openDrawer} hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <View style={{
          width: PROFILE_ICON_SIZE + 8, height: PROFILE_ICON_SIZE + 8,
          borderRadius: (PROFILE_ICON_SIZE + 8) / 2, backgroundColor: theme.surface,
          borderWidth: HAIR_SAFE, borderColor: theme.border, alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 18 }}>👤</Text>
        </View>
      </Pressable>
    );

    (navigation as any).setOptions({
      headerStyle: { backgroundColor: theme.appBg },
      headerTitleAlign: 'left',
      headerTitle: () => (
        <Text style={{ fontSize: 18, fontWeight: '800', color: theme.textPrimary }}>
          {monthLabel}
        </Text>
      ),
      headerLeft,
      headerRight,
    });
  }, [navigation, left.openDrawer, right.openDrawer, theme, monthLabel]);

  const marked = useMemo(() => ({ [selected]: { selected: true } }), [selected]);

  // DayEventsSheet 開く/閉じる
  const openSheet = useCallback((dateStr: string) => {
    setSheetDate(dateStr);
    const dbList = dbReady ? filterEventsByEntity(listInstancesByDate(dateStr) ?? []) : [];
    setSheetItems(dbList.slice(0, 50));
    setSheetVisible(true);
  }, [filterEventsByEntity, dbReady]);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
  }, []);

  const handleDayPress = useCallback((d: DateData) => {
    const ds = d.dateString;
    console.log('before pressed:', ds, 'selected(before):', selected, 'isSel:', ds === selected);
    if (selected !== ds) {
      setSelected(ds);
      return;
    }
    openSheet(ds);
    console.log('after pressed:', ds, 'selected(before):', selected, 'isSel:', ds === selected);
  }, [selected, openSheet]);


  const onEndReached = useCallback(() => {
    setSheetItems((prev) => {
      const dbList = dbReady ? filterEventsByEntity(listInstancesByDate(sheetDate) ?? []) : [];
      if (prev.length >= dbList.length) return prev;
      const nextLen = Math.min(prev.length + 50, dbList.length);
      return dbList.slice(0, nextLen);
    });
  }, [sheetDate, filterEventsByEntity, dbReady]);

  // CalendarList のテーマ
  const calendarTheme: any = useMemo(() => {
    const transparent = !!bgImageUri;
    const bg = transparent ? 'transparent' : theme.appBg;
    return {
      backgroundColor: bg,
      calendarBackground: bg,
      textDayFontSize: DAY_FONT,
      textDayFontWeight: '700',
      textMonthFontSize: 20,
      textMonthFontWeight: '800',
      'stylesheet.calendar.main': {
        container: { paddingLeft: 0, paddingRight: 0, paddingTop: 0, backgroundColor: 'transparent' },
        monthView: { paddingHorizontal: 0, paddingTop: 0, marginTop: 0, backgroundColor: 'transparent' },
        week: { marginTop: 0, marginBottom: 0, padding: 0, flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'stretch', backgroundColor: 'transparent' },
        dayContainer: { flex: 0, padding: 0, margin: 0, alignItems: 'stretch', justifyContent: 'flex-start', width: undefined, backgroundColor: 'transparent' },
      },
      'stylesheet.day.basic': { base: { flex: 0, width: undefined, margin: 0, padding: 0, alignItems: 'stretch', justifyContent: 'flex-start', backgroundColor: 'transparent' } },
      'stylesheet.calendar-list.main': { calendar: { paddingLeft: 0, paddingRight: 0, paddingTop: 0, marginTop: 0, backgroundColor: 'transparent' } },
      'stylesheet.calendar.header': { header: { marginBottom: 0, paddingVertical: 0, height: 0, backgroundColor: 'transparent' } },
    };
  }, [bgImageUri, theme.appBg]);

  // DayCell
  const renderDay = useCallback(
    ({ date, state, marking, onPress }: any) => {
      const dateStr = date?.dateString as string;
      const dbSegs = dbReady ? (eventsByDate[dateStr] ?? []) : [];
      const moreDb = dbReady ? (overflowByDate[dateStr] ?? 0) : 0;
      return (
        <View
          style={{
            height: cellH,
            overflow: 'hidden',
            backgroundColor: dateStr === todayStr ? theme.todayBg : 'transparent',
            borderRadius: 6,
          }}
        >
          <DayCell
            date={date}
            state={state}
            marking={marking}
            onPress={onPress}
            colWBase={colWBase}
            colWLast={colWLast}
            cellH={cellH}
            dayEvents={dbSegs}
            hideRightDivider
            moreCount={moreDb}
          />
        </View>
      );
    },
    [colWBase, colWLast, cellH, eventsByDate, overflowByDate, dbReady, todayStr, theme.mode]
  );

  // 先読み
  useEffect(() => {
    if (!dbReady) return;
    const run = async () => {
      const m0 = dayjs(currentMonth + '-01');
      const months = [-2, -1, 1, 2].map((off) => m0.add(off, 'month').format('YYYY-MM'));
      const targets = months.filter((m) => !visitedMonthsRef.current.has(m));
      if (targets.length === 0) return;
      const { InteractionManager } = require('react-native');
      await new Promise<void>((resolve) => { InteractionManager.runAfterInteractions(() => resolve()); });
      try {
        await ensureMonthsLoaded(targets);
        targets.forEach((t) => visitedMonthsRef.current.add(t));
      } catch {}
    };
    run();
  }, [currentMonth, dbReady]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const { AppState } = require('react-native');
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (last.match(/inactive|background/) && s === 'active') {
        const m = dayjs(currentMonth + '-01').add(1, 'month').format('YYYY-MM');
        if (!visitedMonthsRef.current.has(m)) {
          ensureMonthLoaded(m)
            .then(() => visitedMonthsRef.current.add(m))
            .catch(() => {});
        }
      }
      last = s;
    });
    return () => sub.remove();
  }, [currentMonth]);

  // 背景色
  const bgColor = bgImageUri ? 'transparent' : theme.appBg;
  const bgScrim = bgImageUri ? (theme.mode === 'dark' ? 'rgba(4,7,14,0.42)' : 'rgba(0,0,0,0.25)') : 'transparent';

  // ===== タグ操作 =====
  const addTag = useCallback((tRaw?: string) => {
    const raw = (tRaw ?? tagInput).trim();
    if (!raw) return;
    if (tags.includes(raw)) { if (!tRaw) setTagInput(''); return; }
    setTags((prev) => [...prev, raw]);
    if (!tRaw) setTagInput('');
  }, [tagInput, tags]);

  const removeTag = useCallback((t: string) => {
    setTags((prev) => prev.filter(x => x !== t));
  }, []);

  const similarTagCandidates = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [] as string[];
    const notSelected = allTags.filter(t => !tags.includes(t));
    const starts = notSelected.filter(t => t.toLowerCase().startsWith(q));
    const contains = notSelected.filter(t => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 8);
  }, [tagInput, allTags, tags]);

  const onToggleAllDay = useCallback((v: boolean) => {
    setFormAllDay(v);
    if (v) { setStartTime('00:00'); setEndTime('23:59'); }
  }, []);

  const applyHourToStartTime = useCallback((h: number) => {
    const hh = String(Math.max(0, Math.min(23, h))).padStart(2, '0');
    setStartTime(`${hh}:${String(startMinute ?? 0).padStart(2,'0')}`);
  }, [startMinute]);
  const applyHourToEndTime = useCallback((h: number) => {
    const hh = String(Math.max(0, Math.min(23, h))).padStart(2, '0');
    const next = `${hh}:${String(endMinute ?? 0).padStart(2,'0')}`;
    setEndTime(next);
    ensureEndTimeNotBeforeStart(startTime, next);
  }, [endMinute, startTime, ensureEndTimeNotBeforeStart]);

  // ★ 追加：DayEventsSheet の［編集］押下 → 既存値でフォームをプレフィルして開く
  const onPressEditFromSheet = useCallback((row: any) => {
    if (!row) return;
    setEditingItem(row);

    // 基本情報
    setFormTitle(row?.title ?? '');
    setFormSummary(row?.summary ?? '');
    setFormAllDay(false);
    setFormColor(row?.color ?? '');

    // 日付・時刻
    const sDate = String(row?.dtstart ?? sheetDate);
    const eDate = String(row?.dtend ?? sheetDate);
    const sAt   = String(row?.start_at ?? '10:00');
    const eAt   = String(row?.end_at ?? '11:00');

    setStartDate(sDate);
    setEndDate(eDate);
    setStartTime(sAt);
    setEndTime(eAt);

    const sm = /(\d{1,2}):(\d{1,2})/.exec(sAt);
    const em = /(\d{1,2}):(\d{1,2})/.exec(eAt);
    setStartHour(sm ? Math.max(0, Math.min(23, parseInt(sm[1], 10))) : 10);
    setStartMinute(sm ? Math.max(0, Math.min(59, parseInt(sm[2], 10))) : 0);
    setEndHour(em ? Math.max(0, Math.min(23, parseInt(em[1], 10))) : 11);
    setEndMinute(em ? Math.max(0, Math.min(59, parseInt(em[2], 10))) : 0);

    // カレンダー
    setFormCalId(row?.calendar_id ?? DEFAULT_CAL_ID);

    // 開く
    setAddVisible(true);
    requestAnimationFrame(() => openAddSheet(1));
  }, [sheetDate, openAddSheet]);

  // ===== 保存ロジック（新規 / 更新） =====
  const saveEvent = useCallback(async () => {
    if ((CalendarScreen as any).__saving) return;
    (CalendarScreen as any).__saving = true;

    try {
      // === 必須チェック ===
      if (!formTitle.trim()) {
        Alert.alert('保存できません', 'タイトルを入力してください。');
        return;
      }

      const norm = (t: string) => {
        const m = String(t || '').match(/^(\d{1,2}):(\d{1,2})$/);
        if (!m) return null;
        const hh = String(Math.max(0, Math.min(23, Number(m[1])))).padStart(2, '0');
        const mm = String(Math.max(0, Math.min(59, Number(m[2])))).padStart(2, '0');
        return `${hh}:${mm}`;
      };

      const st = formAllDay ? '00:00' : norm(startTime);
      const et = formAllDay ? '23:59' : norm(endTime);
      if (!st || !et) {
        Alert.alert('保存できません', '開始/終了時刻の形式が不正です（HH:mm）。');
        return;
      }

      let sDate = startDate;
      let eDate = endDate;
      if (dayjs(eDate).isBefore(dayjs(sDate))) eDate = sDate;

      const sm = parseHM(st) ?? 0;
      const em = parseHM(et) ?? 0;
      const endFixed = em < sm ? st : et;

      const startIso = dayjs(`${sDate} ${st}`).format('YYYY-MM-DD HH:mm');
      const endIso   = dayjs(`${eDate} ${endFixed}`).format('YYYY-MM-DD HH:mm');
      if (!dayjs(endIso).isAfter(dayjs(startIso))) {
        Alert.alert('保存できません', '終了が開始より後になるように設定してください。');
        return;
      }

      const color = (formColor || '').trim();
      const validColor = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : undefined;

      const eventIdForEdit =
        editingItem?.event_id ?? editingItem?.cid_ulid ?? editingItem?.eventId ?? undefined;

      // === UpsertEventInput に合わせたペイロード ===
      const payload: UpsertEventInput = {
        // 編集時のみ event_id を渡す（新規は undefined でOK）
        event_id: isEditing ? eventIdForEdit : undefined,

        calendar_id: formCalId,
        title: formTitle.trim(),
        summary: (formSummary || '').trim() || undefined,
        rrule: FREQ ?? '',

        start_date: sDate,      // YYYY-MM-DD
        end_date:   eDate,      // YYYY-MM-DD
        start_time: st,         // HH:mm
        end_time:   endFixed,   // HH:mm
        allDay:    !!formAllDay,
        tz:         formTz || 'local',

        color: validColor,
        tags,
        visibility: formVisibility ?? 'Normal',
      };

      // === ここが肝心：サービス経由で保存 ===
      await upsertEvent(payload);

      // === UI 更新 ===
      // ・カレンダーの再描画キー
      setRefreshKey(v => v + 1);

      // ・DayEventsSheet が開いている＆対象日ならリストを更新
      const dStr = dayjs(startIso).format('YYYY-MM-DD');
      if (sheetVisible && sheetDate === dStr) {
        const next = filterEventsByEntity(listInstancesByDate(dStr) ?? []).slice(0, 50);
        setSheetItems(next);
      }

      // フォーム閉じる
      setEditingItem(null);
      closeAddSheet();
    } catch (e: any) {
      console.warn('[saveEvent] upsert failed:', e);
      Alert.alert('保存に失敗しました', String(e?.message ?? e ?? 'unknown error'));
    } finally {
      (CalendarScreen as any).__saving = false;
    }
  }, [
    formTitle, formSummary, formAllDay, startTime, endTime, startDate, endDate,
    formColor, formCalId, tags, sheetVisible, sheetDate, filterEventsByEntity,
    isEditing, editingItem, formTz, formVisibility, FREQ
  ]);



  // ==== ここから UI ====
  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* 背景画像 & スクリーン */}
      {bgImageUri ? (
        <>
          <Image source={{ uri: bgImageUri }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: bgScrim }]} />
        </>
      ) : null}

      {/* ステータス */}
      {!schemaReady && <StatusBadge text="Loading profile & entities…" />}
      {schemaReady && syncing && <StatusBadge text="Sync server…" />}
      {syncTimedOut && <StatusBadge text="Sync timeout — local first" />}

      {/* カレンダー */}
      <View style={[styles.gridBlock, { backgroundColor: 'transparent' }]} onLayout={(e) => setGridH(Math.round(e.nativeEvent.layout.height))}>
        <View style={[styles.gridInner, { backgroundColor: 'transparent' }]} onLayout={(e) => setInnerW(e.nativeEvent.layout.width)}>
          {/* 曜日ヘッダ */}
          <View onLayout={(e) => setWeekHeaderH(Math.round(e.nativeEvent.layout.height))}>
            {innerW > 0 ? <WeekHeader colWBase={colWBase} colWLast={colWLast} /> : null}
          </View>

          {/* カレンダー名オーバレイ */}
          {innerW > 0 && pageHeight > 0 && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: nameOverlayLeft + 6,
                top: nameOverlayTop,
                width: Math.max(0, nameOverlayWidth - 12),
                zIndex: 1000,
              }}
            >
              <View
                style={[
                  overlayStyles.namePillTop,
                  {
                    backgroundColor: theme.overLayBg,
                    borderColor: theme.border,
                    shadowColor: theme.shadow ?? '#000',
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ color: theme.textPrimary, fontSize: 18,textAlign: 'center' }}
                >
                  {selectedEntity.label}
                </Text>
              </View>
            </View>
          )}

          {/* CalendarList */}
          <View style={{ overflow: 'hidden', backgroundColor: 'transparent' }}>
            {(pageHeight > 0 && innerW > 0) && (
              <CalendarList
                ref={calRef}
                key={`${innerW}x${cellH}x${weekHeaderH}x${pageHeight}x${FIRST_DAY}x${initialCurrent}`}
                firstDay={FIRST_DAY}
                current={initialCurrent}
                horizontal
                pagingEnabled
                calendarWidth={innerW}
                calendarHeight={pageHeight}
                hideDayNames
                renderHeader={() => null}
                style={{ height: pageHeight, backgroundColor: 'transparent' }}
                calendarStyle={{ paddingTop: 0, marginTop: 0, backgroundColor: 'transparent' }}
                pastScrollRange={120}
                futureScrollRange={120}
                minDate={'1900-01-01'}
                maxDate={'2100-12-31'}
                hideExtraDays={false}
                showSixWeeks
                onDayPress={handleDayPress}
                onVisibleMonthsChange={onVisibleMonthsChange}
                markedDates={marked}
                showScrollIndicator={false}
                theme={calendarTheme as any}
                contentContainerStyle={{ alignItems: 'flex-start', paddingHorizontal: 0, paddingTop: 0 }}
                dayComponent={renderDay as any}
                extraData={todayStr}
              />
            )}
          </View>
        </View>
      </View>

      {/* 左ドロワー */}
      <LeftDrawer
        open={left.open}
        width={Math.floor(Math.min(360, SCREEN_W * 0.84))}
        translateX={left.x}
        selectedEntityId={selectedEntityId}
        setSelectedEntityId={setSelectedEntityId}
        expandedOrgId={expandedOrgId}
        setExpandedOrgId={setExpandedOrgId}
        closeDrawer={left.closeDrawer}
        ORGS={ORGS}
        GROUPS_BY_ORG={GROUPS_BY_ORG}
        FOLLOWS={FOLLOWS}
      />

      {/* 右ドロワー */}
      <ProfileDrawer
        open={right.open}
        width={Math.floor(Math.min(360, SCREEN_W * 0.9))}
        translateX={right.x}
        close={right.closeDrawer}
        emoji="👤"
      />

      {/* Day Events シート */}
      <DayEventsSheet
        visible={sheetVisible}
        sheetY={sheetY}
        height={SHEET_MAX}
        date={sheetDate}
        items={sheetItems}
        onClose={closeSheet}
        onEndReached={onEndReached}
        rowHeight={64}
        // ★ 追記：編集ボタン押下コールバック（DayEventsSheet 側未実装でも暫定で any）
        {...({ onPressEdit: onPressEditFromSheet } as any)}
      />

      {/* 右下の FAB */}
      <Pressable
        onPress={() => {
          // ★ 新規作成モードへ
          setEditingItem(null);

          setFormTitle('');
          setFormSummary('');
          setFormAllDay(false);
          setFormColor('');
          setTags([]);
          setTagInput('');
          setAllTags(getAllTags());

          setStartDate(selected);
          setEndDate(selected);
          setStartTime('10:00');
          setEndTime('11:00');
          setStartHour(10);
          setEndHour(11);
          setStartMinute(0);
          setEndMinute(0);
          setFormCalId(DEFAULT_CAL_ID);

          setAddVisible(true);
          requestAnimationFrame(() => {
            openAddSheet(1);
          });
        }}
        hitSlop={10}
        style={{
          position: 'absolute', right: 18, bottom: 24, width: 56, height: 56, borderRadius: 28,
          backgroundColor: theme.overLayBg, alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          elevation: 6, borderWidth: HAIR_SAFE, borderColor: theme.border,
        }}
        accessibilityLabel="イベント作成シートを開く"
      >
        <Text style={{ color: theme.textPrimary, fontSize: 28, lineHeight: 28, marginTop: -2 }}>＋</Text>
      </Pressable>

      {/* 追加/編集フォーム（オーバーレイ） */}
      {addVisible && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="box-none">
          {/* 背景タップで閉じる */}
          <Pressable onPress={closeAddSheet} style={StyleSheet.absoluteFillObject}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          </Pressable>

          {/* 下からのシート */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} pointerEvents="box-none">
            <Animated.View
              {...panResponder.panHandlers}
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: MAX_SHEET_H,
                backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
                borderWidth: HAIR_SAFE, borderColor: theme.border,
                transform: [{ translateY: addSheetTranslateY }],
              }}
            >
              {/* --- ツールバー（右上：決定） --- */}
              <View
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, borderBottomWidth: HAIR_SAFE, borderColor: theme.border,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: theme.textPrimary }}>
                  {isEditing ? 'イベントを編集' : 'イベントを追加'}
                </Text>

                <Pressable
                  onPress={saveEvent}
                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.accent, minWidth: 96, alignItems: 'center' }}
                  accessibilityLabel="決定"
                >
                  <Text style={{ color: theme.accentText, fontWeight: '800' }}>決定</Text>
                </Pressable>
              </View>

              {/* ハンドル & ヒント */}
              <Pressable onPress={expandAddSheet} style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
                <View style={{ alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: theme.border }} />
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 6 }}>
                    上へドラッグで拡大
                  </Text>
                </View>
              </Pressable>

              {/* フォーム本体 */}
              <View style={{ flex: 1, minHeight: 0 }}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                  scrollEventThrottle={16}
                  contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 110 }}
                  style={{ flex: 1 }}
                  scrollEnabled={!draggingColor}
                >
                  {/* タイトル */}
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>タイトル(必須)</Text>
                  <TextInput
                    value={formTitle}
                    onChangeText={setFormTitle}
                    placeholder="例: 打ち合わせ"
                    placeholderTextColor={theme.textSecondary}
                    selectionColor={theme.accent}
                    style={{
                      borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 12,
                      color: theme.textPrimary, backgroundColor: theme.appBg,
                    }}
                  />

                  {/* サマリ */}
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>メモ / 説明</Text>
                  <TextInput
                    value={formSummary}
                    onChangeText={setFormSummary}
                    placeholder="任意で入力"
                    placeholderTextColor={theme.textSecondary}
                    selectionColor={theme.accent}
                    multiline
                    style={{
                      borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 12,
                      minHeight: 68, color: theme.textPrimary, backgroundColor: theme.appBg,
                    }}
                  />

                  {/* 日付 */}
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>日付</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Pressable
                        onPress={() => { setStartCalOpen(true); setEndCalOpen(false); }}
                        style={{
                          flex: 1, borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                          paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.appBg
                        }}
                      >
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>開始</Text>
                        <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '700' }}>
                          {dayjs(startDate).format('YYYY-MM-DD')}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => { setEndCalOpen(true); setStartCalOpen(false); }}
                        style={{
                          flex: 1, borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                          paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.appBg
                        }}
                      >
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>終了</Text>
                        <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '700' }}>
                          {dayjs(endDate).format('YYYY-MM-DD')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* 時刻 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>終日</Text>
                    <Switch value={formAllDay} onValueChange={onToggleAllDay} />
                  </View>
                  {!formAllDay && (
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Pressable
                        onPress={() => {
                          setStartTimeOpen(true);
                          const mm = String(startTime || '').match(/^(\d{1,2}):(\d{1,2})$/);
                          const h = mm ? Math.max(0, Math.min(23, parseInt(mm[1],10))) : 0;
                          const m = mm ? Math.max(0, Math.min(59, parseInt(mm[2],10))) : 0;
                          setStartHour(h);
                          setStartMinute(m);
                        }}
                        style={{
                          flex: 1, borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                          paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.appBg
                        }}
                      >
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>
                          開始時刻（タップで選択）
                        </Text>
                        <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '700' }}>{startTime}</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          setEndTimeOpen(true);
                          const mm = String(endTime || '').match(/^(\d{1,2}):(\d{1,2})$/);
                          const h = mm ? Math.max(0, Math.min(23, parseInt(mm[1],10))) : 0;
                          const m = mm ? Math.max(0, Math.min(59, parseInt(mm[2],10))) : 0;
                          setEndHour(h);
                          setEndMinute(m);
                        }}
                        style={{
                          flex: 1, borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                          paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.appBg
                        }}
                      >
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>
                          終了時刻（タップで選択）
                        </Text>
                        <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '700' }}>{endTime}</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* タグ */}
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4, marginBottom: 6 }}>タグ</Text>

                  {allTags.filter(t => !tags.includes(t)).length > 0 && (
                    <View style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 6 }}>既存から選択</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {allTags.filter(t => !tags.includes(t)).slice(0, 24).map(t => (
                          <Pressable
                            key={`opt-${t}`}
                            onPress={() => addTag(t)}
                            style={{
                              paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
                              backgroundColor: theme.surface, borderWidth: HAIR_SAFE, borderColor: theme.border
                            }}
                          >
                            <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>#{t}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* 選択済みタグ */}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    {tags.map((t) => (
                      <Pressable
                        key={`sel-${t}`}
                        onPress={() => removeTag(t)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
                          backgroundColor: `${theme.accent}22`, borderWidth: HAIR_SAFE, borderColor: theme.accent
                        }}
                      >
                        <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>#{t}</Text>
                        <Text style={{ color: theme.accent }}>×</Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* 新規タグ追加 */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={tagInput}
                      onChangeText={setTagInput}
                      onSubmitEditing={() => addTag()}
                      placeholder="タグを入力してEnter"
                      placeholderTextColor={theme.textSecondary}
                      selectionColor={theme.accent}
                      style={{
                        flex: 1,
                        borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                        paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
                        color: theme.textPrimary, backgroundColor: theme.appBg,
                      }}
                    />
                    <Pressable
                      onPress={() => addTag()}
                      style={{ paddingHorizontal: 14, borderRadius: 10, backgroundColor: theme.accent, justifyContent: 'center' }}
                    >
                      <Text style={{ color: theme.accentText, fontWeight: '800' }}>追加</Text>
                    </Pressable>
                  </View>

                  {/* 色 (#HEX) + プレビュー + パレットを開く */}
                  <View style={{ gap: 8, marginBottom: 12, marginTop: 12 }}>
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>色</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {/* 現在色プレビュー（#RRGGBB/#RRGGBBAA対応） */}
                      <View
                        style={{
                          width: 36, height: 36, borderRadius: 8,
                          backgroundColor: (() => {
                            const cur = (formColor || '').trim();
                            if (HEX8.test(cur)) return rgbaStringFrom(`#${cur.replace('#','').slice(0,6)}`, extractAlpha01(cur));
                            if (HEX6.test(cur)) return cur;
                            return '#2563EB';
                          })(),
                          borderWidth: HAIR_SAFE, borderColor: theme.border
                        }}
                      />
                      <Pressable
                        onPress={() => {
                          // 既存色から base(#RRGGBB) と alpha(0..1) を抽出
                          const cur = (formColor || '').trim();
                          const base = HEX8.test(cur) ? `#${cur.replace('#','').slice(0,6)}`
                            : HEX6.test(cur) ? cur
                            : '#2563EB';
                          const a = HEX8.test(cur) ? extractAlpha01(cur) : 1;

                          setTempColor(base || '#2563EB');
                          setTempAlpha(a);

                          // HSVへ同期
                          const { h, s, v } = hexToHsv(base || '#2563EB');
                          setHue(h);
                          setSvS(s);
                          setSvV(v);

                          setColorOpen(true);
                        }}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
                          backgroundColor: theme.surface, borderWidth: HAIR_SAFE, borderColor: theme.border
                        }}
                      >
                        <Text style={{ color: theme.textPrimary, fontWeight: '800' }}>パレットを開く</Text>
                      </Pressable>
                    </View>
                    {!!formColor && !/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test((formColor || '').trim()) && (
                      <Text style={{ marginTop: 2, fontSize: 12, color: theme.accent }}>
                        色コードは #RRGGBB または #RRGGBBAA で入力してください
                      </Text>
                    )}
                  </View>
                </ScrollView>
              </View>

              {/* === 下部固定：キャンセル === */}
              <View style={{
                position:'absolute', left:0, right:0, bottom:0,
                paddingHorizontal:16, paddingVertical:12,
                borderTopWidth: HAIR_SAFE, borderColor: theme.border, backgroundColor: theme.surface
              }}>
                <Pressable
                  onPress={closeAddSheet}
                  style={{ height:48, borderRadius:12, alignItems:'center', justifyContent:'center',
                    borderWidth: HAIR_SAFE, borderColor: theme.border, backgroundColor: theme.appBg }}
                  accessibilityLabel="キャンセル"
                >
                  <Text style={{ color: theme.textPrimary, fontWeight: '800' }}>キャンセル</Text>
                </Pressable>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* ====== MiniCalendar Overlay ====== */}
      {addVisible && (startCalOpen || endCalOpen) && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20000 }}>
          <Pressable onPress={() => { setStartCalOpen(false); setEndCalOpen(false); }} style={StyleSheet.absoluteFillObject}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          </Pressable>
          <View
            style={{
              position: 'absolute',
              top: Math.floor(SCREEN_H * 0.25),
              alignSelf: 'center',
              width: Math.min(360, SCREEN_W - 24),
              borderRadius: 12,
              backgroundColor: theme.surface,
              borderWidth: HAIR_SAFE,
              borderColor: theme.border,
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              overflow: 'hidden',
            }}
          >
            <MiniCalendar
              firstDay={FIRST_DAY}
              current={startCalOpen ? startDate : endDate}
              markedDates={{
                [startCalOpen ? startDate : endDate]: { selected: true },
              }}
              onDayPress={(d: DateData) => {
                if (startCalOpen) {
                  setStartDate(d.dateString);
                  if (dayjs(endDate).isBefore(dayjs(d.dateString))) {
                    setEndDate(d.dateString);
                  }
                } else {
                  if (dayjs(d.dateString).isBefore(dayjs(startDate))) {
                    setEndDate(startDate);
                  } else {
                    setEndDate(d.dateString);
                  }
                }
                setStartCalOpen(false);
                setEndCalOpen(false);
              }}
              theme={{
                backgroundColor: theme.surface,
                calendarBackground: theme.surface,
                textDayFontWeight: '700',
                textDayFontSize: 16,
                textMonthFontSize: 16,
                textMonthFontWeight: '800',
                dayTextColor: theme.textPrimary,
                monthTextColor: theme.textPrimary,
                todayTextColor: theme.accent,
                selectedDayBackgroundColor: theme.accent,
                selectedDayTextColor: theme.accentText,
              }}
            />
          </View>
        </View>
      )}

      {/* ====== Time Picker Overlays ====== */}
      {/* Hour */}
      {addVisible && (startTimeOpen || endTimeOpen) && !formAllDay && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20010 }}>
          <Pressable onPress={() => { setStartTimeOpen(false); setEndTimeOpen(false); }} style={StyleSheet.absoluteFillObject}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          </Pressable>

          <View
            style={{
              position: 'absolute',
              top: Math.floor(SCREEN_H * 0.25),
              alignSelf: 'center',
              width: Math.min(420, SCREEN_W - 16),
              borderRadius: 16,
              backgroundColor: theme.surface,
              borderWidth: HAIR_SAFE,
              borderColor: theme.border,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              overflow: 'hidden',
              paddingVertical: 18,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.textPrimary, marginBottom: 8 }}>
              {startTimeOpen ? '開始時刻：ドラッグで選択（離して確定）' : '終了時刻：ドラッグで選択（離して確定）'}
            </Text>

            <HourDial
              size={380}
              innerRatio={0.50}
              outerRatio={0.78}
              thresholdRatio={0.64}
              value={startTimeOpen ? startHour : endHour}
              onChange={(h) => {
                if (startTimeOpen) {
                  setStartHour(h);
                } else {
                  setEndHour(h);
                }
              }}
              onConfirm={(h) => {
                if (startTimeOpen) {
                  setStartHour(h);
                  setStartTimeOpen(false);
                  const hh = String(h).padStart(2, '0');
                  const next = `${hh}:${String(startMinute ?? 0).padStart(2, '0')}`;
                  setStartTime(next);
                  ensureEndTimeNotBeforeStart(next, endTime);
                  setStartMinuteOpen(true);
                } else {
                  setEndHour(h);
                  setEndTimeOpen(false);
                  const hh = String(h).padStart(2, '0');
                  const next = `${hh}:${String(endMinute ?? 0).padStart(2, '0')}`;
                  setEndTime(next);
                  ensureEndTimeNotBeforeStart(startTime, next);
                  setEndMinuteOpen(true);
                }
              }}
              selectedColor={theme.accent}
              textColor={theme.textPrimary}
            />
          </View>
        </View>
      )}

      {/* Minute */}
      {addVisible && (startMinuteOpen || endMinuteOpen) && !formAllDay && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20011 }}>
          <Pressable onPress={() => { setStartMinuteOpen(false); setEndMinuteOpen(false); }} style={StyleSheet.absoluteFillObject}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          </Pressable>

          <View
            style={{
              position: 'absolute',
              top: Math.floor(SCREEN_H * 0.25),
              alignSelf: 'center',
              width: Math.min(420, SCREEN_W - 16),
              borderRadius: 16,
              backgroundColor: theme.surface,
              borderWidth: HAIR_SAFE,
              borderColor: theme.border,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              overflow: 'hidden',
              paddingVertical: 18,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.textPrimary, marginBottom: 8 }}>
              分をドラッグで選択（離して確定）
            </Text>

            <MinuteDial
              size={380}
              ringRatio={0.78}
              value={startMinuteOpen ? startMinute : endMinute}
              onChange={(m) => {
                if (startMinuteOpen) setStartMinute(m);
                else setEndMinute(m);
              }}
              onConfirm={(m) => {
                if (startMinuteOpen) {
                  setStartMinute(m);
                  const mm = String(m).padStart(2, '0');
                  const hh = String(startHour ?? 0).padStart(2, '0');
                  const next = `${hh}:${mm}`;
                  setStartTime(next);
                  setStartMinuteOpen(false);
                  ensureEndTimeNotBeforeStart(next, endTime);
                } else {
                  setEndMinute(m);
                  const mm = String(m).padStart(2, '0');
                  const hh = String(endHour ?? 0).padStart(2, '0');
                  const next = `${hh}:${mm}`;
                  setEndTime(next);
                  setEndMinuteOpen(false);
                  ensureEndTimeNotBeforeStart(startTime, next);
                }
              }}
              selectedColor={theme.accent}
              textColor={theme.textPrimary}
            />
          </View>
        </View>
      )}

      {/* ====== Color Palette Overlay ====== */}
      {addVisible && colorOpen && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20012 }}>
          <Pressable onPress={() => setColorOpen(false)} style={StyleSheet.absoluteFillObject}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          </Pressable>

          <View
            style={{
              position: 'absolute',
              // ★ 上に寄せる：10% → 4%
              top: Math.floor(SCREEN_H * 0.04),
              alignSelf: 'center',
              // ★ 幅を少しスリム化
              width: Math.min(420, SCREEN_W - 10),
              maxHeight: Math.floor(SCREEN_H * 0.80),
              borderRadius: 16,
              backgroundColor: theme.surface,
              borderWidth: HAIR_SAFE,
              borderColor: theme.border,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              overflow: 'hidden',
            }}
          >
            {/* 上：スクロール領域 */}
            <View style={{ flex: 1 }}>
              <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={!draggingColor}
              >

                {/* プレビュー（左右） */}
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 6 }}>現在</Text>
                    <View style={{
                      width: 52, height: 52, borderRadius: 12,
                      backgroundColor: (() => {
                        const cur = (formColor || '').trim();
                        if (HEX8.test(cur)) return rgbaStringFrom(`#${cur.replace('#','').slice(0,6)}`, extractAlpha01(cur));
                        if (HEX6.test(cur)) return cur;
                        return 'transparent';
                      })(),
                      borderWidth: HAIR_SAFE, borderColor: theme.border
                    }} />
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 6 }}>選択中</Text>
                    <View style={{
                      width: 52, height: 52, borderRadius: 12,
                      backgroundColor: rgbaStringFrom(tempColor, tempAlpha),
                      borderWidth: HAIR_SAFE, borderColor: theme.border
                    }} />
                  </View>
                </View>

                {/* 共通カラー（チップ） */}
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 8 }}>共通カラー</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 4 }}
                  style={{ marginBottom: 12 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {COLOR_PALETTE.map((hex) => {
                      const selected = tempColor.toLowerCase() === hex.toLowerCase();
                      const CHIP = 24;
                      return (
                        <Pressable
                          key={hex}
                          onPress={() => {
                            setTempColor(hex);
                            const { h, s, v } = hexToHsv(hex);
                            setHue(h);
                            setSvS(s);
                            setSvV(v);
                          }}
                          style={{
                            width: CHIP,
                            height: CHIP,
                            borderRadius: CHIP / 2,
                            backgroundColor: hex,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: selected ? 2 : HAIR_SAFE,
                            borderColor: selected ? theme.accent : theme.border,
                            marginRight: 2,
                          }}
                          accessibilityLabel={`色 ${hex}`}
                        >
                          {selected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                        </Pressable>
                      );
                    })}
                    {/* クリア（白） */}
                    <Pressable
                      onPress={() => {
                        setTempColor('#FFFFFF');
                        const { h, s, v } = hexToHsv('#FFFFFF');
                        setHue(h);
                        setSvS(s);
                        setSvV(v);
                      }}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: '#FFFFFF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: HAIR_SAFE, borderColor: theme.border,
                      }}
                      accessibilityLabel="白"
                    >
                      <Text style={{ color: '#000', fontSize: 10 }}>□</Text>
                    </Pressable>
                  </View>
                </ScrollView>

                {/* Hue / SV / Alpha */}
                <View style={{ alignSelf: 'center', width: 350, gap: 10 }}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary }}>色相</Text>
                  <HueBar
                    hue={hue}
                    onChange={(h) => {
                      setHue(h);
                      setTempColor(hsvToHex(h, svS, svV));
                    }}
                    theme={theme}
                    onDragStateChange={setDraggingColor}
                  />

                  <SVPicker
                    hue={hue}
                    s={svS}
                    v={svV}
                    onChange={(s, v) => {
                      setSvS(s);
                      setSvV(v);
                      setTempColor(hsvToHex(hue, s, v));
                    }}
                    theme={theme}
                    onDragStateChange={setDraggingColor}
                  />

                  {/* 追記：透明度バー */}
                  <Text style={{ fontSize: 11, color: theme.textSecondary }}>透明度</Text>
                  <AlphaBar
                    width={350}
                    value={tempAlpha}
                    onChange={setTempAlpha}
                    baseHex={tempColor}
                  />
                </View>
              </ScrollView>
            </View>

            {/* 下：フッター（固定） */}
            <View style={{ padding: 12, borderTopWidth: HAIR_SAFE, borderColor: theme.border, backgroundColor: theme.surface }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {/* キャンセル */}
                <Pressable
                  onPress={() => setColorOpen(false)}
                  style={{
                    flex: 4,
                    height: 42,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: HAIR_SAFE,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                  }}
                >
                  <Text style={{ color: theme.textPrimary, fontWeight: '800' }}>キャンセル</Text>
                </Pressable>

                {/* 決定（#RRGGBBAAで格納） */}
                <Pressable
                  onPress={() => {
                    const finalHex = appendAlpha(tempColor, tempAlpha); // #RRGGBBAA
                    setFormColor(finalHex);
                    setColorOpen(false);
                  }}
                  style={{
                    flex: 6,
                    height: 42,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.accent,
                  }}
                >
                  <Text style={{ color: theme.accentText, fontWeight: '800' }}>決定</Text>
                </Pressable>
              </View>
            </View>

          </View>
        </View>
      )}


    </View>
  );
}

/* === 下部オーバレイ専用の軽量スタイル === */
const overlayStyles = StyleSheet.create({
  nameOverlayWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
  },
  namePill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.98,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
    textAlign: 'center',
  },
  namePillTop: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.98,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    maxWidth: '100%',
  },
});
