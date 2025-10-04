// src/utils/time.ts
import dayjs from '../lib/dayjs';
import type { Dayjs } from 'dayjs';

// 受け取り型
type Input = string | number | Date | Dayjs;

/** UTC入力（Z/+00:00 等）を端末TZへ変換 */
export const fromUTC = (ts: Input): Dayjs => {
  if (dayjs.isDayjs(ts)) return ts.tz();      // 既に Dayjs の場合も既定TZ(端末)へ
  return dayjs.utc(ts).tz();
};

/** 端末ローカル入力（オフセット無し文字列など）を端末TZで解釈 */
export const fromLocal = (ts: Input): Dayjs =>
  dayjs.isDayjs(ts) ? ts : dayjs(ts);

/** “日付だけ”は端末TZの 00:00 として解釈 */
export const fromLocalDate = (d: string): Dayjs => dayjs(`${d}T00:00:00`);

/** 端末TZのその日の開始/終了 */
export const startOfLocalDay = (d: string | Date | Dayjs): Dayjs =>
  (dayjs.isDayjs(d) ? d : dayjs(d)).startOf('day');

export const endOfLocalDay = (d: string | Date | Dayjs): Dayjs =>
  (dayjs.isDayjs(d) ? d : dayjs(d)).endOf('day');

/** 保存用：何を渡されても UTC ISO（Z付き）へ正規化 —— オーバーロードで Dayjs も明示対応 */
export function toUTCISO(ts: Dayjs): string;
export function toUTCISO(ts: string | number | Date): string;
export function toUTCISO(ts: Input): string {
  const d = dayjs.isDayjs(ts) ? ts : dayjs(ts);
  return d.utc().toISOString();
}
