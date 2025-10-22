// src/features/calendar/screens/CalendarScreen.tsx
// -----------------------------------------------------------------------------
// 月間カレンダー画面（全置換 / 2025-10-22）
// - 64行目エラー対応: getMonthRangeDates の呼び出し/返り値差異を吸収するラッパーを追加
// - Theme -> CalendarTheme はアダプタで正規化
// - WeekHeader に colWBase/colWLast を付与
// - DayCell.state は '' | 'today' | 'disabled' | 'selected'
// - useMonthEvents の EventSegment[] をそのまま DayCell に渡す
// -----------------------------------------------------------------------------

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import dayjs from '../../../lib/dayjs';
import { useAppTheme } from '../../../theme';

// スタイル
import { makeCalendarStyles, type CalendarTheme } from '../styles/calendarStyles';

// カレンダー部品
import {
  WeekHeader,
  DayCell,
  getMonthRangeDates,
  SCREEN_W,
} from '../components/CalendarParts';

// 月イベント展開フック
import { useMonthEvents, type EventSegment, type SortMode } from '../hooks/useMonthEvents';

type Props = { navigation?: any };

const COLS = 7;        // 曜日数
const ROWS = 6;        // 月表示は最大 6 週
const COL_W = SCREEN_W / COLS;
const CELL_H = 96;     // 1 日セルの高さ（必要に応じて調整）

/** 任意の Theme を CalendarTheme へ正規化するアダプタ */
function toCalendarTheme(anyTheme: any): CalendarTheme {
  if (anyTheme && anyTheme.colors) return anyTheme as CalendarTheme;

  const c = anyTheme?.palette ?? anyTheme?.color ?? {};
  return {
    colors: {
      background: c.background ?? '#ffffff',
      surface: c.surface ?? '#ffffff',
      surfaceVariant: c.surfaceVariant,
      onSurface: c.onSurface ?? '#111111',
      onSurfaceVariant: c.onSurfaceVariant,
      primary: c.primary ?? '#0ea5e9',
      primaryContainer: c.primaryContainer,
      outline: c.outline ?? '#e5e7eb',
      overlay: c.overlay,
      focus: c.focus ?? c.primary ?? '#0ea5e9',
      danger: c.danger ?? '#ef4444',
      success: c.success ?? '#22c55e',
    },
    roundness: anyTheme?.roundness ?? 12,
  };
}

/** getMonthRangeDates の入力/出力の差異を吸収する安全ラッパー */
function resolveMonthDates(baseMonth: dayjs.Dayjs): string[] {
  // 1) Date を渡してみる
  try {
    const r1: any = getMonthRangeDates(baseMonth.toDate() as any);
    if (Array.isArray(r1)) return r1 as string[];
    if (r1 && Array.isArray(r1.dates)) return r1.dates as string[];
  } catch (_) {
    // fallthrough
  }
  // 2) 文字列（'YYYY-MM-DD'）を渡してみる
  try {
    const r2: any = getMonthRangeDates(baseMonth.format('YYYY-MM-DD') as any);
    if (Array.isArray(r2)) return r2 as string[];
    if (r2 && Array.isArray(r2.dates)) return r2.dates as string[];
  } catch (_) {
    // fallthrough
  }
  // 3) どれも合わない場合は自前で 6 週ぶん生成（当月 1日基準）
  const start = baseMonth.startOf('month').startOf('week'); // 日曜始まり想定（必要なら週の基準を調整）
  return Array.from({ length: ROWS * COLS }, (_, i) => start.add(i, 'day').format('YYYY-MM-DD'));
}

