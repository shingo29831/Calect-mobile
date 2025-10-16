// src/utils/time.ts
import dayjs from '../lib/dayjs';
import type { Dayjs } from 'dayjs';

// 蜿励￠蜿悶ｊ蝙・
type Input = string | number | Date | Dayjs;

/** UTC蜈･蜉幢ｼ・/+00:00 遲会ｼ峨ｒ遶ｯ譛ｫTZ縺ｸ螟画鋤 */
export const fromUTC = (ts: Input): Dayjs => {
  if (dayjs.isDayjs(ts)) return ts.tz();      // 譌｢縺ｫ Dayjs 縺ｮ蝣ｴ蜷医ｂ譌｢螳啜Z(遶ｯ譛ｫ)縺ｸ
  return dayjs.utc(ts).tz();
};

/** 遶ｯ譛ｫ繝ｭ繝ｼ繧ｫ繝ｫ蜈･蜉幢ｼ医が繝輔そ繝・ヨ辟｡縺玲枚蟄怜・縺ｪ縺ｩ・峨ｒ遶ｯ譛ｫTZ縺ｧ隗｣驥・*/
export const fromLocal = (ts: Input): Dayjs =>
  dayjs.isDayjs(ts) ? ts : dayjs(ts);

/** 窶懈律莉倥□縺鯛昴・遶ｯ譛ｫTZ縺ｮ 00:00 縺ｨ縺励※隗｣驥・*/
export const fromLocalDate = (d: string): Dayjs => dayjs(`${d}T00:00:00`);

/** 遶ｯ譛ｫTZ縺ｮ縺昴・譌･縺ｮ髢句ｧ・邨ゆｺ・*/
export const startOfLocalDay = (d: string | Date | Dayjs): Dayjs =>
  (dayjs.isDayjs(d) ? d : dayjs(d)).startOf('day');

export const endOfLocalDay = (d: string | Date | Dayjs): Dayjs =>
  (dayjs.isDayjs(d) ? d : dayjs(d)).endOf('day');

/** 菫晏ｭ倡畑・壻ｽ輔ｒ貂｡縺輔ｌ縺ｦ繧・UTC ISO・・莉倥″・峨∈豁｣隕丞喧 窶披・繧ｪ繝ｼ繝舌・繝ｭ繝ｼ繝峨〒 Dayjs 繧よ・遉ｺ蟇ｾ蠢・*/
export function toUTCISO(ts: Dayjs): string;
export function toUTCISO(ts: string | number | Date): string;
export function toUTCISO(ts: Input): string {
  const d = dayjs.isDayjs(ts) ? ts : dayjs(ts);
  return d.utc().toISOString();
}
