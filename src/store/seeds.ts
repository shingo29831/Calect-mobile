// src/store/seeds.ts
import dayjs from '../lib/dayjs';
import type { Dayjs } from 'dayjs';
import { toUTCISO, fromUTC, startOfLocalDay, endOfLocalDay } from '../utils/time';
import type { Calendar, EventInstance } from '../api/types';

const TZ = 'Asia/Tokyo';

/**
 * UIの論理IDとDB風のIDの対応（固定ダミー）
 */
export const LOGICAL = {
  org: { me: 'org_me', fam: 'org_fam', team: 'org_team' },
  grp: {
    me_private: 'grp_me_private',
    fam_all: 'grp_fam_all',
    fam_parents: 'grp_fam_parents',
    team_all: 'grp_team_all',
    team_dev: 'grp_team_dev',
    team_des: 'grp_team_des',
  },
} as const;

/**
 * ダミーの26桁ID（DBの CHAR(26) を想定）
 */
export const IDS = {
  calendars: {
    personal: 'CAL0000000000000000000000',
    me_private: 'CAL0000000000000000000001',
    fam_all: 'CAL0000000000000000000002',
    fam_parents: 'CAL0000000000000000000003',
    team_all: 'CAL0000000000000000000004',
    team_dev: 'CAL0000000000000000000005',
    team_des: 'CAL0000000000000000000006',
  },
  events: {
    personal_demo: 'EVT0000000000000000000100',
    me_private: 'EVT0000000000000000000001',
    fam_all: 'EVT0000000000000000000002',
    fam_parents: 'EVT0000000000000000000003',
    team_all: 'EVT0000000000000000000004',
    team_dev: 'EVT0000000000000000000005',
    team_des: 'EVT0000000000000000000006',
    // スパン検証
    span_team_all: 'EVT0000000000000000001001',
    span_fam_all: 'EVT0000000000000000001002',
    span_me_private: 'EVT0000000000000000001003',
    span_team_des: 'EVT0000000000000000001004',
    // 10/3
    oct3_me_morning:   'EVT0000000000000000002001',
    oct3_me_night:     'EVT0000000000000000002002',
    oct3_fam_overlap:  'EVT0000000000000000002003',
    oct3_fam_parents:  'EVT0000000000000000002004',
    oct3_team_all:     'EVT0000000000000000002005',
    oct3_team_dev:     'EVT0000000000000000002006',
    oct3_team_des_all: 'EVT0000000000000000002007',
    oct3_personal_all: 'EVT0000000000000000002008',
    // 10/2
    oct2_me_morning:   'EVT0000000000000000002101',
    oct2_me_night:     'EVT0000000000000000002102',
    oct2_fam_overlap:  'EVT0000000000000000002103',
    oct2_fam_parents:  'EVT0000000000000000002104',
    oct2_team_all:     'EVT0000000000000000002105',
    oct2_team_dev:     'EVT0000000000000000002106',
    oct2_team_des_all: 'EVT0000000000000000002107',
    oct2_personal_all: 'EVT0000000000000000002108',
    // 10/31
    oct31_personal_all: 'EVT0000000000000000002109',
  },
} as const;

/** UI 論理グループID → カレンダーID */
export const CALENDAR_BY_GROUP_LOGICAL_ID: Record<string, string> = {
  [LOGICAL.grp.me_private]: IDS.calendars.me_private,
  [LOGICAL.grp.fam_all]: IDS.calendars.fam_all,
  [LOGICAL.grp.fam_parents]: IDS.calendars.fam_parents,
  [LOGICAL.grp.team_all]: IDS.calendars.team_all,
  [LOGICAL.grp.team_dev]: IDS.calendars.team_dev,
  [LOGICAL.grp.team_des]: IDS.calendars.team_des,
};

/** 組織まとめ表示用 */
export const ORG_GROUP_CAL_IDS: Record<string, string[]> = {
  [LOGICAL.org.me]: [IDS.calendars.me_private],
  [LOGICAL.org.fam]: [IDS.calendars.fam_all, IDS.calendars.fam_parents],
  [LOGICAL.org.team]: [IDS.calendars.team_all, IDS.calendars.team_dev, IDS.calendars.team_des],
};

/* =========================================================
 * カレンダー定義
 * =======================================================*/
