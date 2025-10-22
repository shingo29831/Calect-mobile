// src/features/calendar/hooks/useMonthEvents.ts
// -----------------------------------------------------------------------------
// 統一 & 修復版（2025-10-22）
// - 壊れたスプレッド表記や謎ドットを全面解消
// - レーン割付の安定化 & 件数オーバー時の more 件数算出
// - default export は使わない（誤 import を防ぐ）
// - 依存の import パスはあなたの構成に合わせて修正してください
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';

// ▼ あなたの構成に合わせてパスを調整してください
//   例1: import dayjs from '../../../lib/dayjs';
//   例2: import dayjs from '../../lib/dayjs';
import dayjs from '../../../lib/dayjs';

// 例: サーバーからの“全エンティティ文書”ローダ
//   なければあなたの DB/リポジトリ読み出しに差し替えてください。
import { loadServerDoc } from '../../../store/serverDoc';

// 例: 繰り返しイベントの展開/出現時刻の計算
//   無い場合は monthDates 1日単位で自前展開するロジックに差し替えてください。
import {
  expandEventInstances,
  getOccurrenceTimes,
  isTimedOccurrence,
} from '../../../utils/eventTime';

// 例: 1日あたりの最大表示バー本数（DayCell 側と合わせる）
import { MAX_BARS_PER_DAY } from '../components/CalendarParts';

/** 表示に必要な最小プロパティだけに絞ったインスタンス */
export type EventInstance = {
  instance_id: string;         // 発生回でユニーク
  event_id: string;
  calendar_id?: string | null;
  title: string;               // DayCell 側が文字列前提のため必須
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

/** 並び順のモード */
export type SortMode = 'span' | 'start';

/** 安定した instance_id を作る（event_id + date + start/end ISO を結合） */
function makeInstanceId(
  event_id: string,
  occurrenceDate: string,
  startISO: string,
  endISO: string
) {
  return `${event_id}:${occurrenceDate}:${startISO}:${endISO}`;
}

/** 「同一」とみなすための簡易キー（暫定ユニーク用） */
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
      spanLeft: false,    // 月グリッド内の左右跨ぎは描画側で制御する前提
      spanRight: false,   // （ここでは false 固定）
      __lane: lane,
    });
  }

  placed.sort((a, b) => a.__lane - b.__lane);
  const limited = placed.slice(0, maxBars);
  return limited.map(({ __lane, ...seg }) => seg);
}

/** フック本体：月表示用に日付→EventSegment[] と more 件数を作る */
export function useMonthEvents(
  monthDates: string[],                               // 'YYYY-MM-DD' の配列（グリッドで表示している全日）
  filterEventsByEntity: (arr: EventInstance[]) => EventInstance[], // 所属/タグ等のフィルタ関数
  sortMode: SortMode,                                 // 'span' | 'start'
  refreshKey?: any                                    // 参照データ刷新のトリガ
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

      // 1) データの読み出し
      //    - ここでは serverDoc の events を例示
      //    - ローカルDB利用なら差し替えてください
      const doc = await loadServerDoc();
      const all = Object.values((doc as any)?.entities?.events ?? {});

      // 先にキーを作っておく
      for (const d of monthDates) tmpEventsByDate[d] = [];

      // 2) 各イベント → 指定範囲に展開 → 各日のインスタンス化
      for (const ev of all as any[]) {
        const occs = expandEventInstances(ev as any, rangeStart, rangeEnd);
        for (const { occurrenceDate } of occs) {
          if (!tmpEventsByDate[occurrenceDate]) continue; // 範囲外は無視

          const times = getOccurrenceTimes(ev as any, occurrenceDate);
          if (!isTimedOccurrence(times)) continue; // キャンセル回などは除外

          const startISO = times.start.toISOString();
          const endISO = times.end.toISOString();
          const titleString = (times.title ?? (ev as any).title ?? '') as string;

          const inst: EventInstance = {
            instance_id: makeInstanceId((ev as any).event_id, occurrenceDate, startISO, endISO),
            event_id: (ev as any).event_id,
            calendar_id: (ev as any).calendar_links?.[0]?.calendar_id ?? null,
            title: titleString,
            summary: (times.summary ?? (ev as any).summary) as string | undefined,
            color: (ev as any).color,
            priority: (times.priority ?? (ev as any).priority) as any,
            start_at: startISO,
            end_at: endISO,
          };

          tmpEventsByDate[occurrenceDate].push(inst);
        }
      }

      // 3) 各日でフィルタ・重複排除・並び替え・レーン割付
      const sorter = makeSorter(sortMode);
      const finalized: Record<string, EventSegment[]> = {};
      const overflows: Record<string, number> = {};

      for (const d of monthDates) {
        const raw = tmpEventsByDate[d] ?? [];
        const filtered = filterEventsByEntity(raw);

        // 簡易ユニーク（同一キー重複排除）
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
  }, [
    monthDates,
    filterEventsByEntity,
    sortMode,
    refreshKey,
    rangeStart.valueOf(),
    rangeEnd.valueOf(),
  ]);

  return { eventsByDate, overflowByDate };
}

// ★ default export は使いません（名前付きのみ）
