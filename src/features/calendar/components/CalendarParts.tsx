// src/features/calendar/components/CalendarParts.tsx
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
import dayjs from '../../../lib/dayjs';
import { useAppTheme } from '../../../theme';

/* ===== 画面サイズ・線幅など ===== */
export const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

const hairRaw = StyleSheet.hairlineWidth;
export const HAIR_SAFE = Math.max(hairRaw, 0.5);

// 罫線はやや太め（視認性UP）
export const LINE_W = PixelRatio.roundToNearestPixel(1.5);

// ▼ 互換用（外部から参照されていても動くデフォルト値）
//   実際の描画色はコンポーネント内で Theme から取得します
export const LINE_COLOR = '#e6e9ef';
export const LINE_COLOR_SELECTED = '#94a3b8';

/* ===== フォント ===== */
export const IS_SMALL_SCREEN = SCREEN_H < 700;
export const DAY_FONT = IS_SMALL_SCREEN ? 18 : 20;
export const HEADER_FONT = IS_SMALL_SCREEN ? 12 : 13;

/* ===== レイアウト定数 ===== */
export const HEADER_HEIGHT = 36;
export const MONTH_TITLE_HEIGHT = 44;
export const ROWS = 6; // showSixWeeks=true
export const FIRST_DAY = 0;
// 選択日の背景（実描画は Theme の accent を元に計算）
export const SELECTED_BG = 'rgba(96,165,250,0.14)';
export const SIDE_PAD = 8;
export const SEP_H = LINE_W;

/* ===== イベントバー表示用定数 ===== */
export const MAX_BARS_PER_DAY = 4;
export const EVENT_BAR_H = 16;
export const EVENT_BAR_GAP = 4;
export const EVENT_BAR_RADIUS = 6;
export const EVENT_TEXT_SIZE = 11;
export const DEFAULT_EVENT_COLOR = '#60a5fa';
export const DEFAULT_EVENT_BG = 'rgba(37, 99, 235, 0.12)';
export const BAR_INSET = 4;

/* ===== Drawer / Profile のUI用 ===== */
export const DRAWER_ICON = 36;
export const PROFILE_ICON_SIZE = 28;

/* ===== 表示TZ ===== */
export const DISPLAY_TZ = 'Asia/Tokyo';

/* ===== 型 ===== */
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

/* ===== ヘルパー ===== */
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

