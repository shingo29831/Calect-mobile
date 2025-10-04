// src/store/seeds.ts
import dayjs from '../lib/dayjs';
import type { Dayjs } from 'dayjs';
import { toUTCISO, fromUTC, startOfLocalDay, endOfLocalDay } from '../utils/time';
import type { Calendar, EventInstance } from '../api/types';

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
  { calendar_id: IDS.calendars.personal,   name: 'Personal',             color: '#0ea5e9', tz: 'Asia/Tokyo', visibility: 'private' },
  { calendar_id: IDS.calendars.me_private, name: 'My: Private',          color: '#0ea5e9', tz: 'Asia/Tokyo', visibility: 'private' },
  { calendar_id: IDS.calendars.fam_all,    name: 'Family: All Members',  color: '#22c55e', tz: 'Asia/Tokyo', visibility: 'org' },
  { calendar_id: IDS.calendars.fam_parents,name: 'Family: Parents',      color: '#16a34a', tz: 'Asia/Tokyo', visibility: 'org' },
  { calendar_id: IDS.calendars.team_all,   name: 'Team: All Hands',      color: '#6366f1', tz: 'Asia/Tokyo', visibility: 'org' },
  { calendar_id: IDS.calendars.team_dev,   name: 'Team: Developers',     color: '#3b82f6', tz: 'Asia/Tokyo', visibility: 'org' },
  { calendar_id: IDS.calendars.team_des,   name: 'Team: Designers',      color: '#a855f7', tz: 'Asia/Tokyo', visibility: 'org' },
];

const CAL_COLOR: Record<string, string> = Object.fromEntries(
  CALENDARS.map((c) => [c.calendar_id, c.color || '#60a5fa'])
);

/* =========================================================
 * イベントインスタンス生成：
 *  - 引数は Dayjs/string/number/Date を受け付ける
 *  - 必ず Date に正規化してから toUTCISO()（型エラー回避＆挙動安定）
 * =======================================================*/
type Dateish = Dayjs | string | number | Date;

function toDate(x: Dateish): Date {
  // Dayjs なら toDate()、それ以外は dayjs() 経由して Date 化
  return (dayjs.isDayjs(x) ? x : dayjs(x)).toDate();
}

function mkInst(
  instance_id: number,
  calendar_id: string,
  event_id: string,
  title: string,
  startAt: Dateish,
  endAt: Dateish,
): EventInstance {
  return {
    instance_id,
    calendar_id,
    event_id,
    title,
    start_at: toUTCISO(toDate(startAt)),
    end_at: toUTCISO(toDate(endAt)),
    // @ts-ignore UI用の色（型に無ければUI側で無視）
    color: CAL_COLOR[calendar_id],
  };
}

// 今日/今月の基準（端末TZ）
const now = dayjs();
const today = now.startOf('day');
const month0 = now.startOf('month');

// 今月内の日付（端末TZ）
const d2  = month0.add(2, 'day');
const d3  = month0.add(3, 'day');
const d4  = month0.add(4, 'day');
const d10 = month0.add(10, 'day');
const d11 = month0.add(11, 'day');
const d12 = month0.add(12, 'day');
const d15 = month0.add(15, 'day');
const d17 = month0.add(17, 'day');
const d31 = month0.add(31, 'day');