export const CALENDARS: Calendar[] = [
  { calendar_id: IDS.calendars.personal,   name: 'Personal',             color: '#0ea5e9', tz: TZ, visibility: 'private' },
  { calendar_id: IDS.calendars.me_private, name: 'My: Private',          color: '#0ea5e9', tz: TZ, visibility: 'private' },
  { calendar_id: IDS.calendars.fam_all,    name: 'Family: All Members',  color: '#22c55e', tz: TZ, visibility: 'org' },
  { calendar_id: IDS.calendars.fam_parents,name: 'Family: Parents',      color: '#16a34a', tz: TZ, visibility: 'org' },
  { calendar_id: IDS.calendars.team_all,   name: 'Team: All Hands',      color: '#6366f1', tz: TZ, visibility: 'org' },
  { calendar_id: IDS.calendars.team_dev,   name: 'Team: Developers',     color: '#3b82f6', tz: TZ, visibility: 'org' },
  { calendar_id: IDS.calendars.team_des,   name: 'Team: Designers',      color: '#a855f7', tz: TZ, visibility: 'org' },
];

const CAL_COLOR: Record<string, string> = Object.fromEntries(
  CALENDARS.map((c) => [c.calendar_id, c.color || '#60a5fa'])
);

/* =========================================================
 * 日付・時刻ユーティリティ（JST固定で生成）
 * =======================================================*/
type Dateish = Dayjs | string | number | Date;

// JST固定で Dayjs を作る
const djs = (x?: Dateish) => (x == null ? dayjs() : dayjs(x)).tz(TZ);

// JST固定の時刻にそろえる
const at = (d: Dayjs, h = 0, m = 0, s = 0, ms = 0) =>
  d.tz(TZ).hour(h).minute(m).second(s).millisecond(ms);

// UTC保存用インスタンス化
function mkInst(
  instance_id: number,
  calendar_id: string,
  event_id: string,
  title: string,
  startAt: Dayjs,
  endAt: Dayjs
): EventInstance {
  return {
    instance_id,
    calendar_id,
    event_id,
    title,
    start_at: toUTCISO(startAt.tz(TZ).toDate()),
    end_at: toUTCISO(endAt.tz(TZ).toDate()),
    // @ts-ignore UI用の色（型に無ければUI側で無視）
    color: CAL_COLOR[calendar_id],
  };
}

// 今日/今月の基準（JST固定）
const today  = djs().startOf('day');
const month0 = djs().startOf('month');

// ====== “その月の n 日目” を明示指定 ======
const D = (n: number) => month0.date(n); // 1..31

// 今月の日（読み間違い防止のため 2桁にしておく）
const d01 = D(1);
const d02 = D(2);
const d03 = D(3);
const d04 = D(4);
const d10 = D(10);
const d11 = D(11);
const d12 = D(12);
const d15 = D(15);
const d17 = D(17);
const d31 = D(31);

// 便利時刻（JST固定）
const T_00 = (d: Dayjs) => at(d, 0, 0, 0, 0);
const T_09 = (d: Dayjs) => at(d, 9, 0, 0, 0);
const T_10 = (d: Dayjs) => at(d,10, 0, 0, 0);
const T_12 = (d: Dayjs) => at(d,12, 0, 0, 0);
const T_18 = (d: Dayjs) => at(d,18, 0, 0, 0);
const T_21 = (d: Dayjs) => at(d,21, 0, 0, 0);
const T_22 = (d: Dayjs) => at(d,22, 0, 0, 0);
const T_23 = (d: Dayjs) => at(d,23, 0, 0, 0);

/* =========================================================
 * イベントインスタンス（UTC保存）
 * =======================================================*/
