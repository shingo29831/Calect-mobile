// src/store/localEvents.ts
import RNFS from 'react-native-fs';
import dayjs from '../lib/dayjs';
import { toUTCISO } from '../utils/time';
import type { EventInstance } from '../api/types';

// 保存先（アプリ専用ドキュメント直下）
export const FILE = `${RNFS.DocumentDirectoryPath}/events.json`;

// === ローカル保存ファイル用の内部型（color を保持） ===
type LocalEventInstance = EventInstance & { color?: string };

type LocalEventFile = {
  version: 1;
  events: LocalEventInstance[];
};

// 新規保存入力
export type NewLocalEventInput = {
  calendar_id: string;
  event_id?: string;           // なければ自動採番
  title: string;
  startLocalISO: string;       // 例: '2025-10-06 10:00'（ローカル時刻）
  endLocalISO: string;         // 同上
  color?: string;              // UI用（任意）
};

// 内部ユーティリティ：原子的書き込み
async function atomicWrite(path: string, data: string) {
  const tmp = `${path}.${Date.now()}.tmp`;
  await RNFS.writeFile(tmp, data, 'utf8');
  await RNFS.moveFile(tmp, path);
}

function emptyFile(): LocalEventFile {
  return { version: 1, events: [] };
}

/** 初期ファイル作成 */
export async function ensureFile(): Promise<void> {
  const exists = await RNFS.exists(FILE);
  if (!exists) {
    await atomicWrite(FILE, JSON.stringify(emptyFile(), null, 2));
  }
}

/** ファイルを LocalEventFile として読み込み（壊れていたら空） */
async function readRawFile(): Promise<LocalEventFile> {
  await ensureFile();
  try {
    const txt = await RNFS.readFile(FILE, 'utf8');
    const json = JSON.parse(txt) as Partial<LocalEventFile>;
    if (!json || typeof json !== 'object' || !Array.isArray(json.events)) {
      return emptyFile();
    }
    const norm: LocalEventInstance[] = [];
    for (const e of json.events as any[]) {
      if (!e) continue;
      // instance_id を number に正規化
      let iid: number | undefined;
      if (typeof e.instance_id === 'number' && Number.isFinite(e.instance_id)) {
        iid = e.instance_id;
      } else if (typeof e.instance_id === 'string' && /^\d+$/.test(e.instance_id)) {
        iid = Number(e.instance_id);
      }
      if (iid === undefined) continue;

      norm.push({
        instance_id: iid,
        calendar_id: String(e.calendar_id ?? ''),
        event_id: String(e.event_id ?? ''),
        title: String(e.title ?? ''),
        start_at: String(e.start_at ?? ''),
        end_at: String(e.end_at ?? ''),
        color: e.color ?? undefined,
      });
    }
    return { version: 1, events: norm };
  } catch {
    return emptyFile();
  }
}

/** LocalEventFile を保存（全置換） */
async function writeRawFile(file: LocalEventFile): Promise<void> {
  await atomicWrite(FILE, JSON.stringify(file, null, 2));
}

/** LocalEventInstance[] を保存（全置換） */
async function saveAll(events: LocalEventInstance[]): Promise<void> {
  await writeRawFile({ version: 1, events });
}

/** 公開API：ファイル→EventInstance[]（color を剥がして返す） */
export async function loadLocalEvents(): Promise<EventInstance[]> {
  const raw = await readRawFile();
  return raw.events.map(({ color, ...rest }) => rest);
}

/** 内部利用：ファイル→LocalEventInstance[]（color を保持） */
async function loadLocalEventRecords(): Promise<LocalEventInstance[]> {
  const raw = await readRawFile();
  return raw.events;
}

/** 単純な連番（既存と衝突しにくい大きめの開始値） */
let LOCAL_INSTANCE_SEQ = 10_000_000;

/** 現在のファイル内の最大 instance_id を見てシーケンスを進める（初回のみ） */
async function ensureSeqFromFile() {
  const list = await loadLocalEventRecords();
  for (const e of list) {
    if (typeof e.instance_id === 'number' && e.instance_id >= LOCAL_INSTANCE_SEQ) {
      LOCAL_INSTANCE_SEQ = e.instance_id + 1;
    }
  }
}