// 端末TZでの便利時間
const T_00 = (d: Dayjs) => d.hour(0).minute(0).second(0).millisecond(0);
const T_09 = (d: Dayjs) => d.hour(9).minute(0).second(0).millisecond(0);
const T_10 = (d: Dayjs) => d.hour(10).minute(0).second(0).millisecond(0);
const T_12 = (d: Dayjs) => d.hour(12).minute(0).second(0).millisecond(0);
const T_18 = (d: Dayjs) => d.hour(18).minute(0).second(0).millisecond(0);
const T_21 = (d: Dayjs) => d.hour(21).minute(0).second(0).millisecond(0);
const T_22 = (d: Dayjs) => d.hour(22).minute(0).second(0).millisecond(0);
const T_23 = (d: Dayjs) => d.hour(23).minute(0).second(0).millisecond(0);

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
  mkInst(1001, IDS.calendars.team_all, IDS.events.span_team_all, 'Sprint Planning (3d)', T_10(d2), T_18(d4)),
  mkInst(1002, IDS.calendars.fam_all,  IDS.events.span_fam_all,  'Family Trip',          T_21(d15), T_21(d17)),
  mkInst(1003, IDS.calendars.me_private, IDS.events.span_me_private, 'Server Maintenance', T_23(today), T_00(today.add(1, 'day')).add(3, 'hour')),
  mkInst(1004, IDS.calendars.team_des, IDS.events.span_team_des, 'Design Jam',           T_00(d12), T_00(d12).add(2, 'day')),

  // 10/3
  mkInst(2001, IDS.calendars.me_private, IDS.events.oct3_me_morning, 'Morning Focus',     T_09(d3), T_09(d3).add(30, 'minute')),
  mkInst(2002, IDS.calendars.fam_all,    IDS.events.oct3_fam_overlap,'Family Errand',     T_10(d3), T_12(d3)),
  mkInst(2003, IDS.calendars.fam_parents,IDS.events.oct3_fam_parents,'Parents Meeting',   T_10(d3).add(60, 'minute'), T_12(d3).add(60, 'minute')),
  mkInst(2004, IDS.calendars.team_all,   IDS.events.oct3_team_all,   'All Hands Prep',    T_10(d3).add(90, 'minute'), T_12(d3).add(30, 'minute')),
  mkInst(2005, IDS.calendars.team_dev,   IDS.events.oct3_team_dev,   'Dev Sprint Block',  T_12(d3).add(60, 'minute'), T_18(d3).subtract(2, 'hour')),
  mkInst(2006, IDS.calendars.team_des,   IDS.events.oct3_team_des_all,'3Design Day',      T_00(d3), T_00(d3).add(1, 'day')),
  mkInst(2007, IDS.calendars.personal,   IDS.events.oct3_personal_all,'3Personal Day',    T_00(d3), T_00(d3).add(1, 'day')),
  mkInst(2008, IDS.calendars.me_private, IDS.events.oct3_me_night,    'Late-night Maint.',T_23(d3), T_00(d3.add(1, 'day')).add(2, 'hour')),

  // 10/2
  mkInst(2101, IDS.calendars.me_private, IDS.events.oct2_me_morning,  'Morning Review',   T_09(d2), T_09(d2).add(45, 'minute')),
  mkInst(2102, IDS.calendars.fam_all,    IDS.events.oct2_fam_overlap, 'Family Chores',    T_10(d2).add(30, 'minute'), T_12(d2)),
  mkInst(2103, IDS.calendars.fam_parents,IDS.events.oct2_fam_parents, 'Parents Call',     T_10(d2).add(60, 'minute'), T_12(d2).add(60, 'minute')),
  mkInst(2104, IDS.calendars.team_all,   IDS.events.oct2_team_all,    'Town Hall Brief',  T_12(d2).add(120, 'minute'), T_12(d2).add(180, 'minute')),
  mkInst(2105, IDS.calendars.team_dev,   IDS.events.oct2_team_dev,    'Dev Focus Block',  T_12(d2).add(180, 'minute'), T_18(d2)),
  mkInst(2106, IDS.calendars.team_des,   IDS.events.oct2_team_des_all,'2Design Day',      T_00(d2), T_00(d2).add(1, 'day')),
  mkInst(2107, IDS.calendars.personal,   IDS.events.oct2_personal_all,'2Personal Day',    T_00(d2), T_00(d2).add(1, 'day')),
  mkInst(2108, IDS.calendars.me_private, IDS.events.oct2_me_night,    'Late-night Ops',   T_22(d2).add(30, 'minute'), T_00(d2.add(1, 'day')).add(90, 'minute')),
  mkInst(2109, IDS.calendars.me_private, IDS.events.oct2_personal_all,'31personal',       T_22(d31).add(30, 'minute'), T_00(d31.add(1, 'day')).add(90, 'minute')),
];

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