/* ===== UI: 週ヘッダ ===== */
export function WeekHeader({ colWBase, colWLast }: { colWBase: number; colWLast: number }) {
  const theme = useAppTheme();
  const raw = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const labels = [...raw.slice(FIRST_DAY), ...raw.slice(0, FIRST_DAY)];
  return (
    <View style={{ height: HEADER_HEIGHT, flexDirection: 'row' }}>
      {labels.map((label, i) => {
        const weekIndex = (FIRST_DAY + i) % 7;
        const color =
          weekIndex === 0 ? theme.daySun :
          weekIndex === 6 ? theme.daySat :
          theme.textSecondary;
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
              borderColor: theme.lineColor,
            }}
          >
            <Text style={{ fontSize: HEADER_FONT, fontWeight: '700', color }}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ===== UI: 日セル ===== */
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
  const theme = useAppTheme();

  const isSelected = !!marking?.selected;
  const isDisabled = state === 'disabled';

  const wd = (dayjs as any).tz
    ? dayjs.tz(date.dateString, DISPLAY_TZ).day()
    : dayjs(date.dateString).day();

  const colIndex = (wd - FIRST_DAY + 7) % 7;

  const dayColor = isDisabled
    ? theme.dayDisabled
    : wd === 0
    ? theme.daySun
    : wd === 6
    ? theme.daySat
    : theme.dayWeekday;

  const isLast = colIndex === 6;
  const colW = isLast ? colWLast : colWBase;

  const barsTop = 6 + (DAY_FONT + 2) + 6;
  const cellBg = isSelected ? `${theme.accent}24` : 'transparent';

  const visibleSlots = dayEvents.slice(0, MAX_BARS_PER_DAY);
  const computedMore = moreCount > 0 ? moreCount : Math.max(0, dayEvents.length - MAX_BARS_PER_DAY);

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
      android_ripple={{ color: `${theme.accent}2E` }}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {/* 下罫線 */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: LINE_W,
          backgroundColor: isSelected ? theme.lineColorSelected : theme.lineColor,
          zIndex: 30,
        }}
      />

      {/* 右罫線 */}
      {!isLast && !hideRightDivider && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: LINE_W,
            backgroundColor: isSelected ? theme.lineColorSelected : theme.lineColor,
            zIndex: 30,
          }}
        />
      )}

      {/* 右罫線を消したいときの上書き */}
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

          if ((ev as any).__spacer) {
            return (
              <View
                key={`${ev.instance_id}-${idx}`}
                style={{ position: 'absolute', left: 0, right: 0, top, height: EVENT_BAR_H }}
              />
            );
          }

          const baseColor = ev.color || theme.eventDefaultFg;
          const bg = `${baseColor}22`;
          const borderColor = baseColor;

          const radiusLeft = ev.spanLeft ? 0 : EVENT_BAR_RADIUS;
          const radiusRight = ev.spanRight ? 0 : EVENT_BAR_RADIUS;
          const left = ev.spanLeft ? 0 : BAR_INSET;
          const right = ev.spanRight ? 0 : BAR_INSET;

          const willShowTitle = ev.showTitle ?? true;
          const titleText = (ev.title?.trim?.() || ev.title || '').toString().trim() || '(no title)';

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
              {willShowTitle ? (
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ fontSize: EVENT_TEXT_SIZE, color: theme.textPrimary, fontWeight: '600' }}
                >
                  {titleText}
                </Text>
              ) : null}
            </View>
          );
        })}

        {/* more 表示 */}
        {computedMore > 0 && (
          <View
            style={{
              position: 'absolute',
              left: BAR_INSET,
              right: BAR_INSET,
              top: visibleSlots.length * (EVENT_BAR_H + EVENT_BAR_GAP),
              height: EVENT_BAR_H,
              borderRadius: EVENT_BAR_RADIUS,
              backgroundColor: theme.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.textSecondary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: EVENT_TEXT_SIZE, color: theme.textSecondary, fontWeight: '600' }}
            >
              +{computedMore}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

/* ===== Drawer / Profile 共通の行 ===== */
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
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={[
        styles.row,
        {
          paddingLeft: 16 + indent,
          backgroundColor: active ? `${theme.accent}29` : 'transparent',
        },
      ]}
      android_ripple={{ color: `${theme.accent}2E` }}
    >
      <View
        style={[
          styles.rowIcon,
          {
            width: DRAWER_ICON,
            height: DRAWER_ICON,
            borderRadius: DRAWER_ICON / 2,
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
      </View>

      <Text
        numberOfLines={1}
        style={[
          styles.rowLabel,
          { color: theme.textPrimary },
          active && { fontWeight: '700' },
        ]}
      >
        {item.label}
      </Text>

      {chevron ? (
        <Text style={[styles.chevron, { color: theme.textSecondary }]}>
          {chevron === 'down' ? '▼' : '▶'}
        </Text>
      ) : (
        <View style={{ width: 16 }} />
      )}
    </Pressable>
  );
}

export function ProfileMenuRow({ icon, label, onPress }: { icon: string; label: string; onPress?: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable onPress={onPress} style={styles.profileMenuRow} android_ripple={{ color: `${theme.accent}2E` }}>
      <Text style={[styles.profileMenuIcon, { color: theme.textPrimary }]}>{icon}</Text>
      <Text style={[styles.profileMenuLabel, { color: theme.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

/* ===== Styles ===== */
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
    borderWidth: 1,
  },
  rowLabel: { flex: 1, fontSize: 15 },
  chevron: { fontSize: 16, marginLeft: 6 },

  profileMenuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  profileMenuIcon: { fontSize: 18 },
  profileMenuLabel: { fontSize: 15, flex: 1 },
});

export {};
