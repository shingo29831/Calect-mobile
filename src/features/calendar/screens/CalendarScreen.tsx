// src/features/calendar/hooks/useMonthEvents.ts
import { useEffect, useMemo, useState } from 'react';
import dayjs from '../../../lib/dayjs';
import { loadServerDoc } from '../../../store/serverDoc';
import { expandEventInstances, getOccurrenceTimes, isTimedOccurrence } from '../../../utils/eventTime';
import { MAX_BARS_PER_DAY } from '../components/CalendarParts';

/** 表示に必要な最小プロパティだけに絞ったインスタンス */
type EventInstance = {
  instance_id: string;         // 発生回でユニーク
  event_id: string;
  calendar_id?: string | null;
  title: string;               // 必須（CalendarPartsに合わせる）
  summary?: string;
  color?: string;
  priority?: 'low' | 'normal' | 'high';
  start_at: string;            // ISO8601（tz含む）
  end_at: string;              // ISO8601（tz含む）
};

/** DayCell で使うイベント片（横バー1本分） */
export type EventSegment = EventInstance & {
  spanLeft: boolean;
  spanRight: boolean;
};

type SortMode = 'span' | 'start';

/** 安定した instance_id を作る（event_id + date + start/end ISO を結合） */
function makeInstanceId(
  event_id: string,
  occurrenceDate: string,
  startISO: string,
  endISO: string
) {
  return `${event_id}:${occurrenceDate}:${startISO}:${endISO}`;
}

/** 「同一」とみなすための簡易キー（暫定） */
const keyOf = (ev: EventInstance) =>
  `${String(ev.calendar_id ?? '')}|${String(ev.title)}|${String(ev.start_at)}|${String(ev.end_at)}`;

/** 並び順（開始時刻 or 所要時間の長い順） */
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

  placed.sort((a, b) => a.__lane - b.__lane);
  const limited = placed.slice(0, maxBars);
  return limited.map(({ __lane, ...seg }) => seg);
}

/** 月表示用：各日付に EventSegment[] を割り付け、さらに溢れ件数（more）も返す */
export function useMonthEvents(
  monthDates: string[],
  filterEventsByEntity: (arr: any[]) => any[],
  sortMode: SortMode,
  refreshKey?: any
) {
  const [eventsByDate, setEventsByDate] = useState<Record<string, EventSegment[]>>({});
  const [overflowByDate, setOverflowByDate] = useState<Record<string, number>>({});

  // 描画対象月の範囲
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (!monthDates || monthDates.length === 0) {
      const today = dayjs().startOf('day');
      return { rangeStart: today, rangeEnd: today.endOf('day') };
    }
    const first = dayjs(monthDates[0]).startOf('day');
    const last = dayjs(monthDates[monthDates.length - 1]).endOf('day');
    return { rangeStart: first, rangeEnd: last };
  }, [monthDates]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const tmpEventsByDate: Record<string, EventInstance[]> = {};
      const tmpOverflowByDate: Record<string, number> = {};

      if (!monthDates || monthDates.length === 0) {
        if (!cancelled) {
          setEventsByDate({});
          setOverflowByDate({});
        }
        return;
      }

      const doc = await loadServerDoc();
      const all = Object.values(doc?.entities?.events ?? {});

      for (const d of monthDates) tmpEventsByDate[d] = [];

      // 各イベント → 指定範囲に展開 → 各日のインスタンス化
      for (const ev of all as any[]) {
        const occs = expandEventInstances(ev as any, rangeStart, rangeEnd);
        for (const { occurrenceDate } of occs) {
          if (!tmpEventsByDate[occurrenceDate]) continue; // 範囲外

          const times = getOccurrenceTimes(ev as any, occurrenceDate);
          if (!isTimedOccurrence(times)) continue; // キャンセル回は除外

          const startISO = times.start.toISOString();
          const endISO = times.end.toISOString();
          const titleString = (times.title ?? ev.title ?? '') as string;

          const inst: EventInstance = {
            instance_id: makeInstanceId(ev.event_id, occurrenceDate, startISO, endISO),
            event_id: ev.event_id,
            calendar_id: ev.calendar_links?.[0]?.calendar_id ?? null,
            title: titleString,
            summary: (times.summary ?? ev.summary) as string | undefined,
            color: ev.color,
            priority: (times.priority ?? ev.priority) as any,
            start_at: startISO,
            end_at: endISO,
          };

          tmpEventsByDate[occurrenceDate].push(inst);
        }
      }

      // 各日でフィルタ・重複排除・並び替え・レーン割付
      const sorter = makeSorter(sortMode);
      const finalized: Record<string, EventSegment[]> = {};
      const overflows: Record<string, number> = {};

      for (const d of monthDates) {
        const raw = tmpEventsByDate[d] ?? [];
        const filtered = filterEventsByEntity(raw);

        // 簡易ユニーク
        const uniq: EventInstance[] = [];
        const seen = new Set<string>();
        for (const ev of filtered) {
          const k = keyOf(ev as EventInstance);
          if (!seen.has(k)) { seen.add(k); uniq.push(ev as EventInstance); }
        }

        const sorted = uniq.sort(sorter);
        const laid = layoutIntoLanes(sorted, MAX_BARS_PER_DAY);

        finalized[d] = laid;
        overflows[d] = Math.max(0, sorted.length - laid.length);
      }

      if (!cancelled) {
        setEventsByDate(finalized);
        setOverflowByDate(overflows);
      }
    })();

    return () => { cancelled = true; };
  }, [monthDates, filterEventsByEntity, sortMode, refreshKey, rangeStart.valueOf(), rangeEnd.valueOf()]);

  return { eventsByDate, overflowByDate };
}

// ★ default export は使わない（名前付きだけ）
