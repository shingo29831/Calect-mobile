// src/screens/CalendarParts.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  PixelRatio,
} from 'react-native';
import type { DateData } from 'react-native-calendars';
import dayjs from '../lib/dayjs';

/* ===== ダークテーマ・パレット ===== */
const APP_BG         = '#0b1220';
const SURFACE        = '#111827';
const BORDER_LINE    = '#334155'; // 罫線・枠
const BORDER_LINE_SEL= '#60a5fa'; // 選択時の強調線
const TEXT_PRIMARY   = '#c0c8d1ff';
const TEXT_SECONDARY = '#6c7786ff';
const SUN_COLOR      = '#fca5a5';
const SAT_COLOR      = '#93c5fd';
const ACCENT         = '#60a5fa';

/* ===== 画面サイズ・線幅など ===== */
export const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

const hairRaw = StyleSheet.hairlineWidth;
export const HAIR_SAFE = Math.max(hairRaw, 0.5);

// 罫線はやや太め（暗背景で視認性UP）
export const LINE_W = PixelRatio.roundToNearestPixel(1.5);

export const LINE_COLOR = BORDER_LINE;
export const LINE_COLOR_SELECTED = BORDER_LINE_SEL;

/* ===== フォント ===== */
export const IS_SMALL_SCREEN = SCREEN_H < 700;
export const DAY_FONT = IS_SMALL_SCREEN ? 18 : 20;
export const HEADER_FONT = IS_SMALL_SCREEN ? 12 : 13;

/* ===== レイアウト（固定値） ===== */
export const HEADER_HEIGHT = 36;
export const MONTH_TITLE_HEIGHT = 44;
export const ROWS = 6; // showSixWeeks=true
export const FIRST_DAY = 0;
// 選択時のみ薄いアクセントで背景を付与（暗背景で見やすい）
export const SELECTED_BG = 'rgba(96,165,250,0.14)';
export const SIDE_PAD = 8;
export const SEP_H = LINE_W;

/* ===== イベント横バー表示の定数 ===== */
export const MAX_BARS_PER_DAY = 4;
export const EVENT_BAR_H = 16;
export const EVENT_BAR_GAP = 4;
export const EVENT_BAR_RADIUS = 6;
export const EVENT_TEXT_SIZE = 11;
export const DEFAULT_EVENT_COLOR = ACCENT;
export const DEFAULT_EVENT_BG = 'rgba(37, 99, 235, 0.12)';
export const BAR_INSET = 4;

/* ===== 左/右ドロワーのUI寸法 ===== */
export const DRAWER_ICON = 36;
export const PROFILE_ICON_SIZE = 28;

/* ===== 表示用の固定タイムゾーン（db と合わせる） ===== */
export const DISPLAY_TZ = 'Asia/Tokyo';

/* ===== エンティティ／イベント型 ===== */
export type EntityItem = {
  id: string;
  label: string;
  emoji: string;
  kind: 'me' | 'org' | 'group' | 'user';
};

export type EventSegment = {
  instance_id: number | string;
  title: string;
  color?: string | null;
  spanLeft: boolean;
  spanRight: boolean;
  showTitle?: boolean;
  __spacer?: boolean;
};

/* ===== ユーティリティ ===== */
export function startOfWeek(d: dayjs.Dayjs, firstDay: number) {
  const wd = d.day();
  const diff = (wd - firstDay + 7) % 7;
  return d.subtract(diff, 'day');
}
export function getMonthRangeDates(yyyymm: string) {
  const m0 = (dayjs as any).tz ? dayjs.tz(`${yyyymm}-01`, DISPLAY_TZ) : dayjs(`${yyyymm}-01`);
  const start = startOfWeek(m0.startOf('month'), FIRST_DAY);
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(start.add(i, 'day').format('YYYY-MM-DD'));
  }
  return days;
}

