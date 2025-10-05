// src/screens/calendar/hooks/useMonthEvents.ts
import { useMemo } from 'react';
import dayjs from '../../../lib/dayjs';
import type { EventSegment } from '../../CalendarParts';
import { startOfWeek, FIRST_DAY, MAX_BARS_PER_DAY } from '../../CalendarParts';
import { fromUTC } from '../../../utils/time';
import { listInstancesByDates } from '../../../store/db';

type SortMode = 'span' | 'start';

const makeStableKey = (ev: any) => {
  const id = ev.event_id ?? ev.master_event_id ?? ev.series_id ?? ev.parent_id ?? null;
  if (id != null) return `E:${String(id)}`;
  const s = fromUTC(ev.start_at).toISOString();
  const e = fromUTC(ev.end_at).toISOString();
  const t = ev.title ?? '';
  return `T:${s}|${e}|${t}`;
};

export function useMonthEvents(
  monthDates: string[],
  filterEventsByEntity: (arr: any[]) => any[],
  sortMode: SortMode
) {
  return useMemo(() => {
    const empty = {
      eventsByDate: {} as Record<string, EventSegment[]>,
      overflowByDate: {} as Record<string, number>,
      hideRightDividerDays: new Set<string>(),
    };
    if (monthDates.length === 0) return empty;

    // 日境界キャッシュ（ローカルTZ）
    const dayStartCache: Record<string, dayjs.Dayjs> = {};
    const dayEndCache: Record<string, dayjs.Dayjs> = {};
    for (const d of monthDates) {
      const ds = dayjs(d).startOf('day');
      dayStartCache[d] = ds;
      dayEndCache[d] = ds.endOf('day');
    }

    // === 参照：日別インスタンスを一括取得（内部キャッシュあり）
    const byDateMap = listInstancesByDates(monthDates);
    const allRaw: any[] = [];
    for (const d of monthDates) {
      const arr = byDateMap[d] ?? [];
      if (arr.length) allRaw.push(...arr);
    }

    // エンティティでフィルタ
    const allFiltered = filterEventsByEntity(allRaw);

    // 重複除去（安定キー）
    const uniq = new Map<string | number, any>();
    for (const ev of allFiltered) {
      const key = makeStableKey(ev);
      if (!uniq.has(key)) uniq.set(key, ev);
    }
    const all = Array.from(uniq.values());

    // 端末TZでそのイベントが被る日を算出
    const coveredDatesFor = (ev: any): string[] => {
      const res: string[] = [];
      const s = fromUTC(ev.start_at);
      const e = fromUTC(ev.end_at);
      for (const d of monthDates) {
        const overlaps = s.isBefore(dayEndCache[d]) && e.isAfter(dayStartCache[d]);
        if (overlaps) res.push(d);
      }
      return res;
    };

    const idxOfDate = monthDates.reduce(
      (acc: Record<string, number>, d: string, i: number) => ((acc[d] = i), acc),
      {} as Record<string, number>
    );

    const keyCmp = (a: any, b: any) => makeStableKey(a).localeCompare(makeStableKey(b));

    // レーン割当の優先順
    const orderForLanes = [...all].sort((a, b) => {
      if (sortMode === 'span') {
        const spanA = coveredDatesFor(a).length;
        const spanB = coveredDatesFor(b).length;
        if (spanB !== spanA) return spanB - spanA;
        const as = fromUTC(a.start_at).valueOf();
        const bs = fromUTC(b.start_at).valueOf();
        if (as !== bs) return as - bs;
        return keyCmp(a, b);
      }
      const acov = coveredDatesFor(a),
        bcov = coveredDatesFor(b);
      const afirst = acov[0],
        bfirst = bcov[0];
      const aIdx = idxOfDate[afirst],
        bIdx = idxOfDate[bfirst];
      if (aIdx !== bIdx) return aIdx - bIdx;
      const aContinues = fromUTC(a.start_at).isBefore(dayStartCache[afirst]) ? 1 : 0;
      const bContinues = fromUTC(b.start_at).isBefore(dayStartCache[bfirst]) ? 1 : 0;
      if (aContinues !== bContinues) return aContinues - bContinues;
      const as = fromUTC(a.start_at).valueOf();
      const bs = fromUTC(b.start_at).valueOf();
      if (as !== bs) return as - bs;
      return keyCmp(a, b);
    });

    // レーン割当
    const laneDates: Array<Record<string, true>> = [];
    const laneOf: Record<string | number, number> = {};
    for (const ev of orderForLanes) {
      const key = makeStableKey(ev);
      const cov = coveredDatesFor(ev);
      let lane = 0;
      while (true) {
        if (!laneDates[lane]) laneDates[lane] = {};
        const used = laneDates[lane];
        if (cov.every((d) => !used[d])) {
          cov.forEach((d) => (used[d] = true));
          laneOf[key] = lane;
          break;
        }
        lane++;
      }
    }

    const result: Record<string, EventSegment[]> = {};
    const overflow: Record<string, number> = {};
    const hideRightDividerDays = new Set<string>();

    for (const d of monthDates) {
      // その日に“少しでも重なる”イベント（DB呼び出しはしない）
      const sDay = dayStartCache[d];
      const eDay = dayEndCache[d];

      const list = all.filter((ev) => {
        const s = fromUTC(ev.start_at);
        const e = fromUTC(ev.end_at);
        return s.isBefore(eDay) && e.isAfter(sDay);
      });

      const byLane: Record<number, any> = {};
      for (const ev of list) {
        const s = fromUTC(ev.start_at);
        const e = fromUTC(ev.end_at);
        const key = makeStableKey(ev);
        const lane = laneOf[key] ?? 9999;
        if (lane !== 9999) {
          // 週の最初にタイトル表示
          const weekStart = startOfWeek(dayjs(d), FIRST_DAY);
          let firstInWeek = d;
          for (let i = 0; i < 7; i++) {
            const dd = weekStart.add(i, 'day').format('YYYY-MM-DD');
            const overlaps = s.isBefore(dayEndCache[dd]) && e.isAfter(dayStartCache[dd]);
            if (overlaps) {
              firstInWeek = dd;
              break;
            }
          }
          const showTitle = d === firstInWeek;

          if (!byLane[lane]) {
            const spanLen = coveredDatesFor(ev).length;
            byLane[lane] = {
              instance_id: ev.instance_id ?? key,
              title: ev.title ?? '(untitled)',
              color: ev.color ?? null,
              spanLeft: s.isBefore(sDay),
              spanRight: e.isAfter(eDay),
              showTitle,
              __lane: lane,
              __startMs: fromUTC(ev.start_at).valueOf(),
              __key: key,
              __startsToday: !s.isBefore(sDay),
              __spanLen: spanLen,
            };
          }
        }
      }

      const laneIndices = Object.keys(byLane).map(Number);
      let slots: EventSegment[] = [];
      let displayedCount = 0;

      if (laneIndices.some((ln) => byLane[ln]?.spanRight)) {
        hideRightDividerDays.add(d);
      }

      if (sortMode === 'start') {
        const segs = laneIndices.sort((a, b) => a - b).map((ln) => byLane[ln]);
        segs.sort((A: any, B: any) => {
          if (A.__startsToday !== B.__startsToday) return A.__startsToday ? -1 : 1;
          if (A.__startMs !== B.__startMs) return A.__startMs - B.__startMs;
          return String(A.__key).localeCompare(String(B.__key));
        });

        const limit = Math.min(MAX_BARS_PER_DAY, segs.length);
        displayedCount = limit;
        for (let i = 0; i < limit; i++) {
          const { __lane, __startMs, __key, __startsToday, __spanLen, ...seg } = segs[i];
          slots.push(seg as EventSegment);
        }
        while (slots.length < Math.min(MAX_BARS_PER_DAY, Math.max(segs.length, 0))) {
          slots.push({
            instance_id: `__spacer-${d}-fill-${slots.length}`,
            title: '',
            spanLeft: false,
            spanRight: false,
            showTitle: false,
            __spacer: true,
          } as any);
        }
      } else {
        const lanesTodaySortedByImportance = laneIndices
          .filter((ln) => !!byLane[ln])
          .sort((a, b) => {
            const A = byLane[a],
              B = byLane[b];
            if (A.__spanLen !== B.__spanLen) return B.__spanLen - A.__spanLen;
            if (A.__startMs !== B.__startMs) return A.__startMs - B.__startMs;
            return String(A.__key).localeCompare(String(B.__key));
          });

        const chosen = lanesTodaySortedByImportance.slice(0, MAX_BARS_PER_DAY);
        displayedCount = chosen.length;
        chosen.sort((a, b) => a - b);

        for (const lane of chosen) {
          const { __lane, __startMs, __key, __startsToday, __spanLen, ...seg } = byLane[lane];
          slots.push(seg as EventSegment);
        }
      }

      overflow[d] = Math.max(0, (list?.length ?? 0) - displayedCount);
      result[d] = slots;
    }

    return { eventsByDate: result, overflowByDate: overflow, hideRightDividerDays };
  }, [monthDates, filterEventsByEntity, sortMode]);
}
