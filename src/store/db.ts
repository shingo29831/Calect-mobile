// src/store/db.ts
import dayjs from '../lib/dayjs';
import type { Event, EventInstance, ULID } from '../api/types';
import { SEED } from './seeds';
import { fromUTC, startOfLocalDay, endOfLocalDay, toUTCISO } from '../utils/time';

// --- 依存なしの簡易 26 桁 Base32 ID ジェネレーター（ULID風の見た目） ---
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function makeId(len = 26): ULID {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out as ULID;
}

// メモリ上のインスタンス（UTC保存）
let instances: EventInstance[] = [...SEED.instances];

/* =========================================================
 * by-date キャッシュ
 *   - キー: JSON.stringify({ d, calIds })
 *   - 値: その日の EventInstance[]
 * =======================================================*/
const _byDateCache = new Map<string, EventInstance[]>();
const _ck = (d: string, calendarIds?: string[]) =>
  JSON.stringify({ d, calIds: calendarIds?.slice().sort() ?? null });

export function clearByDateCache() {
  _byDateCache.clear();
}

/* =========================================================
 * 既存API：1日分（内部では範囲検索を使用）
 * =======================================================*/
export function listInstancesByDate(dateISO: string, calendarIds?: string[]): EventInstance[] {
  const dayStart = startOfLocalDay(dateISO); // dayjs(ローカルTZ)
  const dayEnd   = endOfLocalDay(dateISO);   // dayjs(ローカルTZ)
  const rows = listInstancesInRange(dayStart.toISOString(), dayEnd.toISOString());
  if (calendarIds?.length) {
    const set = new Set(calendarIds);
    return rows.filter(r => set.has(r.calendar_id));
  }
  return rows;
}

/* =========================================================
 * 既存API：範囲検索（ローカルTZ基準で重なり判定）
 *   条件: s < rangeEnd && (e > rangeStart || e == rangeStart)
 * =======================================================*/
export function listInstancesInRange(startISO: string, endISO: string): EventInstance[] {
  const rangeStart = dayjs(startISO);
  const rangeEnd   = dayjs(endISO);

  return instances.filter((i) => {
    const s = fromUTC(i.start_at); // UTC → 端末TZ
    const e = fromUTC(i.end_at);
    return s.isBefore(rangeEnd) && (e.isAfter(rangeStart) || e.isSame(rangeStart));
  });
}

/* =========================================================
 * 新API：複数日を by-date 参照（キャッシュ有り）で一括取得
 *   - UIの useMonthEvents からの “参照” 用
 * =======================================================*/
export function listInstancesByDates(
  dates: string[],
  calendarIds?: string[]
): Record<string, EventInstance[]> {
  const out: Record<string, EventInstance[]> = {};
  const useFilter = !!(calendarIds && calendarIds.length);
  const calSet = useFilter ? new Set(calendarIds) : null;

  for (const d of dates) {
    const key = _ck(d, useFilter ? calendarIds : undefined);
    let rows = _byDateCache.get(key);

    if (!rows) {
      // 1日分を通常APIで算出（start/end 境界は内部で考慮）
      rows = listInstancesByDate(d, useFilter ? calendarIds : undefined) ?? [];
      _byDateCache.set(key, rows);
    }

    // 追加のフィルタがあればここで（キーに calIds を入れているので通常不要）
    out[d] = useFilter ? rows.filter(r => calSet!.has(r.calendar_id)) : rows;
  }

  return out;
}

/* =========================================================
 * 既存API：ローカル作成（保存はUTC化）
 *   - 追加後に by-date キャッシュをクリアして整合性を保つ
 * =======================================================*/
export function createEventLocal(input: {
  title: string;
  start_at: string; // ローカルISO
  end_at: string;   // ローカルISO
  calendar_id?: ULID;
}): Event {
  const ev: Event = {
    event_id: makeId(),
    calendar_id: input.calendar_id || SEED.calendar.calendar_id,
    title: input.title || 'Untitled',
    description: null,
    is_all_day: false,
    tz: 'Asia/Tokyo',
    start_at: toUTCISO(input.start_at), // UTC保存
    end_at:   toUTCISO(input.end_at),   // UTC保存
    visibility: 'inherit',
  };

  // 表示用のインスタンスも即時追加（UTCのまま保存）
  const inst: EventInstance = {
    instance_id: Date.now(),
    calendar_id: ev.calendar_id,
    event_id: ev.event_id,
    title: ev.title,
    start_at: ev.start_at,
    end_at: ev.end_at,
  };
  instances.push(inst);

  // 追加したのでキャッシュ破棄（安全側）
  clearByDateCache();

  return ev;
}

/* 便利：テスト時にリセットしたい場合は下を使う（必要なら export に変更）
function _resetInstances(next: EventInstance[]) {
  instances = [...next];
  clearByDateCache();
}
*/
