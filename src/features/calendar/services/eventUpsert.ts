// src/features/calendar/services/eventUpsert.ts
import dayjs from '../../../lib/dayjs';
import type { EventVisibility } from 'src/api/types';

// 既存 DB アダプタ（update が未実装でも安全に動くようにフォールバック）
import {
  createEventLocalAndShard,
  // 将来ここが実装されたら自動で使う
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  updateEventLocalAndShard as _updateMaybe,
} from '../../../store/db';

/** 画面→保存のための入力DTO */
export type UpsertEventInput = {
  // 新規: undefined / 既存: event_id
  event_id?: string;
  calendar_id: string;

  title: string;
  summary?: string;

  // “終日”の場合は "00:00"〜"23:59" をセットした上で allDay=true を渡す
  allDay?: boolean;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  start_time: string; // HH:mm
  end_time: string;   // HH:mm

  tz?: string; // 'local' 等

  // RRULE 文字列（未使用なら空文字）
  rrule?: string;

  // #RRGGBB または #RRGGBBAA（未指定可）
  color?: string;

  tags?: string[];
  visibility?: EventVisibility; // 'Hidden' | 'Normal' | ...
};

export type UpsertEventResult = {
  event_id: string;
  isUpdate: boolean;
};

/** ===== 時刻ユーティリティ ===== */
const HM = /^(\d{1,2}):(\d{1,2})$/;

function normHM(raw: string): string | null {
  const m = String(raw || '').match(HM);
  if (!m) return null;
  const hh = String(Math.max(0, Math.min(23, Number(m[1])))).padStart(2, '0');
  const mm = String(Math.max(0, Math.min(59, Number(m[2])))).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseMin(hm: string): number | null {
  const m = String(hm || '').match(HM);
  if (!m) return null;
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const min = Math.max(0, Math.min(59, Number(m[2])));
  return h * 60 + min;
}

function ensureRange(sDate: string, eDate: string): { sDate: string; eDate: string } {
  const s = dayjs(sDate);
  const e = dayjs(eDate);
  return e.isBefore(s) ? { sDate, eDate: sDate } : { sDate, eDate };
}

function ensureEndNotBeforeStart(st: string, et: string): { st: string; et: string } {
  const sm = parseMin(st) ?? 0;
  const em = parseMin(et) ?? 0;
  if (em < sm) return { st, et: st }; // 最低でも同時刻
  return { st, et };
}

/** ===== 入力バリデーション/正規化 ===== */
export function validateAndNormalize(input: UpsertEventInput): UpsertEventInput {
  const title = (input.title ?? '').trim();
  if (!title) throw new Error('タイトルは必須です');

  const tz = input.tz || 'local';

  let st = input.allDay ? '00:00' : normHM(input.start_time || '');
  let et = input.allDay ? '23:59' : normHM(input.end_time || '');
  if (!st || !et) throw new Error('開始/終了時刻の形式が不正です（HH:mm）');

  const { sDate, eDate } = ensureRange(input.start_date, input.end_date);
  ({ st, et } = ensureEndNotBeforeStart(st, et));

  // 色コードの軽いチェック（未指定はOK）
  const color = input.color?.trim();
  const validColor = color && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : undefined;

  return {
    ...input,
    title,
    tz,
    start_date: sDate,
    end_date: eDate,
    start_time: st,
    end_time: et,
    color: validColor,
    rrule: input.rrule ?? '',
    tags: input.tags ?? [],
    visibility: input.visibility ?? 'Hidden',
  };
}

/** ===== 保存（新規/更新を吸収） =====
 * DB 側に update があれば更新、なければ “とりあえず” 新規を使う（暫定）
 */
export async function upsertEvent(input: UpsertEventInput): Promise<UpsertEventResult> {
  const payload = validateAndNormalize(input);

  const base = {
    calendar_id: payload.calendar_id,
    title: payload.title,
    summary: payload.summary?.trim() ?? '',

    rrule: payload.rrule ?? '',
    start_at: payload.start_time,
    end_at: payload.end_time,
    dtstart: payload.start_date,
    dtend: payload.end_date,
    tz: payload.tz ?? 'local',

    color: payload.color,
    tags: payload.tags ?? [],
    visibility: payload.visibility ?? 'Normal',
  };

  // update が使えるなら更新、なければ create
  const canUpdate = typeof _updateMaybe === 'function' && Boolean(payload.event_id);

  if (canUpdate) {
    const res = await _updateMaybe({
      event_id: payload.event_id!,
      ...base,
    });
    return { event_id: res?.event_id ?? payload.event_id!, isUpdate: true };
  } else {
    const res = await createEventLocalAndShard(base as any);
    return { event_id: res?.event_id ?? '', isUpdate: false };
  }
}
