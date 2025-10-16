// src/store/db.ts
// ===============================================
// 蜊倡ｴ斐Γ繝｢繝ｪDB + 繝ｭ繝ｼ繧ｫ繝ｫ菫晏ｭ假ｼ・napshot / ops.ndjson・・
// - createEventLocal: 霑ｽ蜉逶ｴ蠕後↓髱槫酔譛溘〒繝ｭ繝ｼ繧ｫ繝ｫ菫晏ｭ假ｼ医ち繧ｰ繧よｰｸ邯壼喧・・
// - replaceAllInstances: 蜷梧悄縺ｪ縺ｩ縺ｧ繧､繝ｳ繝｡繝｢繝ｪ繧剃ｸｸ縺斐→蟾ｮ縺玲崛縺・
// - listInstancesByDate: 謖・ｮ壽律縺ｮ繧､繝ｳ繧ｹ繧ｿ繝ｳ繧ｹ繧貞叙蠕暦ｼ医Ο繝ｼ繧ｫ繝ｫ譌･・・
// - getAllTags: 譌｢蟄倥ち繧ｰ荳隕ｧ繧貞叙蠕暦ｼ域ｰｸ邯壼喧・・
// - 螟画峩騾夂衍: subscribeDb / unsubscribeDb / emit
// ===============================================

import dayjs from '../lib/dayjs';
import type { EventInstance, Event, ULID } from '../api/types';
import { startOfLocalDay, endOfLocalDay } from '../utils/time';
import { loadLocalStore, saveLocalStore, appendOps } from './localFile.ts';

// ====== ULID 逕滓・・・vent.event_id 逕ｨ・咾rockford Base32, 髟ｷ縺・6・・======
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulid(now = Date.now()): ULID {
  let ts = now;
  const timeChars = Array(10)
    .fill(0)
    .map(() => {
      const mod = ts % 32;
      ts = Math.floor(ts / 32);
      return ALPHABET[mod];
    })
    .reverse()
    .join('');
  let rand = '';
  for (let i = 0; i < 16; i++) {
    rand += ALPHABET[(Math.random() * 32) | 0];
  }
  return (timeChars + rand) as ULID;
}

// ====== 繝｡繝｢繝ｪ菫晄戟・域里蟄篭I莠呈鋤・壹う繝ｳ繧ｹ繧ｿ繝ｳ繧ｹ驟榊・ & 繧ｿ繧ｰ・・======
let instances: EventInstance[] = [];
let tagsSet = new Set<string>(); // 譌｢蟄倥ち繧ｰ・域ｰｸ邯壼喧・・

// 蛻晄悄繝ｭ繝ｼ繝会ｼ亥ｭ伜惠縺吶ｌ縺ｰ・・
(async () => {
  try {
    const storeAny: any = await loadLocalStore(); // any 縺ｧ諡｡蠑ｵ繝輔ぅ繝ｼ繝ｫ繝・tags)繧定ｨｱ螳ｹ
    instances = Array.isArray(storeAny.instances) ? storeAny.instances : [];
    const tagsSrc: unknown[] =
      Array.isArray(storeAny.tags) ? storeAny.tags :
      Array.isArray(storeAny._tags) ? storeAny._tags : [];
    tagsSet = new Set<string>(tagsSrc.map((s: unknown) => String(s)));
  } catch {
    instances = [];
    tagsSet = new Set();
  }
})();

// ====== 螟画峩騾夂衍 ======
type Listener = () => void;
const listeners = new Set<Listener>();
function emitDbChanged() {
  listeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}
export function subscribeDb(cb: Listener) {
  listeners.add(cb);
}
export function unsubscribeDb(cb: Listener) {
  listeners.delete(cb);
}

// ====== 譌･蛻･繧ｭ繝｣繝・す繝･ ======
const byDateCache = new Map<string, EventInstance[]>();
function clearByDateCache() { byDateCache.clear(); }

// 謖・ｮ壽律縺ｮ繧､繝ｳ繧ｹ繧ｿ繝ｳ繧ｹ蛻玲嫌・医Ο繝ｼ繧ｫ繝ｫ譌･縺ｮ 00:00縲・3:59:59 縺ｫ蟆代＠縺ｧ繧ゅ°縺九ｋ繧ゅ・・・
export function listInstancesByDate(dateISO: string): EventInstance[] {
  const key = dayjs(dateISO).format('YYYY-MM-DD');
  const cached = byDateCache.get(key);
  if (cached) return cached;

  // number(ms) 縺ｫ豁｣隕丞喧縺励※縺九ｉ豈碑ｼ・
  const start = dayjs(startOfLocalDay(dateISO)).valueOf();
  const end   = dayjs(endOfLocalDay(dateISO)).valueOf();

  const out = instances.filter((it) => {
    const a = dayjs(it.start_at).valueOf();
    const b = dayjs(it.end_at).valueOf();
    return !(b < start || a > end);
  });

  byDateCache.set(key, out);
  return out;
}

// ====== CreateEventInput・・I縺九ｉ縺ｮ蜈･蜉帛梛・・======
export type CreateEventInput = {
  // 蠢・・
  title: string;
  start_at: string; // ISO・医Ο繝ｼ繧ｫ繝ｫTZ繧貞性繧繝輔か繝ｼ繝槭ャ繝医〒OK・・
  end_at: string;

  // 莉ｻ諢・
  calendar_id?: string;      // 譌｢螳・ 'CAL_LOCAL_DEFAULT'
  summary?: string | null;   // description縺ｯ蟒・ｭ｢縲Ｔummary縺ｧ邨ｱ荳
  // location / all_day 縺ｯUI蛛ｴ縺ｧ蜃ｦ逅・＠縲∽ｿ晏ｭ倥・縺励↑縺・
  visibility?: Event['visibility'];

  // UI諡｡蠑ｵ・域ｰｸ邯壼喧縺ｯ tags 縺ｮ縺ｿ・・
  color?: string;
  style?: { tags?: string[] };
  // tz 縺ｯ UI 蟆ら畑・・vent 蝙九↓辟｡縺・・縺ｧ菫晏ｭ倥＠縺ｪ縺・ｼ・
  tz?: string;
};