export const INSTANCES: EventInstance[] = [
  mkInst(100, IDS.calendars.personal, IDS.events.personal_demo, 'Personal Demo', T_09(today), T_09(today).add(20, 'minute')),

  mkInst(1, IDS.calendars.me_private,  IDS.events.me_private,  'Demo Event', T_09(d10), T_10(d10)),
  mkInst(2, IDS.calendars.fam_all,     IDS.events.fam_all,     'Demo Event', T_10(d10), T_12(d10)),
  mkInst(3, IDS.calendars.fam_parents, IDS.events.fam_parents, 'Demo Event', T_12(d10), T_18(d10)),
  mkInst(4, IDS.calendars.team_all,    IDS.events.team_all,    'Demo Event', T_09(d11), T_10(d11)),
  mkInst(5, IDS.calendars.team_dev,    IDS.events.team_dev,    'Demo Event', T_10(d11), T_12(d11)),
  mkInst(6, IDS.calendars.team_des,    IDS.events.team_des,    'Demo Event', T_12(d11), T_18(d11)),

  // 連結検証
  mkInst(1001, IDS.calendars.team_all, IDS.events.span_team_all, 'Sprint Planning (3d)', T_10(d02), T_18(d04)),
  mkInst(1002, IDS.calendars.fam_all,  IDS.events.span_fam_all,  'Family Trip',          T_21(d15), T_21(d17)),
  mkInst(1003, IDS.calendars.me_private, IDS.events.span_me_private, 'Server Maintenance', T_23(today), T_00(today.add(1, 'day')).add(3, 'hour')),
  mkInst(1004, IDS.calendars.team_des, IDS.events.span_team_des, 'Design Jam',           T_00(d12), T_00(d12).add(2, 'day')),

  // その月の 3 日
  mkInst(2001, IDS.calendars.me_private, IDS.events.oct3_me_morning, 'Morning Focus',     T_09(d03), T_09(d03).add(30, 'minute')),
  mkInst(2002, IDS.calendars.fam_all,    IDS.events.oct3_fam_overlap,'Family Errand',     T_10(d03), T_12(d03)),
  mkInst(2003, IDS.calendars.fam_parents,IDS.events.oct3_fam_parents,'Parents Meeting',   T_10(d03).add(60, 'minute'), T_12(d03).add(60, 'minute')),
  mkInst(2004, IDS.calendars.team_all,   IDS.events.oct3_team_all,   'All Hands Prep',    T_10(d03).add(90, 'minute'), T_12(d03).add(30, 'minute')),
  mkInst(2005, IDS.calendars.team_dev,   IDS.events.oct3_team_dev,   'Dev Sprint Block',  T_12(d03).add(60, 'minute'), T_18(d03).subtract(2, 'hour')),
  mkInst(2006, IDS.calendars.team_des,   IDS.events.oct3_team_des_all,'3Design Day',      T_00(d03), T_00(d03).add(1, 'day')),
  mkInst(2007, IDS.calendars.personal,   IDS.events.oct3_personal_all,'3Personal Day',    T_00(d03), T_00(d03).add(1, 'day')),
  mkInst(2008, IDS.calendars.me_private, IDS.events.oct3_me_night,    'Late-night Maint.',T_23(d03), T_00(d03.add(1, 'day')).add(2, 'hour')),

  // その月の 2 日
  mkInst(2101, IDS.calendars.me_private, IDS.events.oct2_me_morning,  'Morning Review',   T_09(d02), T_09(d02).add(45, 'minute')),
  mkInst(2102, IDS.calendars.fam_all,    IDS.events.oct2_fam_overlap, 'Family Chores',    T_10(d02).add(30, 'minute'), T_12(d02)),
  mkInst(2103, IDS.calendars.fam_parents,IDS.events.oct2_fam_parents, 'Parents Call',     T_10(d02).add(60, 'minute'), T_12(d02).add(60, 'minute')),
  mkInst(2104, IDS.calendars.team_all,   IDS.events.oct2_team_all,    'Town Hall Brief',  T_12(d02).add(120, 'minute'), T_12(d02).add(180, 'minute')),
  mkInst(2105, IDS.calendars.team_dev,   IDS.events.oct2_team_dev,    'Dev Focus Block',  T_12(d02).add(180, 'minute'), T_18(d02)),
  mkInst(2106, IDS.calendars.team_des,   IDS.events.oct2_team_des_all,'2Design Day',      T_00(d02), T_00(d02).add(1, 'day')),
  mkInst(2107, IDS.calendars.personal,   IDS.events.oct2_personal_all,'2Personal Day',    T_00(d02), T_00(d02).add(1, 'day')),
  mkInst(2108, IDS.calendars.me_private, IDS.events.oct2_me_night,    'Late-night Ops',   T_22(d02).add(30, 'minute'), T_00(d02.add(1, 'day')).add(90, 'minute')),
  mkInst(2109, IDS.calendars.personal,   IDS.events.oct31_personal_all,'31personal',      T_22(d31).add(30, 'minute'), T_00(d31.add(1, 'day')).add(90, 'minute')),
];

/* =========================================================
 * Synthetic Load: 前後2年、各週にランダム予定を追加
 * =======================================================*/

// 生成規模（必要ならここを触って調整）
const LOAD = {
  yearsBack: 2,
  yearsForward: 2,
  eventsPerWeekMin: 1,
  eventsPerWeekMax: 3,
  multiDayChance: 0.15,  // 15% は複数日イベント
  allDayChance: 0.08,    // 8% は“終日”風（0:00-24:00）
};

// 再現性のある擬似乱数（固定シード）
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xC0FFEE);
const r = () => rng();
const rInt = (min: number, max: number) => Math.floor(r() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]) => arr[rInt(0, arr.length - 1)];
const chance = (p: number) => r() < p;

