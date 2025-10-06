// src/store/localEvents.ts
import RNFS from 'react-native-fs';
import dayjs from '../lib/dayjs';
import { toUTCISO } from '../utils/time';
import type { EventInstance } from '../api/types';

const FILE = `${RNFS.DocumentDirectoryPath}/events.json`;

export type NewLocalEventInput = {
  calendar_id: string;
  event_id?: string;           // なければ自動採番
  title: string;
  startLocalISO: string;       // 例: '2025-10-06 10:00'
  endLocalISO: string;         // 同上
  color?: string;              // UI用
};

export async function ensureFile(): Promise<void> {
  const exists = await RNFS.exists(FILE);
  if (!exists) {
    await RNFS.writeFile(FILE, JSON.stringify({ events: [] }, null, 2), 'utf8');
  }
}

export async function loadLocalEvents(): Promise<EventInstance[]> {
  try {
    await ensureFile();
    const txt = await RNFS.readFile(FILE, 'utf8');
    const json = JSON.parse(txt);
    const arr = Array.isArray(json?.events) ? json.events : [];
    return arr as EventInstance[];
  } catch {
    return [];
  }
}

let LOCAL_INSTANCE_SEQ = 10_000_000; // 大きめにして既存と衝突回避

export async function saveLocalEvent(input: NewLocalEventInput): Promise<EventInstance> {
  await ensureFile();
  const now = dayjs();
  const event_id = input.event_id ?? `EVT_LOCAL_${now.format('YYYYMMDD_HHmmss_SSS')}`;
  const instance_id = LOCAL_INSTANCE_SEQ++;
  const startAt = dayjs.tz(input.startLocalISO, 'Asia/Tokyo');
  const endAt   = dayjs.tz(input.endLocalISO,   'Asia/Tokyo');

  const inst: EventInstance = {
    instance_id,
    calendar_id: input.calendar_id,
    event_id,
    title: input.title,
    start_at: toUTCISO(startAt.toDate()),
    end_at: toUTCISO(endAt.toDate()),
    // @ts-ignore UI色（型に無ければUI側で無視）
    color: input.color ?? '#0ea5e9',
  };

  const all = await loadLocalEvents();
  all.push(inst);
  await RNFS.writeFile(FILE, JSON.stringify({ events: all }, null, 2), 'utf8');
  return inst;
}