// Event -> 譌｢蟄篭I莠呈鋤縺ｮ蜊倅ｸ繧､繝ｳ繧ｹ繧ｿ繝ｳ繧ｹ縺ｸ螻暮幕
function eventToSingleInstance(ev: Event): EventInstance {
  return {
    instance_id: Date.now(), // 邁｡譏謎ｸ諢擾ｼ亥酔ms螟夐㍾縺ｯ縺斐￥遞・・
    calendar_id: ev.calendar_id,
    event_id: ev.event_id,
    title: ev.title,
    start_at: ev.start_at,
    end_at: ev.end_at,
  };
}

// 譌｢蟄倥ち繧ｰ繧呈峩譁ｰ縺励※豌ｸ邯壼喧
async function upsertTagsToStore(newTags: string[]) {
  if (!newTags?.length) return;
  newTags.forEach((t) => {
    const s = String(t).trim();
    if (s) tagsSet.add(s);
  });
  try {
    const storeAny: any = await loadLocalStore();
    const nextTags = Array.from(tagsSet);
    // 莠呈鋤縺ｮ縺溘ａ荳｡譁ｹ縺ｫ譖ｸ縺擾ｼ亥ｰ・擂繧ｹ繧ｭ繝ｼ繝槭〒豁｣蠑丞喧縺吶ｋ縺ｾ縺ｧ・・
    storeAny.tags = nextTags;
    storeAny._tags = nextTags;
    await saveLocalStore(storeAny);
  } catch {}
}

// ====== 霑ｽ蜉・医Ο繝ｼ繧ｫ繝ｫDB・・ヵ繧｡繧､繝ｫ縺ｸ・・======
export async function createEventLocal(input: CreateEventInput): Promise<EventInstance> {
  const nowIso = new Date().toISOString();

  const ev: Event = {
    event_id: ulid(),
    calendar_id: (input.calendar_id ?? 'CAL_LOCAL_DEFAULT') as ULID,
    title: input.title.trim(),
    summary: input.summary ?? null,
    start_at: input.start_at,
    end_at: input.end_at,
    visibility: input.visibility ?? 'private',
    // tz / color / style 縺ｯ Event 蝙九↓辟｡縺・庄閭ｽ諤ｧ縺後≠繧九◆繧∽ｿ晏ｭ倥＠縺ｪ縺・
  };

  const inst = eventToSingleInstance(ev);

  // 繝｡繝｢繝ｪ縺ｫ蜿肴丐
  instances = [...instances, inst];
  clearByDateCache();
  emitDbChanged();

  // 繧ｿ繧ｰ縺ｮ豌ｸ邯壼喧・・tyle.tags 縺ｮ縺ｿ菫晏ｭ伜ｯｾ雎｡・・
  const incomingTags = input.style?.tags ?? [];
  if (incomingTags.length) upsertTagsToStore(incomingTags);

  // 髱槫酔譛溘〒豌ｸ邯壼喧・医ヵ繝ｫ繧ｹ繝翫ャ繝励す繝ｧ繝・ヨ・句ｷｮ蛻・Ο繧ｰ・・
  (async () => {
    try {
      const storeAny: any = await loadLocalStore();
      if (!Array.isArray(storeAny.instances)) storeAny.instances = [];

      const i = storeAny.instances.findIndex((r: EventInstance) => r.instance_id === inst.instance_id);
      if (i >= 0) storeAny.instances[i] = inst;
      else storeAny.instances.push(inst);

      // 菫晞匱・壼酔譎ゅ↓ tags 繧ょ渚譏
      const currentTags: string[] = Array.isArray(storeAny.tags) ? storeAny.tags : [];
      const merged = new Set<string>(currentTags);
      incomingTags.forEach((t) => { const s = String(t).trim(); if (s) merged.add(s); });
      storeAny.tags = Array.from(merged);
      storeAny._tags = storeAny.tags;

      await saveLocalStore(storeAny);
      await appendOps([{ type: 'upsert', entity: 'instance', row: inst, updated_at: nowIso }]);
    } catch (e) {
      if (__DEV__) console.warn('[createEventLocal] persist failed:', e);
    }
  })();

  return inst;
}

// ====== 蜷梧悄縺ｪ縺ｩ縺ｧ繧､繝ｳ繝｡繝｢繝ｪ繧剃ｸｸ縺斐→蟾ｮ縺玲崛縺医ｋ ======
export function replaceAllInstances(next: EventInstance[]) {
  instances = [...next];
  clearByDateCache();
  emitDbChanged();
}

// ====== 萓ｿ蛻ｩ髢｢謨ｰ・壼・莉ｶ蜿門ｾ励・繧ｯ繝ｪ繧｢・医ョ繝舌ャ繧ｰ逕ｨ・・======
export function getAllInstances(): EventInstance[] {
  return [...instances];
}
export function __clearAllInstancesForTest() {
  instances = [];
  clearByDateCache();
  emitDbChanged();
}

// ====== 譌｢蟄倥ち繧ｰ縺ｮ蜿門ｾ・======
export function getAllTags(): string[] {
  return Array.from(tagsSet).sort((a, b) => a.localeCompare(b));
}
