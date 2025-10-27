// src/lib/dayjs.ts
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// 縺薙％縺ｧ繝・ヵ繧ｩ繝ｫ繝・Z繧貞崋螳夲ｼ医い繝励Μ蜈ｨ菴薙〒JST縺ｫ縺励◆縺・↑繧画怏蜉ｹ蛹厄ｼ・
dayjs.tz.setDefault('Asia/Tokyo');

export default dayjs;