/* ===== 小さな UI コンポーネント群 ===== */
export function WeekHeader({ colWBase, colWLast }: { colWBase: number; colWLast: number }) {
  const raw = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const labels = [...raw.slice(FIRST_DAY), ...raw.slice(0, FIRST_DAY)];
  return (
    <View style={{ height: HEADER_HEIGHT, flexDirection: 'row' }}>
      {labels.map((label, i) => {
        const weekIndex = (FIRST_DAY + i) % 7;
        const color = weekIndex === 0 ? SUN_COLOR : weekIndex === 6 ? SAT_COLOR : TEXT_SECONDARY;
        const isLast = i === 6;
        return (
          <View
            key={`${label}-${i}`}
            style={{
              width: isLast ? colWLast : colWBase,
              height: HEADER_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
              borderRightWidth: isLast ? 0 : LINE_W,
              borderBottomWidth: 0,
              borderColor: LINE_COLOR,
            }}
          >
            <Text style={{ fontSize: HEADER_FONT, fontWeight: '700', color }}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export const DayCell = React.memo(function DayCell({
  date,
  state,
  marking,
  onPress,
  colWBase,
  colWLast,
  cellH,
  dayEvents = [],
  hideRightDivider = false,
  moreCount = 0,
}: {
  date: DateData;
  state: 'disabled' | 'today' | 'selected' | '';
  marking?: { selected?: boolean };
  onPress?: (d: DateData) => void;
  colWBase: number;
  colWLast: number;
  cellH: number;
  dayEvents?: EventSegment[];
  hideRightDivider?: boolean;
  moreCount?: number;
}) {
  const isSelected = !!marking?.selected;
  const isDisabled = state === 'disabled';

  const wd = (dayjs as any).tz
    ? dayjs.tz(date.dateString, DISPLAY_TZ).day()
    : dayjs(date.dateString).day();

  const colIndex = (wd - FIRST_DAY + 7) % 7;

  // 暗背景で視認性の高い色に
  const dayColor = isDisabled
    ? TEXT_SECONDARY
    : wd === 0
    ? SUN_COLOR
    : wd === 6
    ? SAT_COLOR
    : TEXT_PRIMARY;

  const isLast = colIndex === 6;
  const colW = isLast ? colWLast : colWBase;

  const barsTop = 6 + (DAY_FONT + 2) + 6;
  const cellBg = isSelected ? SELECTED_BG : 'transparent';
  const visibleSlots = dayEvents.slice(0, MAX_BARS_PER_DAY);

  return (
    <Pressable
      onPress={onPress ? () => onPress(date) : undefined}
      style={[
        styles.dayCell,
        {
          width: colW,
          height: cellH,
          backgroundColor: cellBg,
        },
      ]}
      android_ripple={{ color: 'rgba(96,165,250,0.18)' }}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {/* ★ 下罫線（常に最前面） */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: LINE_W,
          backgroundColor: isSelected ? LINE_COLOR_SELECTED : LINE_COLOR,
          zIndex: 30,
        }}
      />

      {/* ★ 右縦罫線（最前面） */}
      {!isLast && !hideRightDivider && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: LINE_W,
            backgroundColor: isSelected ? LINE_COLOR_SELECTED : LINE_COLOR,
            zIndex: 30,
          }}
        />
      )}

      {/* マスク（縦罫線を隠す指定がある場合のみ） */}
      {!isLast && hideRightDivider && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: LINE_W,
            backgroundColor: cellBg,
            zIndex: 31,
          }}
        />
      )}

      {/* 日付番号 */}
      <View pointerEvents="none" style={styles.topCenterWrap}>
        <Text style={[styles.dayNumber, { color: dayColor }]}>{date.day}</Text>
      </View>

      {/* イベントバー */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: barsTop }}>
        {visibleSlots.map((ev, idx) => {
          const top = idx * (EVENT_BAR_H + EVENT_BAR_GAP);

          if (ev.__spacer) {
            return (
              <View
                key={`${ev.instance_id}-${idx}`}
                style={{ position: 'absolute', left: 0, right: 0, top, height: EVENT_BAR_H }}
              />
            );
          }

          const baseColor = ev.color || DEFAULT_EVENT_COLOR;
          const bg = `${baseColor}22`; // 薄い背景（暗でも視認）
          const borderColor = baseColor;

          const radiusLeft = ev.spanLeft ? 0 : EVENT_BAR_RADIUS;
          const radiusRight = ev.spanRight ? 0 : EVENT_BAR_RADIUS;
          const left = ev.spanLeft ? 0 : BAR_INSET;
          const right = ev.spanRight ? 0 : BAR_INSET;

          return (
            <View
              key={`${ev.instance_id}-${idx}`}
              style={{
                position: 'absolute',
                left,
                right,
                top,
                height: EVENT_BAR_H,
                borderRadius: EVENT_BAR_RADIUS,
                borderTopLeftRadius: radiusLeft,
                borderBottomLeftRadius: radiusLeft,
                borderTopRightRadius: radiusRight,
                borderBottomRightRadius: radiusRight,
                backgroundColor: bg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor,
                paddingHorizontal: 6,
                justifyContent: 'center',
              }}
            >
              {ev.showTitle ? (
                <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: EVENT_TEXT_SIZE, color: TEXT_PRIMARY, fontWeight: '600' }}>
                  {ev.title}
                </Text>
              ) : null}
            </View>
          );
        })}

        {/* はみ出しがある場合の more バー（暗色用） */}
        {moreCount > 0 && (
          <View
            style={{
              position: 'absolute',
              left: BAR_INSET,
              right: BAR_INSET,
              top: MAX_BARS_PER_DAY * (EVENT_BAR_H + EVENT_BAR_GAP),
              height: EVENT_BAR_H,
              borderRadius: EVENT_BAR_RADIUS,
              backgroundColor: '#334155', // = BORDER_LINE 程度
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: '#475569',
            }}
          />
        )}
      </View>
    </Pressable>
  );
});

