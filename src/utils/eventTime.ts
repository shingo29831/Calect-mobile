// src/utils/eventTime.ts
import dayjs, { Dayjs } from '../lib/dayjs';

/** 新JSONのイベント型（最低限） */
export type CalEvent = {
  event_id: string;
  title?: string;
  summary?: string;
  priority?: 'low'|'normal'|'high';
  recurrence: {
    rrule: string;
    tz: string;           // "Asia/Tokyo"
    start_at: string;     // "HH:mm"
    end_at: string;       // "HH:mm"
    dtstart: string;      // "YYYY-MM-DD"
    until: string | null; // "YYYY-MM-DD" or null
  };
  overrides?: Array<{
    occurrence_date: string; // "YYYY-MM-DD"
    cancelled?: boolean;
    start_at?: string;
    end_at?: string;
    title?: string;
    summary?: string;
    priority?: 'low'|'normal'|'high';
  }>;
};

/** getOccurrenceTimes の戻り値（ユニオン） */
export type OccurrenceTimed = {
  cancelled: false;
  start: Dayjs;
  end: Dayjs;
  title?: string;
  summary?: string;
  priority?: 'low'|'normal'|'high';
};
export type OccurrenceCancelled = { cancelled: true };
export type OccurrenceResult = OccurrenceTimed | OccurrenceCancelled;

/** タイプガード：時刻付きの回か？ */
export function isTimedOccurrence(v: OccurrenceResult): v is OccurrenceTimed {
  return (v as any)?.cancelled === false && !!(v as any)?.start && !!(v as any)?.end;
}

/** YYYY-MM-DD と HH:mm を tz で合成して Dayjs（同一瞬間）を返す */
export function makeZoned(ymd: string, hhmm: string, tz: string): Dayjs {
  return dayjs.tz(`${ymd} ${hhmm}`, 'YYYY-MM-DD HH:mm', tz);
}

/** 1回分（occurrence_date）の start/end を決定（override, tz 対応） */
export function getOccurrenceTimes(ev: CalEvent, occurrenceDate: string): OccurrenceResult {
  const tz = ev.recurrence.tz;
  const baseStart = ev.recurrence.start_at;
  const baseEnd   = ev.recurrence.end_at;

  const ov = ev.overrides?.find(o => o.occurrence_date === occurrenceDate);
  if (ov?.cancelled) return { cancelled: true as const };

  const start_at = ov?.start_at ?? baseStart;
  const end_at   = ov?.end_at   ?? baseEnd;

  const start = makeZoned(occurrenceDate, start_at, tz);
  const end   = makeZoned(occurrenceDate, end_at, tz);

  return {
    cancelled: false as const,
    start,
    end,
    title: ov?.title ?? ev.title,
    summary: ov?.summary ?? ev.summary,
    priority: ov?.priority ?? ev.priority,
  };
}

/** 簡易 RRULE 展開（WEEKLY と DAILY を優先対応）
 *  本格対応は rrule.js 導入推奨
 */
export function expandEventInstances(
  ev: CalEvent,
  rangeStart: Dayjs,
  rangeEnd: Dayjs
): Array<{ event: CalEvent; occurrenceDate: string }> {
  const { rrule, dtstart, until } = ev.recurrence;

  const freq = /FREQ=(DAILY|WEEKLY|MONTHLY)/.exec(rrule)?.[1];
  if (!freq) return [];

  const startDate = dayjs(dtstart, 'YYYY-MM-DD');
  const lastDate = until ? dayjs(until, 'YYYY-MM-DD') : rangeEnd;

  const out: Array<{ event: CalEvent; occurrenceDate: string }> = [];

  if (freq === 'WEEKLY') {
    const bydayMatch = /BYDAY=([A-Z,]+)/.exec(rrule);
    const intervalMatch = /INTERVAL=(\d+)/.exec(rrule);
    const countMatch = /COUNT=(\d+)/.exec(rrule);
    const interval = intervalMatch ? Math.max(1, parseInt(intervalMatch[1], 10)) : 1;
    const countLimit = countMatch ? parseInt(countMatch[1], 10) : Infinity;

    const mapDow: Record<string, number> = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    const bydays = (bydayMatch?.[1] ?? 'MO,TU,WE,TH,FR,SA,SU').split(',').map(s => s.trim());

    // dtstart 週を起点に interval ごとに進める
    let produced = 0;
    let weekAnchor = startDate.startOf('week'); // 日曜起点。必要なら ISO 週に変更
    while (weekAnchor.isBefore(rangeStart.subtract(7, 'day'))) {
      weekAnchor = weekAnchor.add(interval, 'week');
    }

    outer:
    while (weekAnchor.isSameOrBefore(lastDate) && produced < countLimit) {
      for (const code of bydays) {
        const d = weekAnchor.add(mapDow[code], 'day');
        if (d.isBefore(startDate)) continue;
        if (d.isAfter(lastDate)) break outer;
        if (d.isBefore(rangeStart) || d.isAfter(rangeEnd)) continue;

        const occurrenceDate = d.format('YYYY-MM-DD');
        const ov = ev.overrides?.find(o => o.occurrence_date === occurrenceDate);
        if (ov?.cancelled) continue;

        out.push({ event: ev, occurrenceDate });
        produced++;
        if (produced >= countLimit) break outer;
      }
      weekAnchor = weekAnchor.add(interval, 'week');
    }
    return out;
  }

  if (freq === 'DAILY') {
    const intervalMatch = /INTERVAL=(\d+)/.exec(rrule);
    const countMatch = /COUNT=(\d+)/.exec(rrule);
    const interval = intervalMatch ? Math.max(1, parseInt(intervalMatch[1], 10)) : 1;
    const countLimit = countMatch ? parseInt(countMatch[1], 10) : Infinity;

    let produced = 0;
    let d = startDate;

    while (d.isSameOrBefore(rangeEnd) && produced < countLimit) {
      if (!until || d.isSameOrBefore(dayjs(until, 'YYYY-MM-DD'))) {
        if (d.isSameOrAfter(rangeStart) && d.isSameOrBefore(rangeEnd)) {
          const occurrenceDate = d.format('YYYY-MM-DD');
          const ov = ev.overrides?.find(o => o.occurrence_date === occurrenceDate);
          if (!ov?.cancelled) out.push({ event: ev, occurrenceDate });
        }
      }
      d = d.add(interval, 'day');
      produced++;
    }
    return out;
  }

  // TODO: MONTHLY などは必要に応じて強化
  return [];
}
