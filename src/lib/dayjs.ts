// src/lib/dayjs.ts
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';

// 必要なプラグインを有効化
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

// 既定のタイムゾーン（必要に応じて profile.default_tz を上書き）
dayjs.tz.setDefault('Asia/Tokyo');

export default dayjs;
export type { Dayjs } from 'dayjs';
