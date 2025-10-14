// DayCell.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable, PixelRatio } from 'react-native';
import type { EventInstance } from '../../api/types';

// react-native-calendars の dayComponent から渡ってくる date の最小型
type DateLike = {
  dateString: string;
  day: number;
  month: number;
  year: number;
  timestamp: number;
};

// dayComponent 基本プロップ（marking の厳密型は複雑なので any でOK）
type DayComponentBaseProps = {
  date: DateLike;
  state: 'disabled' | 'today' | 'current' | string;
  marking?: any;
  onPress?: (date: DateLike) => void;
};

// あなたの DayCell が使っている追加プロップ
export type DayCellProps = DayComponentBaseProps & {
  colWBase: number;
  colWLast: number;
  cellH: number;
  dayEvents: EventInstance[];
  hideRightDivider?: boolean; // ←来ても無視（右罫線は常に描画）
  moreCount?: number;
};

// 画面共通定義
const DATE_COLOR = '#0f172a';
const DISABLED_DATE_COLOR = '#9aa4b2';
const TODAY_BORDER = '#0ea5e9';
const EVENT_TEXT = '#0f172a';
const EVENT_DOT_FALLBACK = '#334155';

// ★ 罫線の色＆太さ（ここを変えるだけで一括調整）
const LINE_COLOR = '#e6e9ef';
// 端末解像度を考慮した「見た目少し太め」
// お好みに応じて 1 / PixelRatio.get() * n でもOK
const LINE_THICKNESS = 1.25;

export default function DayCell(props: DayCellProps) {
  const {
    date, state, onPress,
    colWBase, colWLast, cellH,
    dayEvents, /* hideRightDivider (無視) */ moreCount = 0,
  } = props;

  // 曜日から最終列かどうかを判定（0:Sun ... 6:Sat）
  const dayOfWeek = new Date(date.timestamp).getDay();
  const isLastCol = dayOfWeek === 6;
  const colW = isLastCol ? colWLast : colWBase;

  return (
    <View
      style={{
        height: cellH,
        width: colW,
        overflow: 'hidden',
        backgroundColor: 'transparent', // 背景は透明
      }}
    >
      <Pressable
        onPress={onPress ? () => onPress(date) : undefined}
        android_ripple={{ color: '#00000014' }}
        style={[
          styles.inner,
          state === 'today' ? styles.todayOutline : null, // 枠線のみで今日を強調
        ]}
      >
        {/* 日付ラベル */}
        <Text
          allowFontScaling={false}
          style={[
            styles.dateText,
            state === 'disabled' ? styles.dateTextDisabled : null,
          ]}
        >
          {date.day}
        </Text>

        {/* イベント */}
        <View style={styles.eventsWrap}>
          {renderEventRows(dayEvents)}
        </View>

        {/* +N */}
        {moreCount > 0 && (
          <View pointerEvents="none" style={styles.moreBadge}>
            <Text allowFontScaling={false} style={styles.moreText}>+{moreCount}</Text>
          </View>
        )}
      </Pressable>

      {/* 罫線（absolute。レイアウトに影響しない） */}
      {/* 上線 */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { top: 0, bottom: undefined, height: LINE_THICKNESS, backgroundColor: LINE_COLOR }]}
      />
      {/* 右線：常に描画（Tue/Wed/Thu 間が消えないように） */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: LINE_THICKNESS, backgroundColor: LINE_COLOR }}
      />
      {/* 下線（必要ならON。行の区切りを強めたいときに有効） */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: LINE_THICKNESS, backgroundColor: LINE_COLOR }}
      />
    </View>
  );
}

/** イベント行の描画（最小・安全実装） */
function renderEventRows(items: EventInstance[]) {
  if (!Array.isArray(items) || items.length === 0) return null;

  // 1セル内は上位3件まで
  const rows = items.slice(0, 3).map((ev, idx) => {
    const color =
      // @ts-expect-error: 任意の color フィールドを許容
      (ev.color as string | undefined) ||
      // @ts-expect-error: 任意の style?.background_color を許容
      (ev.style?.background_color as string | undefined) ||
      EVENT_DOT_FALLBACK;

    // 表示テキスト（タイトル優先）
    // @ts-expect-error: 任意の title/summary を許容
    const title = (ev.title as string) || (ev.summary as string) || 'Untitled';

    return (
      <View key={idx} style={styles.eventRow}>
        <View style={[styles.eventDot, { backgroundColor: color }]} />
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={styles.eventText}
        >
          {title}
        </Text>
      </View>
    );
  });

  return rows;
}

const styles = StyleSheet.create({
  inner: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 6,
  },
  // 今日の背景は塗らずに枠線のみ
  todayOutline: {
    borderWidth: 1,
    borderColor: TODAY_BORDER,
    borderRadius: 6,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '700',
    color: DATE_COLOR,
  },
  dateTextDisabled: {
    color: DISABLED_DATE_COLOR,
  },
  eventsWrap: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  eventRow: {
    height: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  eventText: {
    flex: 1,
    fontSize: 10,
    color: EVENT_TEXT,
    lineHeight: 14,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  moreBadge: {
    position: 'absolute',
    right: 4,
    bottom: 2,
    paddingHorizontal: 6,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