const CalendarScreen: React.FC<Props> = () => {
  const theme = useAppTheme();
  const S = makeCalendarStyles(toCalendarTheme(theme)); // ← 40行目対策も継続

  // 表示基準の月（1 日の 00:00）
  const [baseMonth, setBaseMonth] = useState(() => dayjs().startOf('month'));

  // 並び順（長いイベント優先 or 開始時間順）
  const [sortMode] = useState<SortMode>('span');

  // グリッドに並べる 'YYYY-MM-DD' の配列（最大 42 日）
  const monthDates = useMemo(() => resolveMonthDates(baseMonth), [baseMonth]);

  // 所属/タグなどでフィルタ（必要なら差し替え）
  const filterEventsByEntity = useCallback((arr: any[]) => arr as any[], []);

  // 1 日あたりの EventSegment[] と more 件数
  const { eventsByDate, overflowByDate } = useMonthEvents(
    monthDates,
    filterEventsByEntity,
    sortMode,
  );

  // 月移動
  const goPrev = () => setBaseMonth((m) => m.subtract(1, 'month'));
  const goNext = () => setBaseMonth((m) => m.add(1, 'month'));
  const goToday = () => setBaseMonth(dayjs().startOf('month'));

  return (
    <View style={S.root}>
      {/* 月ヘッダー */}
      <View style={S.monthHeader}>
        <Pressable onPress={goPrev} style={S.monthNavBtn}>
          <Text style={S.monthNavBtnText}>{'‹'}</Text>
        </Pressable>
        <Text style={S.monthTitle}>{baseMonth.format('YYYY MMMM')}</Text>
        <View style={X.hRow}>
          <Pressable onPress={goToday} style={[S.monthNavBtn, X.ghostBtn]}>
            <Text style={S.monthNavBtnText}>Today</Text>
          </Pressable>
          <Pressable onPress={goNext} style={S.monthNavBtn}>
            <Text style={S.monthNavBtnText}>{'›'}</Text>
          </Pressable>
        </View>
      </View>

      {/* 曜日ヘッダー（幅指定が必須） */}
      <WeekHeader colWBase={COL_W} colWLast={COL_W} />

      {/* 月グリッド */}
      <ScrollView style={S.monthGrid} contentContainerStyle={X.gridContent}>
        {Array.from({ length: ROWS }).map((_, rowIdx) => {
          const rowDates = monthDates.slice(rowIdx * COLS, rowIdx * COLS + COLS);

          return (
            <View key={`row-${rowIdx}`} style={S.weekRow}>
              {rowDates.map((dateStr: string, colIdx: number) => {
                const d = dayjs(dateStr);
                const isOutside = d.month() !== baseMonth.month();
                const isToday = d.isSame(dayjs(), 'day');

                // useMonthEvents が返す EventSegment[] をそのまま使う
                const daySegs: EventSegment[] = eventsByDate[dateStr] || [];
                const moreCount = overflowByDate[dateStr] || 0;

                return (
                  <View
                    key={dateStr}
                    style={[S.dayCell, colIdx === 0 && X.noLeftDivider]}
                  >
                    <DayCell
                      // DateData 互換
                      date={{
                        dateString: dateStr,
                        day: d.date(),
                        month: d.month() + 1,
                        year: d.year(),
                        timestamp: d.valueOf(),
                      }}
                      // DayCell の state 型: '' | 'today' | 'disabled' | 'selected'
                      state={isToday ? 'today' : (isOutside ? 'disabled' : '')}
                      onPress={() => {
                        // TODO: ここに日別一覧や作成モーダルを開く処理
                        // 例) setSelectedDate(dateStr); setSheetOpen(true);
                      }}
                      // 追加 props（CalendarParts の DayCell に合わせる）
                      colWBase={COL_W}
                      colWLast={COL_W}
                      cellH={CELL_H}
                      dayEvents={daySegs}
                      moreCount={moreCount}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const X = StyleSheet.create({
  hRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  ghostBtn: {
    opacity: 0.9,
  },
  noLeftDivider: {
    // 左端に見える“薄い線”が気になる場合の対策
    borderLeftWidth: 0,
  },
  gridContent: {
    paddingBottom: 12,
  },
});

export default CalendarScreen;
