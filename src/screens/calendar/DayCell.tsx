// DayCell.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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
  hideRightDivider?: boolean;
  moreCount?: number;
};

// 画面共通定義（CalendarParts 由来の想定値）
// ※ ここに直接書いておくことで、このファイル単体で成立します。
//   既存の CalendarParts に同名があるなら競合を避けるためここを削って import に差し替えてOK。
const HAIR_SAFE = 0.5;               // StyleSheet.hairlineWidth の安全値
const LINE_COLOR = '#e6e9ef';
const DATE_COLOR = '#0f172a';
const DISABLED_DATE_COLOR = '#9aa4b2';
const TODAY_BG = '#0ea5e91a';
const EVENT_TEXT = '#0f172a';
const EVENT_DOT_FALLBACK = '#334155';

export default function DayCell(props: DayCellProps) {
  const {
    date, state, onPress,
    colWBase, colWLast, cellH,
    dayEvents, hideRightDivider, moreCount = 0,
  } = props;

  // 右端列なら colWLast、そうでなければ colWBase を適用
  const colW = hideRightDivider ? colWLast : colWBase;

  // セル固定枠（高さ・幅がレイアウトの唯一の基準。縦 margin/border は使わない）
  return (
    <View style={{ height: cellH, width: colW, overflow: 'hidden' }}>
      <Pressable
        onPress={onPress ? () => onPress(date) : undefined}
        android_ripple={{ color: '#00000014' }}
        style={[
          styles.inner,
          state === 'today' ? styles.todayBg : null,
        ]}
      >
        {/* 日付ラベル（拡大で崩れないように allowFontScaling=false 推奨） */}
        <Text
          allowFontScaling={false}
          style={[
            styles.dateText,
            state === 'disabled' ? styles.dateTextDisabled : null,
          ]}
        >
          {date.day}
        </Text>

        {/* イベント（縦 margin は使わず、親の padding と lineHeight で間隔を調整） */}
        <View style={styles.eventsWrap}>
          {renderEventRows(dayEvents)}
        </View>

        {/* 「+N」表示（重ね描画、レイアウトに影響しない） */}
        {moreCount > 0 && (
          <View pointerEvents="none" style={styles.moreBadge}>
            <Text allowFontScaling={false} style={styles.moreText}>+{moreCount}</Text>
          </View>
        )}
      </Pressable>

      {/* 罫線は absolute で重ねる（レイアウトに影響しない） */}
      {/* 上線（必要なら表示。週ごとの区切り用途／常時でもOK） */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { top: 0, bottom: undefined, height: HAIR_SAFE, backgroundColor: LINE_COLOR }]}
      />
      {/* 右線（最終列は省略） */}
      {!hideRightDivider && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: HAIR_SAFE, backgroundColor: LINE_COLOR }}
        />
      )}
    </View>
  );
}

/** イベント行の描画（最小・安全実装） */
function renderEventRows(items: EventInstance[]) {
  if (!Array.isArray(items) || items.length === 0) return null;

  // 1セル内に詰め込みすぎないよう、最初の 3 件だけ行で表示
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
    // 縦余白は padding に集約（margin は使わない）
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 6,
  },
  todayBg: {
    // 今日セルの軽いハイライト（背景のみで高さは変えない）
    backgroundColor: TODAY_BG,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '700',
    color: DATE_COLOR,
    // marginVertical は使わない
  },
  dateTextDisabled: {
    color: DISABLED_DATE_COLOR,
  },
  eventsWrap: {
    flex: 1,
    // 子の縦間隔は lineHeight と row 自体の高さで表現
    // ここで gap/margin は使わない（Android での高さ拡張を避ける）
    justifyContent: 'flex-start',
  },
  eventRow: {
    // 行自体の高さを固定して安定させる（セル総高に影響しない）
    height: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6, // 横方向の余白のみOK
  },
  eventText: {
    flex: 1,
    fontSize: 10,
    color: EVENT_TEXT,
    // 行間で視覚的な余白を確保（縦 margin は使わない）
    lineHeight: 14,
    includeFontPadding: false, // Android の余白抑制
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