// 適当なタイトル候補
const TITLES = [
  'Sync', 'Standup', 'Focus Block', 'Review', '1:1', 'Planning',
  'Check-in', 'Brainstorm', 'Ops', 'Maintenance', 'Design Jam',
  'Errand', 'Family Time', 'Workout', 'Lunch', 'Coffee Chat',
];

// 分単位の候補（終日でない場合）
const DURATION_MIN_CHOICES = [30, 45, 60, 75, 90, 120, 150, 180, 240];

// 一意IDの連番開始（既存最大より十分大きく）
let LOAD_INSTANCE_ID = 1_000_000;
let LOAD_EVENT_SEQ = 1;

// week 範囲を決定（JST固定）
const startWeek = djs().startOf('week').subtract(LOAD.yearsBack * 52, 'week');
const endWeek   = djs().endOf('week').add(LOAD.yearsForward * 52, 'week');

// どのカレンダーに入れるか（全部対象）
const LOAD_CALS = CALENDARS.map(c => c.calendar_id);

// 週ごとに 1〜3 件程度ランダム生成
for (let w = startWeek.clone(); w.isBefore(endWeek); w = w.add(1, 'week')) {
  const n = rInt(LOAD.eventsPerWeekMin, LOAD.eventsPerWeekMax);
  for (let k = 0; k < n; k++) {
    const calId = pick(LOAD_CALS);
    const title = pick(TITLES);

    // ランダム曜日（0=日〜6=土）と開始時刻
    const dayOffset = rInt(0, 6);
    const baseDay = w.add(dayOffset, 'day');

    // 終日 or 複数日 or 通常
    let startAt = baseDay;
    let endAt = baseDay;

    if (chance(LOAD.allDayChance)) {
      // 終日風：0:00〜翌0:00
      startAt = at(baseDay, 0, 0, 0, 0);
      endAt   = at(baseDay.add(1, 'day'), 0, 0, 0, 0);
    } else if (chance(LOAD.multiDayChance)) {
      // 複数日：開始は 9-12 時、終了は +1〜3日 の 18:00
      const startHour = rInt(9, 12);
      const spanDays = rInt(1, 3);
      startAt = at(baseDay, startHour, pick([0, 15, 30, 45]));
      endAt   = at(baseDay.add(spanDays, 'day'), 18, pick([0, 15, 30, 45]));
    } else {
      // 通常：開始 8-20 時、所要 30-240 分
      const startHour = rInt(8, 20);
      const startMin  = pick([0, 10, 15, 20, 30, 40, 45, 50]);
      const durMin    = pick(DURATION_MIN_CHOICES);
      startAt = at(baseDay, startHour, startMin);
      endAt   = startAt.add(durMin, 'minute');
    }

    // イベント/インスタンスID（擬似）
    const evId = `EVT_LOAD_${String(LOAD_EVENT_SEQ++).padStart(6, '0')}`;

    INSTANCES.push(
      mkInst(LOAD_INSTANCE_ID++, calId, evId, title, startAt, endAt)
    );
  }
}

/* =========================================================
 * 既存コード互換の SEED（単一カレンダー + まとめたインスタンス）
 * =======================================================*/
export const SEED: { calendar: Calendar; instances: EventInstance[] } = {
  calendar: CALENDARS[0], // Personal
  instances: INSTANCES,
};

/* =========================================================
 * 新：全カレンダー＋全インスタンス
 * =======================================================*/
export const SEED_ALL: { calendars: Calendar[]; instances: EventInstance[] } = {
  calendars: CALENDARS,
  instances: INSTANCES,
};

/* =========================================================
 * 補助：日付でフィルタ（UIの listInstancesByDate のモック向け）
 *   - 保存はUTC → 端末TZに変換してから重なり判定
 *   - “終了=当日0:00” を含めたいので isSame(dayStart) を許容
 * =======================================================*/
export function listInstancesByDateMock(dateStrISO: string, calendarIds?: string[]): EventInstance[] {
  const dayStart = startOfLocalDay(dateStrISO);
  const dayEnd   = endOfLocalDay(dateStrISO);

  return INSTANCES.filter((i) => {
    const s = fromUTC(i.start_at);
    const e = fromUTC(i.end_at);
    const overlap = s.isBefore(dayEnd) && (e.isAfter(dayStart) || e.isSame(dayStart));
    const inCal = !calendarIds || calendarIds.includes(i.calendar_id);
    return overlap && inCal;
  });
}
