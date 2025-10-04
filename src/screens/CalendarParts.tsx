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

/* ===== 画面サイズ・線幅など ===== */
export const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

const hairRaw = StyleSheet.hairlineWidth;
export const HAIR_SAFE = Math.max(hairRaw, 0.5);
export const LINE_W = PixelRatio.roundToNearestPixel(1);
export const LINE_COLOR = '#e6e9ef';
export const LINE_COLOR_SELECTED = '#94a3b8';

/* ===== フォント ===== */
export const IS_SMALL_SCREEN = SCREEN_H < 700;
export const DAY_FONT = IS_SMALL_SCREEN ? 18 : 20;
export const HEADER_FONT = IS_SMALL_SCREEN ? 12 : 13;

/* ===== レイアウト（固定値） ===== */
export const HEADER_HEIGHT = 36;
export const MONTH_TITLE_HEIGHT = 44;
export const ROWS = 6; // showSixWeeks=true
export const FIRST_DAY = 0;
export const SELECTED_BG = 'rgba(15, 23, 42, 0.08)';
export const SIDE_PAD = 8;
export const SEP_H = LINE_W;

/* ===== イベント横バー表示の定数 ===== */
export const MAX_BARS_PER_DAY = 4; // 4本までフル表示。以降は「moreバー」で途切れ表示
export const EVENT_BAR_H = 16;
export const EVENT_BAR_GAP = 4;
export const EVENT_BAR_RADIUS = 6;
export const EVENT_TEXT_SIZE = 11;
export const DEFAULT_EVENT_COLOR = '#60a5fa';
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
  // yyyymm は 'YYYY-MM' 想定。TZ を固定して月グリッドを作る
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
        const color = weekIndex === 0 ? '#ef4444' : weekIndex === 6 ? '#3b82f6' : '#334155';
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
  moreCount = 0,      // ← はみ出し件数（>0 なら more バーを描画）
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

  // 曜日判定を表示TZに固定
  const wd = (dayjs as any).tz
    ? dayjs.tz(date.dateString, DISPLAY_TZ).day()
    : dayjs(date.dateString).day();

  const colIndex = (wd - FIRST_DAY + 7) % 7;

  const dayColor = isDisabled
    ? '#9ca3af'
    : wd === 0
    ? '#ef4444'
    : wd === 6
    ? '#3b82f6'
    : '#0f172a';

  const isLast = colIndex === 6;
  const colW = isLast ? colWLast : colWBase;

  // バーのY位置（日付数字の下）
  const barsTop = 6 + (DAY_FONT + 2) + 6;

  const cellBg = isSelected ? SELECTED_BG : '#ffffff';

  // 表示するバー（MAX_BARS_PER_DAY まで）
  const visibleSlots = dayEvents.slice(0, MAX_BARS_PER_DAY);

  return (
    <Pressable
      onPress={onPress ? () => onPress(date) : undefined}
      style={[
        styles.dayCell,
        {
          width: colW,
          height: cellH,
          borderBottomWidth: HAIR_SAFE,
          borderColor: isSelected ? LINE_COLOR_SELECTED : LINE_COLOR,
          backgroundColor: cellBg,
        },
      ]}
      android_ripple={{ color: 'rgba(37,99,235,0.08)' }}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {/* 擬似・縦罫線（背面） */}
      {!isLast && !hideRightDivider && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0, bottom: 0, right: 0,
            width: LINE_W,
            backgroundColor: isSelected ? LINE_COLOR_SELECTED : LINE_COLOR,
          }}
        />
      )}

      {/* マスク（縦罫線を隠す） */}
      {!isLast && hideRightDivider && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0, bottom: 0, right: 0,
            width: LINE_W,
            backgroundColor: cellBg,
          }}
        />
      )}

      {/* 日付番号 */}
      <View pointerEvents="none" style={styles.topCenterWrap}>
        <Text style={[styles.dayNumber, { color: dayColor }]}>{date.day}</Text>
      </View>

      {/* イベントバー（均一表示） */}
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
          const bg = `${baseColor}22`; // 薄い背景
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
                left, right, top,
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
                <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: EVENT_TEXT_SIZE, color: '#0f172a', fontWeight: '600' }}>
                  {ev.title}
                </Text>
              ) : null}
            </View>
          );
        })}

        {/* はみ出しがある場合：一番下に “more バー” を追加（セル下端で途切れる） */}
        {moreCount > 0 && (
          <View
            // MAX_BARS_PER_DAY 本のさらに下に配置（overflow:hiddenで下端が切れる）
            style={{
              position: 'absolute',
              left: BAR_INSET,
              right: BAR_INSET,
              top: MAX_BARS_PER_DAY * (EVENT_BAR_H + EVENT_BAR_GAP),
              height: EVENT_BAR_H,
              borderRadius: EVENT_BAR_RADIUS,
              backgroundColor: '#666969ff',   // 薄いグレー（イベントと区別）
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: '#cbd5e1',
            }}
          />
        )}
      </View>
    </Pressable>
  );
});

/* ===== リスト用行など ===== */
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
        { paddingLeft: 16 + indent, backgroundColor: active ? 'rgba(37,99,235,0.08)' : 'transparent' },
      ]}
      android_ripple={{ color: 'rgba(37,99,235,0.12)' }}
    >
      <View style={[styles.rowIcon, { width: DRAWER_ICON, height: DRAWER_ICON, borderRadius: DRAWER_ICON / 2 }]}>
        <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
      </View>

      <Text numberOfLines={1} style={[styles.rowLabel, active && { fontWeight: '700', color: '#111827' }]}>
        {item.label}
      </Text>

      {chevron ? (
        <Text style={styles.chevron}>{chevron === 'down' ? '▾' : '▸'}</Text>
      ) : (
        <View style={{ width: 16 }} />
      )}
    </Pressable>
  );
}

export function ProfileMenuRow({ icon, label, onPress }: { icon: string; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.profileMenuRow} android_ripple={{ color: 'rgba(37,99,235,0.12)' }}>
      <Text style={styles.profileMenuIcon}>{icon}</Text>
      <Text style={styles.profileMenuLabel}>{label}</Text>
    </Pressable>
  );
}

/* ===== このファイル内のスタイル（小コンポーネント用） ===== */
const styles = StyleSheet.create({
  dayCell: {
    position: 'relative',
    backgroundColor: '#ffffff',
    paddingTop: 6,
    alignSelf: 'flex-start',
    overflow: 'hidden', // ここが重要：more バーを下端で切る
  },
  topCenterWrap: {
    position: 'absolute',
    top: 6, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'flex-start',
  },
  dayNumber: { fontWeight: '700', fontSize: DAY_FONT, lineHeight: DAY_FONT + 2, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 12, paddingVertical: 10, gap: 12 },
  rowIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb' },
  rowLabel: { flex: 1, color: '#374151', fontSize: 15 },
  chevron: { color: '#6b7280', fontSize: 16, marginLeft: 6 },

  profileMenuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  profileMenuIcon: { fontSize: 18 },
  profileMenuLabel: { fontSize: 15, color: '#374151', flex: 1 },
});

export {};
