// ../lib/dayjs.ts
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// 端末のタイムゾーンを既定に（本番でもこれでOK）
dayjs.tz.setDefault(dayjs.tz.guess());

export default dayjs;
