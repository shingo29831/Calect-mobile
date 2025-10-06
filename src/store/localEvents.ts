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
  startLocalISO: string;       // 例: '2025-10-06 10:00'（ローカル時刻）
  endLocalISO: string;         // 同上
  color?: string;              // UI用（任意）
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

let LOCAL_INSTANCE_SEQ = 10_000_000; // 既存との衝突を避けるため大きめ

export async function saveLocalEvent(input: NewLocalEventInput): Promise<EventInstance> {
  await ensureFile();
  const now = dayjs();
  const event_id = input.event_id ?? `EVT_LOCAL_${now.format('YYYYMMDD_HHmmss_SSS')}`;
  const instance_id = LOCAL_INSTANCE_SEQ++;

  // 受け取ったローカル時刻（例: 'YYYY-MM-DD HH:mm'）を Asia/Tokyo として解釈
  const startAt = dayjs.tz(input.startLocalISO, 'Asia/Tokyo');
  const endAt   = dayjs.tz(input.endLocalISO,   'Asia/Tokyo');

  const inst: EventInstance = {
    instance_id,
    calendar_id: input.calendar_id,
    event_id,
    title: input.title,
    // toUTCISO は Date も受け取れる実装にしてある（本ファイル下では Date を渡す）
    start_at: toUTCISO(startAt.toDate()),
    end_at:   toUTCISO(endAt.toDate()),
    // @ts-ignore 型に無ければ UI 側で無視
    color: input.color ?? '#0ea5e9',
  };

  const all = await loadLocalEvents();
  all.push(inst);
  await RNFS.writeFile(FILE, JSON.stringify({ events: all }, null, 2), 'utf8');
  return inst;
}

/** 複数一括保存（任意） */
export async function saveManyLocalEvents(items: NewLocalEventInput[]): Promise<EventInstance[]> {
  await ensureFile();
  const all = await loadLocalEvents();
  const saved: EventInstance[] = [];
  for (const item of items) {
    const now = dayjs();
    const event_id = item.event_id ?? `EVT_LOCAL_${now.format('YYYYMMDD_HHmmss_SSS')}`;
    const instance_id = LOCAL_INSTANCE_SEQ++;
    const startAt = dayjs.tz(item.startLocalISO, 'Asia/Tokyo');
    const endAt   = dayjs.tz(item.endLocalISO,   'Asia/Tokyo');

    const inst: EventInstance = {
      instance_id,
      calendar_id: item.calendar_id,
      event_id,
      title: item.title,
      start_at: toUTCISO(startAt.toDate()),
      end_at:   toUTCISO(endAt.toDate()),
      // @ts-ignore
      color: item.color ?? '#0ea5e9',
    };
    all.push(inst);
    saved.push(inst);
  }
  await RNFS.writeFile(FILE, JSON.stringify({ events: all }, null, 2), 'utf8');
  return saved;
}

/** クリア（テスト用 / 任意） */
export async function clearLocalEvents(): Promise<void> {
  await RNFS.writeFile(FILE, JSON.stringify({ events: [] }, null, 2), 'utf8');
}

/**
 * テストデータ投入（空のときだけ投入）
 * @param calId デフォルトのカレンダーID（指定がなければ 'CAL_LOCAL_DEFAULT'）
 */
export async function seedLocalEventsIfEmpty(calId?: string): Promise<void> {
  await ensureFile();
  const list = await loadLocalEvents();
  if (list.length > 0) return;

  const baseCal = calId ?? 'CAL_LOCAL_DEFAULT';
  const today = dayjs().tz('Asia/Tokyo');

  const samples: NewLocalEventInput[] = [
    {
      calendar_id: baseCal,
      title: 'Kick-off',
      startLocalISO: today.hour(10).minute(0).format('YYYY-MM-DD HH:mm'),
      endLocalISO: today.hour(11).minute(0).format('YYYY-MM-DD HH:mm'),
      color: '#111827',
    },
    {
      calendar_id: baseCal,
      title: 'Design Review',
      startLocalISO: today.add(1, 'day').hour(14).minute(0).format('YYYY-MM-DD HH:mm'),
      endLocalISO: today.add(1, 'day').hour(15).minute(0).format('YYYY-MM-DD HH:mm'),
      color: '#0ea5e9',
    },
    {
      calendar_id: baseCal,
      title: 'Team Sync',
      startLocalISO: today.add(2, 'day').hour(9).minute(30).format('YYYY-MM-DD HH:mm'),
      endLocalISO: today.add(2, 'day').hour(10).minute(0).format('YYYY-MM-DD HH:mm'),
      color: '#22c55e',
    },
  ];

  await saveManyLocalEvents(samples);
}

// 必要なら外から FILE パスも参照できるように（デバッグ用）
export { FILE as LOCAL_EVENTS_FILE_PATH };
