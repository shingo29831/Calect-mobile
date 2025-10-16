// src/features/calendar/hooks/useMonthEvents.ts
import { useMemo } from 'react';
import dayjs from '../../../lib/dayjs';
import type { EventInstance } from '../../../api/types';
import { listInstancesByDate } from '../../../store/db';
import { MAX_BARS_PER_DAY } from '../components/CalendarParts';

type SortMode = 'span' | 'start';

/** DayCell で使うイベント片（横バー1本分） */
export type EventSegment = EventInstance & {
  spanLeft: boolean;   // 前日にまたがっているなら左を角丸にしない
  spanRight: boolean;  // 翌日にまたがっているなら右を角丸にしない
};

/** 「同一」とみなすための簡易キー（暫定） */
const keyOf = (ev: EventInstance) =>
  `${String(ev.calendar_id ?? '')}|${String(ev.title ?? '')}|${String(ev.start_at ?? '')}|${String(ev.end_at ?? '')}`;

/** 並び順を作る（開始時刻 or 所要時間の長い順） */
function makeSorter(sortMode: SortMode) {
  if (sortMode === 'start') {
    return (a: EventInstance, b: EventInstance) =>
      dayjs(a.start_at).valueOf() - dayjs(b.start_at).valueOf() ||
      (a.title || '').localeCompare(b.title || '');
  }
  // 'span'：長いイベント優先 → 同時刻なら開始が早い方 → それでも同じならタイトル
  return (a: EventInstance, b: EventInstance) => {
    const spanA = dayjs(a.end_at).diff(dayjs(a.start_at), 'minute');
    const spanB = dayjs(b.end_at).diff(dayjs(b.start_at), 'minute');
    if (spanA !== spanB) return spanB - spanA;
    const sa = dayjs(a.start_at).valueOf();
    const sb = dayjs(b.start_at).valueOf();
    if (sa !== sb) return sa - sb;
    return (a.title || '').localeCompare(b.title || '');
  };
}

/** 同一日のイベントを「重ならないように」縦レーンへ割り付ける */
function layoutIntoLanes(rows: EventInstance[], maxBars = MAX_BARS_PER_DAY): EventSegment[] {
  // 各レーンの「最後の終了時刻」を保持して、重ならないレーンへ置く
  const laneEnd: number[] = [];
  const placed: Array<EventSegment & { __lane: number }> = [];

  for (const ev of rows) {
    const s = dayjs(ev.start_at).valueOf();
    const e = dayjs(ev.end_at).valueOf();

    // 入れられる最初のレーンを探す
    let lane = -1;
    for (let i = 0; i < laneEnd.length; i++) {
      if (s >= laneEnd[i]) { lane = i; break; }
    }
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(0);
    }
    laneEnd[lane] = Math.max(laneEnd[lane], e);

    placed.push({
      ...ev,
      spanLeft: false,
      spanRight: false,
      __lane: lane,
    });
  }

  // レーン順に並べ替え、表示上限に切り詰め
  placed.sort((a, b) => a.__lane - b.__lane);
  const limited = placed.slice(0, maxBars);

  // spanLeft/Right はここでは false（実際の表示側でまたぎ判定をする場合は更新）
  return limited.map(({ __lane, ...seg }) => seg);
}

/**
 * 月表示用：各日付に EventSegment[] を割り付け、さらに溢れ件数（more）も返す
 *
 * @param monthDates YYYY-MM-DD[]（CalendarList で表示する 6×7=42 日など）
 * @param filterEventsByEntity 表示対象の Org/Group/ユーザーなどでフィルタ
 * @param sortMode 'span' | 'start'
 * @param refreshKey 依存に含めたい任意キー（外部更新トリガ用）
 */
export function useMonthEvents(
  monthDates: string[],
  filterEventsByEntity: (arr: any[]) => any[],
  sortMode: SortMode,
  refreshKey?: any
) {
  return useMemo(() => {
    const eventsByDate: Record<string, EventSegment[]> = {};
    const overflowByDate: Record<string, number> = {};

    if (!monthDates || monthDates.length === 0) {
      return { eventsByDate, overflowByDate };
    }

    const sorter = makeSorter(sortMode);

    for (const d of monthDates) {
      // 1) DB からその日のイベントを取得
      const raw: EventInstance[] = listInstancesByDate(d) ?? [];

      // 2) 表示対象でフィルタ → 簡易重複排除
      const filtered = filterEventsByEntity(raw);
      const uniq: EventInstance[] = [];
      const seen = new Set<string>();
      for (const ev of filtered) {
        const k = keyOf(ev);
        if (!seen.has(k)) { seen.add(k); uniq.push(ev); }
      }

      // 3) 並べ替え → レーン割付（MAX_BARS_PER_DAY に収める）
      const sorted = uniq.sort(sorter);
      const laid = layoutIntoLanes(sorted, MAX_BARS_PER_DAY);

      eventsByDate[d] = laid;
      overflowByDate[d] = Math.max(0, sorted.length - laid.length);
    }

    return { eventsByDate, overflowByDate };
    // monthDates/filter/sortMode に反応しつつ、refreshKey も変更で再計算
  }, [monthDates, filterEventsByEntity, sortMode, refreshKey]);
}

export default useMonthEvents;