/** 新規追加 */
export async function saveLocalEvent(input: NewLocalEventInput): Promise<EventInstance> {
  await ensureFile();
  await ensureSeqFromFile();

  const now = dayjs();
  const event_id = input.event_id ?? `EVT_LOCAL_${now.format('YYYYMMDD_HHmmss_SSS')}`;
  const instance_id = LOCAL_INSTANCE_SEQ++;

  // 受け取ったローカル時刻（例: 'YYYY-MM-DD HH:mm'）を Asia/Tokyo として解釈
  const startAt = dayjs.tz(input.startLocalISO, 'Asia/Tokyo');
  const endAt   = dayjs.tz(input.endLocalISO,   'Asia/Tokyo');

  const inst: LocalEventInstance = {
    instance_id,
    calendar_id: input.calendar_id,
    event_id,
    title: input.title,
    start_at: toUTCISO(startAt.toDate()),
    end_at:   toUTCISO(endAt.toDate()),
    color: input.color ?? '#0ea5e9',
  };

  const all = await loadLocalEventRecords();
  all.push(inst);
  await saveAll(all);

  // color を剥がして返す
  const { color, ...plain } = inst;
  return plain;
}

/** 複数一括保存（追記） */
export async function saveManyLocalEvents(items: NewLocalEventInput[]): Promise<EventInstance[]> {
  await ensureFile();
  await ensureSeqFromFile();

  const all = await loadLocalEventRecords();
  const savedPlain: EventInstance[] = [];

  for (const item of items) {
    const now = dayjs();
    const event_id = item.event_id ?? `EVT_LOCAL_${now.format('YYYYMMDD_HHmmss_SSS')}`;
    const instance_id = LOCAL_INSTANCE_SEQ++;
    const startAt = dayjs.tz(item.startLocalISO, 'Asia/Tokyo');
    const endAt   = dayjs.tz(item.endLocalISO,   'Asia/Tokyo');

    const inst: LocalEventInstance = {
      instance_id,
      calendar_id: item.calendar_id,
      event_id,
      title: item.title,
      start_at: toUTCISO(startAt.toDate()),
      end_at:   toUTCISO(endAt.toDate()),
      color: item.color ?? '#0ea5e9',
    };
    all.push(inst);

    const { color, ...plain } = inst;
    savedPlain.push(plain);
  }

  await saveAll(all);
  return savedPlain;
}

/** 更新（存在しない場合は何もしない） */
export async function updateLocalEvent(
  instance_id: number,
  patch: Partial<Pick<LocalEventInstance, 'title' | 'start_at' | 'end_at' | 'color'>>
): Promise<boolean> {
  const all = await loadLocalEventRecords();
  const idx = all.findIndex(e => e.instance_id === instance_id);
  if (idx < 0) return false;
  all[idx] = { ...all[idx], ...patch };
  await saveAll(all);
  return true;
}

/** 削除 */
export async function deleteLocalEvent(instance_id: number): Promise<boolean> {
  const all = await loadLocalEventRecords();
  const next = all.filter(e => e.instance_id !== instance_id);
  if (next.length === all.length) return false;
  await saveAll(next);
  return true;
}

/** 期間で抽出（UTC ISO 同士を比較）— EventInstance[] を返す */
export async function queryLocalEventsByRange(rangeStartISO: string, rangeEndISO: string): Promise<EventInstance[]> {
  const all = await loadLocalEventRecords();
  const s = Date.parse(rangeStartISO);
  const e = Date.parse(rangeEndISO);
  return all
    .filter(ev => {
      const a = Date.parse(ev.start_at);
      const b = Date.parse(ev.end_at);
      return !(b <= s || e <= a); // 交差あり
    })
    .map(({ color, ...plain }) => plain);
}

/** すべてクリア（テスト用） */
export async function clearLocalEvents(): Promise<void> {
  await saveAll([]);
}

/**
 * テストデータ投入（空のときだけ投入）
 * @param calId デフォルトのカレンダーID（指定がなければ 'CAL_LOCAL_DEFAULT'）
 */
export async function seedLocalEventsIfEmpty(calId?: string): Promise<void> {
  await ensureFile();
  const list = await loadLocalEventRecords();
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
