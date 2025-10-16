// src/screens/calendar/hooks/useMonthEvents.ts
import { useMemo } from 'react';
import dayjs from '../../../lib/dayjs';
import type { EventInstance } from '../../../api/types';
import { listInstancesByDate } from '../../../store/db';
import { MAX_BARS_PER_DAY } from '../../CalendarParts';

type SortMode = 'span' | 'start';

/** DayCell に渡す最小セグメント型（DayCell 側の期待に合わせる） */
export type EventSegment = EventInstance & {
  spanLeft: boolean;
  spanRight: boolean;
};

/** 重複判定用キー（タイトル+時刻+カレンダ） */
const keyOf = (ev: EventInstance) =>
  `${String(ev.calendar_id ?? '')}|${String(ev.title ?? '')}|${String(ev.start_at ?? '')}|${String(ev.end_at ?? '')}`;

/** 同一日内のソート関数 */
function makeSorter(sortMode: SortMode) {
  if (sortMode === 'start') {
    return (a: EventInstance, b: EventInstance) =>
      dayjs(a.start_at).valueOf() - dayjs(b.start_at).valueOf() ||
      (a.title || '').localeCompare(b.title || '');
  }
  // 'span'：長いもの優先 → 同時刻なら開始時刻→タイトル
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

/** 縦方向のレーンに詰める（単純な貪欲法） */
function layoutIntoLanes(rows: EventInstance[], maxBars = MAX_BARS_PER_DAY): EventSegment[] {
  // レーンごとに最後に置いたイベントの終了時刻（ms）
  const laneEnd: number[] = [];
  const placed: Array<EventSegment & { __lane: number }> = [];

  for (const ev of rows) {
    const s = dayjs(ev.start_at).valueOf();
    const e = dayjs(ev.end_at).valueOf();

    // 既存レーンに置けるかチェック
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

  // レーン順→最大数まで切り出し
  placed.sort((a, b) => a.__lane - b.__lane);
  const limited = placed.slice(0, maxBars);
  // ダミーの spanLeft/Right は false のまま（複数日にまたがるバーを中央で切らない前提）
  return limited.map(({ __lane, ...seg }) => seg);
}

/**
 * 月カレンダー用：日付配列に対して、日別 EventSegment[] と overflow 件数を返す
 *
 * @param monthDates YYYY-MM-DD[]（CalendarList が表示する月の全日）
 * @param filterEventsByEntity 絞り込み（選択中のOrg/Groupなど）
 * @param sortMode 'span'（長い順）か 'start'（開始時刻順）
 * @param refreshKey 変更すると再計算を強制（イベント作成直後の反映用・任意）
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
      // 1) DB から該当日のインスタンスを同期取得
      const raw: EventInstance[] = listInstancesByDate(d) ?? [];

      // 2) エンティティで絞り込み → 重複除去
      const filtered = filterEventsByEntity(raw);
      const uniq: EventInstance[] = [];
      const seen = new Set<string>();
      for (const ev of filtered) {
        const k = keyOf(ev);
        if (!seen.has(k)) { seen.add(k); uniq.push(ev); }
      }

      // 3) ソート → レーン詰め（MAX_BARS_PER_DAY まで表示）
      const sorted = uniq.sort(sorter);
      const laid = layoutIntoLanes(sorted, MAX_BARS_PER_DAY);

      eventsByDate[d] = laid;
      overflowByDate[d] = Math.max(0, sorted.length - laid.length);
    }

    return { eventsByDate, overflowByDate };
    // monthDates/filter/sortMode に加えて refreshKey を依存に含めるのがミソ
  }, [monthDates, filterEventsByEntity, sortMode, refreshKey]);
}

export default useMonthEvents;
