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

/**
 * 指定したローカル日付（YYYY-MM-DD）の1日に“少しでも重なる”インスタンス。
 * （既存互換API。内部では listInstancesInRange を使用）
 */
export function listInstancesByDate(dateISO: string): EventInstance[] {
  const dayStart = startOfLocalDay(dateISO); // dayjs(ローカルTZ)
  const dayEnd   = endOfLocalDay(dateISO);   // dayjs(ローカルTZ)
  return listInstancesInRange(dayStart.toISOString(), dayEnd.toISOString());
}

/**
 * 指定ローカル時刻範囲に“少しでも重なる”インスタンスを一括取得。
 * startISO / endISO は ISO 文字列（ローカル基準の文字列でOK）
 *
 * 比較はローカルTZで統一：
 *  - 範囲:  dayjs(startISO) / dayjs(endISO)  …ローカル扱い
 *  - 予定:  fromUTC(instance.start_at/end_at) …UTC保存→ローカルへ正規化
 */
export function listInstancesInRange(startISO: string, endISO: string): EventInstance[] {
  const rangeStart = dayjs(startISO);
  const rangeEnd   = dayjs(endISO);

  return instances.filter((i) => {
    const s = fromUTC(i.start_at); // UTC → 端末TZ
    const e = fromUTC(i.end_at);
    // 半開区間に合わせて “終了が範囲開始と同一” も含める
    // 条件: s < rangeEnd && (e > rangeStart || e == rangeStart)
    return s.isBefore(rangeEnd) && (e.isAfter(rangeStart) || e.isSame(rangeStart));
  });
}

/**
 * ローカル作成（既存互換）
 * 入力はローカル基準の時刻文字列を想定し、DB保存はUTCに正規化。
 */
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

  return ev;
}

/* 便利：テスト時にリセットしたい場合は下を使う（必要なら export に変更）
function _resetInstances(next: EventInstance[]) {
  instances = [...next];
}
*/
