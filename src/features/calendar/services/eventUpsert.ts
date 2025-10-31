// src/features/calendar/services/eventUpsert.ts
import dayjs from '../../../lib/dayjs';
import type { EventVisibility } from 'src/api/types';

// DBアダプタ
import {
  createEventLocalAndShard,
  updateEventLocalAndShard,
  type CreateEventInput,
  type UpdateEventInput,
  // ↓ 追加：db.ts の削除系を直接利用
  deleteEventLocalAndShard,
  deleteEventLocal,
  deleteEventLocalByOccurrence,
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

  // RRULE 文字列（未使用なら空文字 or 'NONE'）
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

  const tz = (input.tz || 'local').trim();

  let st = input.allDay ? '00:00' : normHM(input.start_time || '');
  let et = input.allDay ? '23:59' : normHM(input.end_time || '');
  if (!st || !et) throw new Error('開始/終了時刻の形式が不正です（HH:mm）');

  const { sDate, eDate } = ensureRange(input.start_date, input.end_date);
  ({ st, et } = ensureEndNotBeforeStart(st, et));

  // 色コードの軽いチェック（未指定はOK）
  const color = input.color?.trim();
  const validColor = color && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : undefined;

  const tags = Array.from(
    new Set((input.tags ?? []).map((t) => String(t).trim()).filter(Boolean))
  );

  const visibility = (input.visibility ?? 'Hidden') as EventVisibility;

  return {
    ...input,
    title,
    tz,
    start_date: sDate,
    end_date: eDate,
    start_time: st,
    end_time: et,
    color: validColor,
    rrule: (input.rrule ?? 'NONE').trim(),
    tags,
    visibility, // ← 型は EventVisibility
  };
}

/** ===== 保存（新規/更新を吸収） ===== */
export async function upsertEvent(input: UpsertEventInput): Promise<UpsertEventResult> {
  const payload = validateAndNormalize(input);

  // Create/Update いずれでも使えるベース
  const base: Omit<CreateEventInput, 'title' | 'start_at' | 'end_at' | 'dtstart' | 'dtend'> & {
    title: string;
    start_at: string;
    end_at: string;
    dtstart: string;
    dtend: string;
    visibility?: EventVisibility;
    color?: string;
    tags?: string[];
    rrule?: string;
    calendar_id: string;
    tz?: string;
  } = {
    calendar_id: payload.calendar_id,
    title: payload.title,
    summary: payload.summary?.trim() ?? '',
    rrule: payload.rrule ?? 'NONE',
    start_at: payload.start_time,
    end_at: payload.end_time,
    dtstart: payload.start_date,
    dtend: payload.end_date,
    tz: payload.tz ?? 'local',
    color: payload.color,
    tags: payload.tags ?? [],
    visibility: payload.visibility as EventVisibility, // ★ 型を固定
  };

  const isUpdate = Boolean(payload.event_id);

  if (isUpdate) {
    // UpdateEventInput を明示的に構成（visibility は EventVisibility）
    const updatePayload: UpdateEventInput = {
      event_id: payload.event_id!,
      ...base,
      visibility: (base.visibility ?? 'Hidden') as EventVisibility,
    };

    const res = await updateEventLocalAndShard(updatePayload);
    return { event_id: res?.event_id ?? payload.event_id!, isUpdate: true };
  } else {
    // CreateEventInput を明示的に構成
    const createPayload: CreateEventInput = {
      ...base,
      visibility: (base.visibility ?? 'Hidden') as EventVisibility,
    };

    const res = await createEventLocalAndShard(createPayload);
    return { event_id: res?.event_id ?? '', isUpdate: false };
  }
}

/** ===== 削除（db.ts の実装を直接使用） =====
 *  - デフォルト: shard 連動で物理削除（ローカル + v2 月シャード）
 *  - オプション shard=false でローカルのみ
 */
export async function deleteEvent(
  event_id: string,
  opts?: { shard?: boolean }
): Promise<{ event_id: string; ok: boolean; hard: boolean }> {
  if (!event_id || typeof event_id !== 'string') {
    throw new Error('event_id が不正です');
  }
  const useShard = opts?.shard !== false; // 既定: true

  if (useShard && typeof deleteEventLocalAndShard === 'function') {
    await deleteEventLocalAndShard(event_id);
    return { event_id, ok: true, hard: true };
  }

  if (typeof deleteEventLocal === 'function') {
    await deleteEventLocal(event_id);
    return { event_id, ok: true, hard: true };
  }

  throw new Error('削除APIが利用できません（deleteEventLocalAndShard / deleteEventLocal）');
}

/** ===== 単一発生日だけ削除（必要に応じてUIから使用） ===== */
export async function deleteEventOccurrence(
  event_id: string,
  dtstart: string
): Promise<{ event_id: string; dtstart: string; ok: boolean }> {
  if (!event_id || !dtstart) throw new Error('event_id / dtstart は必須です');
  if (typeof deleteEventLocalByOccurrence !== 'function') {
    throw new Error('deleteEventLocalByOccurrence が未実装です');
  }
  await deleteEventLocalByOccurrence(event_id, dtstart);
  return { event_id, dtstart, ok: true };
}
