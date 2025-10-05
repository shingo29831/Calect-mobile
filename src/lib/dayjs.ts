// src/lib/dayjs.ts
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// ここでデフォルトTZを固定（アプリ全体でJSTにしたいなら有効化）
dayjs.tz.setDefault('Asia/Tokyo');

export default dayjs;
