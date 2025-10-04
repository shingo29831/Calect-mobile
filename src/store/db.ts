// src/store/db.ts
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

let instances: EventInstance[] = [...SEED.instances];

export function listInstancesByDate(dateISO: string): EventInstance[] {
  const dayStart = startOfLocalDay(dateISO);
  const dayEnd   = endOfLocalDay(dateISO);

  return instances.filter((i) => {
    const s = fromUTC(i.start_at); // UTC文字列 → 端末TZ
    const e = fromUTC(i.end_at);
    // 半開区間に合わせて “終了がその日の開始と同一” も含める
    return s.isBefore(dayEnd) && (e.isAfter(dayStart) || e.isSame(dayStart));
  });
}


export function createEventLocal(input: { title: string; start_at: string; end_at: string; calendar_id?: ULID }): Event {
  const ev: Event = {
    event_id: makeId(),
    calendar_id: input.calendar_id || SEED.calendar.calendar_id,
    title: input.title || 'Untitled',
    description: null,
    is_all_day: false,
    tz: 'Asia/Tokyo',
    start_at: toUTCISO(input.start_at),
    end_at:   toUTCISO(input.end_at),
    visibility: 'inherit',
  };
  instances.push({
    instance_id: Date.now(),
    calendar_id: ev.calendar_id,
    event_id: ev.event_id,
    title: ev.title,
    start_at: ev.start_at,
    end_at: ev.end_at,
  });
  return ev;
}