/* ===== リスト用行など（ダーク調整） ===== */
export function DrawerRow({
  item,
  active,
  onPress,
  indent = 0,
  chevron,
}: {
  item: EntityItem;
  active: boolean;
  onPress: (x: EntityItem) => void;
  indent?: number;
  chevron?: 'right' | 'down' | null;
}) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={[
        styles.row,
        {
          paddingLeft: 16 + indent,
          backgroundColor: active ? 'rgba(96,165,250,0.16)' : 'transparent',
        },
      ]}
      android_ripple={{ color: 'rgba(96,165,250,0.18)' }}
    >
      <View
        style={[
          styles.rowIcon,
          {
            width: DRAWER_ICON,
            height: DRAWER_ICON,
            borderRadius: DRAWER_ICON / 2,
            backgroundColor: SURFACE,
            borderColor: BORDER_LINE,
          },
        ]}
      >
        <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
      </View>

      <Text
        numberOfLines={1}
        style={[
          styles.rowLabel,
          { color: active ? TEXT_PRIMARY : TEXT_PRIMARY },
          active && { fontWeight: '700' },
        ]}
      >
        {item.label}
      </Text>

      {chevron ? (
        <Text style={[styles.chevron, { color: TEXT_SECONDARY }]}>{chevron === 'down' ? '▾' : '▸'}</Text>
      ) : (
        <View style={{ width: 16 }} />
      )}
    </Pressable>
  );
}

export function ProfileMenuRow({ icon, label, onPress }: { icon: string; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.profileMenuRow} android_ripple={{ color: 'rgba(96,165,250,0.18)' }}>
      <Text style={[styles.profileMenuIcon, { color: TEXT_PRIMARY }]}>{icon}</Text>
      <Text style={[styles.profileMenuLabel, { color: TEXT_PRIMARY }]}>{label}</Text>
    </Pressable>
  );
}

/* ===== このファイル内のスタイル（小コンポーネント用） ===== */
const styles = StyleSheet.create({
  dayCell: {
    position: 'relative',
    backgroundColor: 'transparent',
    paddingTop: 6,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  topCenterWrap: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  dayNumber: { fontWeight: '700', fontSize: DAY_FONT, lineHeight: DAY_FONT + 2, textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    paddingVertical: 10,
    gap: 12,
  },
  rowIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER_LINE,
  },
  rowLabel: { flex: 1, fontSize: 15 },
  chevron: { fontSize: 16, marginLeft: 6 },

  profileMenuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  profileMenuIcon: { fontSize: 18 },
  profileMenuLabel: { fontSize: 15, flex: 1 },
});

export {};
