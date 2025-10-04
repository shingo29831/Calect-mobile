// src/screens/CalendarScreen.tsx
import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  FlatList,
  InteractionManager,
  Platform,
} from 'react-native';
import { CalendarList } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import dayjs from '../lib/dayjs';
import { listInstancesByDate } from '../store/db';
import EventListItem from '../components/EventListItem';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

import {
  EntityItem,
  EventSegment,
  startOfWeek,
  getMonthRangeDates,
  WeekHeader,
  DayCell,
  DrawerRow,
  ProfileMenuRow,
  SCREEN_H,
  SCREEN_W,
  HAIR_SAFE,
  LINE_W,
  LINE_COLOR,
  LINE_COLOR_SELECTED,
  DAY_FONT,
  HEADER_HEIGHT,
  MONTH_TITLE_HEIGHT,
  ROWS,
  FIRST_DAY,
  SIDE_PAD,
  SEP_H,
  MAX_BARS_PER_DAY,
  PROFILE_ICON_SIZE,
} from './CalendarParts';

type Props = NativeStackScreenProps<RootStackParamList, 'Calendar'>;

const ROW_HEIGHT = 64;
const PAGE = 50;

/* ───────── Left Drawer (組織 / グループ / フォロー) ───────── */
const ORGS: EntityItem[] = [
  { id: 'org_me',   label: 'My Schedule', emoji: '🙂',           kind: 'me'   },
  { id: 'org_fam',  label: 'Family',      emoji: '👨‍👩‍👧‍👦', kind: 'org'  },
  { id: 'org_team', label: 'Team',        emoji: '👥',           kind: 'org'  },
];

const GROUPS_BY_ORG: Record<string, EntityItem[]> = {
  org_me:   [ { id: 'grp_me_private', label: 'Private',   emoji: '🔒', kind: 'group' } ],
  org_fam:  [
    { id: 'grp_fam_all',     label: 'All Members', emoji: '🏠', kind: 'group' },
    { id: 'grp_fam_parents', label: 'Parents',     emoji: '🧑‍🧑‍🧒', kind: 'group' },
  ],
  org_team: [
    { id: 'grp_team_all',  label: 'All Hands',  emoji: '🗓️', kind: 'group' },
    { id: 'grp_team_dev',  label: 'Developers', emoji: '💻', kind: 'group' },
    { id: 'grp_team_des',  label: 'Designers',  emoji: '🎨', kind: 'group' },
  ],
};

const FOLLOWS: EntityItem[] = [
  { id: 'u1', label: 'Alice', emoji: '🧑‍💻', kind: 'user' },
  { id: 'u2', label: 'Bob',   emoji: '🎨',   kind: 'user' },
  { id: 'u3', label: 'Chris', emoji: '🎸',   kind: 'user' },
];

const DRAWER_W = Math.floor(Math.min(360, SCREEN_W * 0.84));
const PROFILE_DRAWER_W = Math.floor(Math.min(360, SCREEN_W * 0.9));
const PROFILE_EMOJI = '🙂';

type SortMode = 'span' | 'start';

const makeStableKey = (ev: any) => {
  const id = ev.event_id ?? ev.master_event_id ?? ev.series_id ?? ev.parent_id ?? null;
  if (id != null) return `E:${String(id)}`;
  const s = dayjs(ev.start_at).toISOString();
  const e = dayjs(ev.end_at).toISOString();
  const t = ev.title ?? '';
  return `T:${s}|${e}|${t}`;
};

export default function CalendarScreen({ navigation }: Props) {
  const today = dayjs().format('YYYY-MM-DD');
  const [selected, setSelectedState] = useState<string>(today);
  const [currentMonth, setCurrentMonth] = useState<string>(dayjs().format('YYYY-MM'));
  const [sortMode, setSortMode] = useState<SortMode>('span');

  const [selectedEntityId, setSelectedEntityId] = useState<string>('org_me');
  const selectedEntity = useMemo<EntityItem>(
    () =>
      [...ORGS, ...Object.values(GROUPS_BY_ORG).flat(), ...FOLLOWS].find((x) => x.id === selectedEntityId) ??
      ORGS[0],
    [selectedEntityId]
  );

  const [expandedOrgId, setExpandedOrgId] = useState<string | null>('org_me');

  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetDate, setSheetDate] = useState<string>(today);
  const [sheetItems, setSheetItems] = useState<any[]>([]);

  const [innerW, setInnerW] = useState<number>(0);
  const [calReady, setCalReady] = useState(false);
  const [gridH, setGridH] = useState<number>(0);

  const SHEET_H = Math.floor(SCREEN_H * 0.6);
  const sheetY = useRef(new Animated.Value(SHEET_H)).current;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerX = useRef(new Animated.Value(-DRAWER_W)).current;

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const [profileOpen, setProfileOpen] = useState(false);
  const profileX = useRef(new Animated.Value(PROFILE_DRAWER_W)).current;

  const openProfile = useCallback(() => setProfileOpen(true), []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);

  const initialCurrent = useRef(dayjs().startOf('month').format('YYYY-MM-DD')).current;

  const setSelected = useCallback((d: string) => {
    setSelectedState((prev) => (prev === d ? prev : d));
  }, []);

  const onVisibleMonthsChange = useCallback((months: Array<{ year: number; month: number }>) => {
    if (!months?.length) return;
    const m = months[0];
    const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
    setCurrentMonth((prev) => (prev === key ? prev : key));
  }, []);

  const cellH = useMemo(() => {
    if (gridH <= 0) return 0;
    const usable = gridH - MONTH_TITLE_HEIGHT - HEADER_HEIGHT - SEP_H;
    const per = Math.max(28, Math.floor(usable / ROWS));
    return Math.floor(per);
  }, [gridH]);

  const calendarBodyH = useMemo(() => {
    if (cellH <= 0) return 0;
    return Math.floor(MONTH_TITLE_HEIGHT + cellH * ROWS);
  }, [cellH]);

  useEffect(() => {
    if (innerW > 0 && cellH > 0) {
      const task = InteractionManager.runAfterInteractions(() => setCalReady(true));
      return () => task.cancel();
    } else {
      setCalReady(false);
    }
  }, [innerW, cellH]);

  useEffect(() => {
    const showEmoji = selectedEntity.kind === 'group';
    navigation.setOptions({
      headerTitleAlign: 'left',
      headerTitle: () => (
        <View style={styles.headerTitleRow}>
          {showEmoji ? (
            <View style={styles.headerEmojiCircle}>
              <Text style={styles.headerEmojiText}>{selectedEntity.emoji}</Text>
            </View>
          ) : null}
          <Text style={styles.headerTitleText} numberOfLines={1}>
            {selectedEntity.label}
          </Text>
        </View>
      ),
      headerLeft: () => (
        <Pressable onPress={openDrawer} hitSlop={12} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          <View style={{ gap: 4 }}>
            <View style={{ width: 20, height: 2, backgroundColor: '#111827', borderRadius: 1 }} />
            <View style={{ width: 16, height: 2, backgroundColor: '#111827', borderRadius: 1 }} />
            <View style={{ width: 20, height: 2, backgroundColor: '#111827', borderRadius: 1 }} />
          </View>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable onPress={openProfile} hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          <View
            style={{
              width: PROFILE_ICON_SIZE + 8,
              height: PROFILE_ICON_SIZE + 8,
              borderRadius: (PROFILE_ICON_SIZE + 8) / 2,
              backgroundColor: '#f1f5f9',
              borderWidth: HAIR_SAFE,
              borderColor: '#e5e7eb',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>{PROFILE_EMOJI}</Text>
          </View>
        </Pressable>
      ),
    });
  }, [navigation, selectedEntity.label, selectedEntity.kind, selectedEntity.emoji, openDrawer, openProfile]);

  const marked = useMemo(() => ({ [selected]: { selected: true } }), [selected]);

  const colWBase = useMemo(() => (innerW > 0 ? Math.floor(innerW / 7) : 0), [innerW]);
  const colWLast = useMemo(() => (innerW > 0 ? innerW - colWBase * 6 : 0), [innerW, colWBase]);

  const getVisibleGroupIds = useCallback((): string[] => {
    if (selectedEntity.kind === 'group') return [selectedEntity.id];
    if (selectedEntity.kind === 'org' || selectedEntity.kind === 'me') {
      return (GROUPS_BY_ORG[selectedEntity.id] ?? []).map((g) => g.id);
    }
    return [];
  }, [selectedEntity]);

  const filterEventsByEntity = useCallback((listRaw: any[]) => {
    const visibleGroupIds = getVisibleGroupIds();
    const getGroupId = (ev: any) => ev?.group_id ?? ev?.groupId ?? ev?.owner_group_id ?? null;

    return listRaw.filter((ev) => {
      const gid = getGroupId(ev);
      if (!gid) return true;
      if (selectedEntity.kind === 'group') return gid === selectedEntity.id;
      if (selectedEntity.kind === 'org' || selectedEntity.kind === 'me') {
        return visibleGroupIds.length === 0 ? true : visibleGroupIds.includes(gid);
      }
      return true;
    });
  }, [getVisibleGroupIds, selectedEntity]);

  const monthDates = useMemo(() => getMonthRangeDates(currentMonth), [currentMonth]);

  // ── ここから：バー配列と「残り件数」を分離して作る ─────────────────
  const { eventsByDate, overflowByDate } = useMemo(() => {
    const empty = { eventsByDate: {} as Record<string, EventSegment[]>, overflowByDate: {} as Record<string, number> };
    if (monthDates.length === 0) return empty;

    const dayStartCache: Record<string, dayjs.Dayjs> = {};
    const dayEndCache: Record<string, dayjs.Dayjs> = {};
    for (const d of monthDates) {
      const ds = dayjs(d).startOf('day');
      dayStartCache[d] = ds;
      dayEndCache[d] = ds.endOf('day');
    }

    // 当月に「少しでも重なる」イベントを一意化して取得
    const uniq = new Map<string | number, any>();
    for (const d of monthDates) {
      const raw = listInstancesByDate(d) ?? [];
      const list = filterEventsByEntity(raw);
      for (const ev of list) {
        const key = makeStableKey(ev);
        if (!uniq.has(key)) uniq.set(key, ev);
      }
    }
    const all = Array.from(uniq.values());

    const coveredDatesFor = (ev: any): string[] => {
      const res: string[] = [];
      const s = dayjs(ev.start_at);
      const e = dayjs(ev.end_at);
      for (const d of monthDates) {
        const overlaps = s.isBefore(dayEndCache[d]) && e.isAfter(dayStartCache[d]);
        if (overlaps) res.push(d);
      }
      return res;
    };

    const idxOfDate = monthDates.reduce(
      (acc: Record<string, number>, d: string, i: number) => { acc[d] = i; return acc; },
      {} as Record<string, number>
    );

    const keyCmp = (a: any, b: any) => makeStableKey(a).localeCompare(makeStableKey(b));

    // レーン割当の優先順
    const orderForLanes = [...all].sort((a, b) => {
      if (sortMode === 'span') {
        // 期間長い順 → 開始時刻 → 安定ID
        const spanA = coveredDatesFor(a).length;
        const spanB = coveredDatesFor(b).length;
        if (spanB !== spanA) return spanB - spanA;

        const as = dayjs(a.start_at).valueOf();
        const bs = dayjs(b.start_at).valueOf();
        if (as !== bs) return as - bs;

        return keyCmp(a, b);
      }

      // === sortMode === 'start' ===
      const acov = coveredDatesFor(a), bcov = coveredDatesFor(b);
      const afirst = acov[0], bfirst = bcov[0];
      const aIdx = idxOfDate[afirst], bIdx = idxOfDate[bfirst];

      // まず「この月で最初に現れる日」が早い方
      if (aIdx !== bIdx) return aIdx - bIdx;

      // 同じ“最初に現れる日”では：
      // 1) 当日開始(0) を 継続(1) より優先
      const aContinues = dayjs(a.start_at).isBefore(dayStartCache[afirst]) ? 1 : 0;
      const bContinues = dayjs(b.start_at).isBefore(dayStartCache[bfirst]) ? 1 : 0;
      if (aContinues !== bContinues) return aContinues - bContinues;

      // 2) 当日開始同士は当日の開始時刻の早い順
      //    継続同士は「元の開始日時」の早い順
      const as = dayjs(a.start_at).valueOf();
      const bs = dayjs(b.start_at).valueOf();
      if (as !== bs) return as - bs;

      // 3) タイブレークは安定ID
      return keyCmp(a, b);
    });

    // レーン割当
    const laneDates: Array<Record<string, true>> = [];
    const laneOf: Record<string | number, number> = {};
    for (const ev of orderForLanes) {
      const key = makeStableKey(ev);
      const cov = coveredDatesFor(ev);
      let lane = 0;
      while (true) {
        if (!laneDates[lane]) laneDates[lane] = {};
        const used = laneDates[lane];
        if (cov.every((d) => !used[d])) {
          cov.forEach((d) => { used[d] = true; });
          laneOf[key] = lane;
          break;
        }
        lane++;
      }
    }

    const result: Record<string, EventSegment[]> = {};
    const overflow: Record<string, number> = {};

    for (const d of monthDates) {
      const raw = listInstancesByDate(d) ?? [];
      const list = filterEventsByEntity(raw);
      const dayStart = dayStartCache[d];
      const dayEnd = dayEndCache[d];

      const byLane: Record<number, any> = {};
      let countForDay = 0;

      for (const ev of list) {
        countForDay++;

        const s = dayjs(ev.start_at);
        const e = dayjs(ev.end_at);
        const key = makeStableKey(ev);
        const lane = laneOf[key] ?? 9999;
        if (lane !== 9999) {
          // 週の最初にタイトル表示
          const weekStart = startOfWeek(dayjs(d), FIRST_DAY);
          let firstInWeek = d;
          for (let i = 0; i < 7; i++) {
            const dd = weekStart.add(i, 'day').format('YYYY-MM-DD');
            const overlaps = s.isBefore(dayEndCache[dd]) && e.isAfter(dayStartCache[dd]);
            if (overlaps) { firstInWeek = dd; break; }
          }
          const showTitle = d === firstInWeek;

          if (!byLane[lane]) {
            const spanLen = coveredDatesFor(ev).length; // ★ 期間長さ（その月内で被っている日数）
            byLane[lane] = {
              instance_id: ev.instance_id ?? key,
              title: ev.title ?? '(untitled)',
              color: ev.color ?? null,
              // 0:00 終了も“日を跨ぐ”扱い（重なり判定に準拠）
              spanLeft: s.isBefore(dayStart),
              spanRight: e.isAfter(dayEnd),
              showTitle,
              __lane: lane,
              __startMs: dayjs(ev.start_at).valueOf(),
              __key: key,
              __startsToday: !s.isBefore(dayStart), // 当日開始なら true
              __spanLen: spanLen,                   // ★ 追加
            };
          }
        }
      }

      const laneIndices = Object.keys(byLane).map(Number);

      let slots: EventSegment[] = [];
      let displayedCount = 0; // 実際に“表示”されるイベント本数（スペーサー除く）

      if (sortMode === 'start') {
        // 日付内の縦順：当日開始 → 開始時刻昇順 →（継続も元開始昇順）→ 安定ID
        const segs = laneIndices.sort((a, b) => a - b).map((ln) => byLane[ln]);

        segs.sort((A: any, B: any) => {
          if (A.__startsToday !== B.__startsToday) return A.__startsToday ? -1 : 1;
          if (A.__startMs !== B.__startMs) return A.__startMs - B.__startMs;
          return String(A.__key).localeCompare(String(B.__key));
        });

        const limit = Math.min(MAX_BARS_PER_DAY, segs.length);
        displayedCount = limit;

        for (let i = 0; i < limit; i++) {
          const { __lane, __startMs, __key, __startsToday, __spanLen, ...seg } = segs[i];
          slots.push(seg as EventSegment);
        }
        // 見栄え用のスペーサー（必要な範囲のみ）
        while (slots.length < Math.min(MAX_BARS_PER_DAY, Math.max(segs.length, 0))) {
          slots.push({
            instance_id: `__spacer-${d}-fill-${slots.length}`,
            title: '',
            spanLeft: false,
            spanRight: false,
            showTitle: false,
            __spacer: true,
          } as any);
        }
      } else {
        // === Span モード ===
        // その日“実体がある”レーンのみを抽出し、重要度で選抜して表示
        const lanesTodaySortedByImportance = laneIndices
          .filter((ln) => !!byLane[ln])
          .sort((a, b) => {
            const A = byLane[a], B = byLane[b];
            if (A.__spanLen !== B.__spanLen) return B.__spanLen - A.__spanLen; // 期間が長いほど優先
            if (A.__startMs !== B.__startMs) return A.__startMs - B.__startMs; // 早い開始ほど優先
            return String(A.__key).localeCompare(String(B.__key));
          });

        const chosen = lanesTodaySortedByImportance.slice(0, MAX_BARS_PER_DAY);

        // 実表示本数
        displayedCount = chosen.length;

        // レーンの視覚的連続性を保つため、描画はレーン番号昇順で出す
        chosen.sort((a, b) => a - b);

        for (const lane of chosen) {
          const { __lane, __startMs, __key, __startsToday, __spanLen, ...seg } = byLane[lane];
          slots.push(seg as EventSegment);
        }
        // スペーサーは入れない（“表示数＝見える本数”の一致を優先）
      }

      // ← 実表示本数に対して残数を出す（MAX_BARS_PER_DAY ではなく）
      overflow[d] = Math.max(0, (list?.length ?? 0) - displayedCount);

      result[d] = slots;
    }

    return { eventsByDate: result, overflowByDate: overflow };
  }, [monthDates, filterEventsByEntity, sortMode]);
  // ── ここまで ───────────────────────────────────────────────

  const hideRightDividerDays = useMemo(() => {
    const s = new Set<string>();
    for (const d of monthDates) {
      const list = eventsByDate[d] ?? [];
      if (list.some(ev => !ev.__spacer && ev.spanRight)) s.add(d);
    }
    return s;
  }, [monthDates, eventsByDate]);

  const openSheet = useCallback(
    (dateStr: string) => {
      setSheetDate(dateStr);
      const listRaw = listInstancesByDate(dateStr) ?? [];
      const list = filterEventsByEntity(listRaw);
      setSheetItems(list.slice(0, PAGE));
      setSheetVisible(true);

      requestAnimationFrame(() => {
        sheetY.stopAnimation();
        sheetY.setValue(SHEET_H);
        Animated.timing(sheetY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    },
    [filterEventsByEntity, sheetY]
  );

  const closeSheet = useCallback(() => {
    sheetY.stopAnimation();
    Animated.timing(sheetY, {
      toValue: SHEET_H,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setSheetVisible(false));
  }, [sheetY]);

  const handleDayPress = useCallback(
    (d: DateData) => {
      setSelected(d.dateString);
      openSheet(d.dateString);
    },
    [openSheet, setSelected]
  );

  const onEndReached = useCallback(() => {
    setSheetItems((prev) => {
      const allRaw = listInstancesByDate(sheetDate) ?? [];
      const all = filterEventsByEntity(allRaw);
      if (prev.length >= all.length) return prev;
      const nextLen = Math.min(prev.length + PAGE, all.length);
      return all.slice(0, nextLen);
    });
  }, [sheetDate, filterEventsByEntity]);

  const calendarTheme: any = useMemo(
    () => ({
      textDayFontSize: DAY_FONT,
      textDayFontWeight: '700',
      textMonthFontSize: 20,
      textMonthFontWeight: '800',
      'stylesheet.calendar.main': {
        container: { paddingLeft: 0, paddingRight: 0, paddingTop: 0 },
        monthView: { paddingHorizontal: 0, paddingTop: 0, marginTop: 0 },
        week: {
          marginTop: 0,
          marginBottom: 0,
          padding: 0,
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'stretch',
        },
        dayContainer: {
          flex: 0,
          padding: 0,
          margin: 0,
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          width: undefined,
        },
      },
      'stylesheet.day.basic': {
        base: {
          flex: 0,
          width: undefined,
          margin: 0,
          padding: 0,
          alignItems: 'stretch',
          justifyContent: 'flex-start',
        },
      },
      'stylesheet.calendar-list.main': {
        calendar: { paddingLeft: 0, paddingRight: 0, paddingTop: 0, marginTop: 0 },
      },
      'stylesheet.calendar.header': {
        header: { marginBottom: 0, paddingVertical: 0, height: MONTH_TITLE_HEIGHT },
      },
    }),
    []
  );

  useEffect(() => {
    if (drawerOpen) {
      drawerX.stopAnimation();
      drawerX.setValue(-DRAWER_W);
      requestAnimationFrame(() => {
        Animated.timing(drawerX, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    } else {
      drawerX.stopAnimation();
      Animated.timing(drawerX, {
        toValue: -DRAWER_W,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [drawerOpen, drawerX]);

  useEffect(() => {
    if (profileOpen) {
      profileX.stopAnimation();
      profileX.setValue(PROFILE_DRAWER_W);
      requestAnimationFrame(() => {
        Animated.timing(profileX, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    } else {
      profileX.stopAnimation();
      Animated.timing(profileX, {
        toValue: PROFILE_DRAWER_W,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [profileOpen, profileX]);

  const [drawerXVal, setDrawerXVal] = useState<number>(-DRAWER_W);
  const [profileXVal, setProfileXVal] = useState<number>(PROFILE_DRAWER_W);
  useEffect(() => {
    const id1 = drawerX.addListener(({ value }) => setDrawerXVal(value));
    const id2 = profileX.addListener(({ value }) => setProfileXVal(value));
    return () => {
      drawerX.removeListener(id1);
      profileX.removeListener(id2);
    };
  }, [drawerX, profileX]);

  return (
    <View style={styles.container}>
      {/* カレンダー */}
      <View style={styles.gridBlock} onLayout={(e) => setGridH(e.nativeEvent.layout.height)}>
        <View style={styles.gridInner} onLayout={(e) => setInnerW(e.nativeEvent.layout.width)}>
          {/* 月タイトル */}
          <View style={{ height: MONTH_TITLE_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={styles.monthTitle}>{dayjs(currentMonth + '-01').format('YYYY MMM')}</Text>
              <View style={styles.sortPills}>
                <Pressable onPress={() => setSortMode('span')} style={[styles.pill, sortMode === 'span' && styles.pillActive]}>
                  <Text style={[styles.pillText, sortMode === 'span' && styles.pillTextActive]}>Span</Text>
                </Pressable>
                <Pressable onPress={() => setSortMode('start')} style={[styles.pill, sortMode === 'start' && styles.pillActive]}>
                  <Text style={[styles.pillText, sortMode === 'start' && styles.pillTextActive]}>Start</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* 曜日ヘッダー */}
          {innerW > 0 ? <WeekHeader colWBase={colWBase} colWLast={colWLast} /> : null}

          {/* 仕切り線 */}
          <View style={{ height: SEP_H, backgroundColor: LINE_COLOR }} />

          {/* CalendarList */}
          {calReady && (
            <CalendarList
              key={`${innerW}x${cellH}`}
              firstDay={FIRST_DAY}
              current={initialCurrent}
              horizontal={false}
              pagingEnabled
              hideDayNames
              renderHeader={() => null}
              style={{ height: calendarBodyH }}
              calendarStyle={{ paddingTop: 0, marginTop: -LINE_W }}
              calendarHeight={calendarBodyH}
              pastScrollRange={120}
              futureScrollRange={120}
              minDate={'1900-01-01'}
              maxDate={'2100-12-31'}
              hideExtraDays={false}
              showSixWeeks
              onDayPress={handleDayPress}
              onVisibleMonthsChange={onVisibleMonthsChange}
              markedDates={marked}
              showScrollIndicator={false}
              theme={calendarTheme as any}
              contentContainerStyle={{ alignItems: 'flex-start', paddingHorizontal: 0, paddingTop: 0 }}
              dayComponent={({ date, state, marking, onPress }: any) => {
                const dateStr = date?.dateString as string;
                return (
                  <DayCell
                    date={date}
                    state={state}
                    marking={marking}
                    onPress={onPress}
                    colWBase={colWBase}
                    colWLast={colWLast}
                    cellH={cellH}
                    dayEvents={eventsByDate[dateStr] ?? []}
                    hideRightDivider={hideRightDividerDays.has(dateStr)}
                    moreCount={overflowByDate[dateStr] ?? 0}
                  />
                );
              }}
            />
          )}
        </View>
      </View>

      {/* ===== Left Drawer (no Modal) ===== */}
      {drawerOpen && (
        <View style={styles.layerWrap} pointerEvents="box-none">
          <Pressable style={styles.layerOverlay} onPress={closeDrawer} />
          <Animated.View
            style={[
              styles.drawer,
              {
                width: DRAWER_W,
                transform: [{ translateX: drawerX }],
                zIndex: 10001,
                ...(Platform.OS === 'android' ? { elevation: 20 } : {}),
              },
            ]}
          >
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Select Source</Text>
              <Text style={styles.drawerClose} onPress={closeDrawer}>Close</Text>
            </View>

            <Text style={styles.sectionHeader}>Organizations</Text>
            {ORGS.map((org) => {
              const isExpanded = expandedOrgId === org.id;
              const groups = GROUPS_BY_ORG[org.id] ?? [];
              return (
                <View key={org.id}>
                  <DrawerRow
                    item={org}
                    active={selectedEntityId === org.id}
                    onPress={(o: EntityItem) => {
                      if (isExpanded) {
                        setSelectedEntityId(o.id);
                        closeDrawer();
                      } else {
                        setExpandedOrgId(o.id);
                        setSelectedEntityId(o.id);
                      }
                    }}
                    indent={0}
                    chevron={groups.length > 0 ? (isExpanded ? 'down' : 'right') : null}
                  />
                  {isExpanded &&
                    groups.map((grp) => (
                      <DrawerRow
                        key={grp.id}
                        item={grp}
                        active={selectedEntityId === grp.id}
                        onPress={(g: EntityItem) => { setSelectedEntityId(g.id); closeDrawer(); }}
                        indent={24}
                        chevron={null}
                      />
                    ))}
                </View>
              );
            })}

            <Text style={styles.sectionHeader}>Following</Text>
            {FOLLOWS.map((u) => (
              <DrawerRow
                key={u.id}
                item={u}
                active={selectedEntityId === u.id}
                onPress={(usr: EntityItem) => { setSelectedEntityId(usr.id); closeDrawer(); }}
                indent={0}
                chevron={null}
              />
            ))}
          </Animated.View>
        </View>
      )}

      {/* ===== Right Drawer (no Modal) ===== */}
      {profileOpen && (
        <View style={styles.layerWrap} pointerEvents="box-none">
          <Pressable style={styles.layerOverlay} onPress={closeProfile} />
          <Animated.View
            style={[
              styles.profileDrawer,
              {
                width: PROFILE_DRAWER_W,
                transform: [{ translateX: profileX }],
                zIndex: 10001,
                ...(Platform.OS === 'android' ? { elevation: 20 } : {}),
              },
            ]}
          >
            <View style={styles.profileHeader}>
              <View style={styles.profileAvatar}>
                <Text style={{ fontSize: 20 }}>{PROFILE_EMOJI}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>Your Name</Text>
                <Text style={styles.profileEmail}>you@example.com</Text>
              </View>
              <Text style={styles.drawerClose} onPress={closeProfile}>Close</Text>
            </View>

            <View style={{ paddingVertical: 8 }}>
              <ProfileMenuRow icon="🔔" label="Notifications" />
              <ProfileMenuRow icon="⚙️" label="Settings" />
              <ProfileMenuRow icon="🎨" label="Appearance" />
              <ProfileMenuRow icon="❓" label="Help & Feedback" />
            </View>

            <View style={styles.profileFooter}>
              <ProfileMenuRow icon="🚪" label="Sign out" />
            </View>
          </Animated.View>
        </View>
      )}

      {/* ===== Bottom sheet (no Modal) ===== */}
      {sheetVisible && (
        <View style={styles.layerWrap} pointerEvents="box-none">
          <Pressable style={styles.layerOverlay} onPress={closeSheet} />
          <Animated.View
            style={[
              styles.sheet,
              { transform: [{ translateY: sheetY }], zIndex: 10001, ...(Platform.OS === 'android' ? { elevation: 16 } : {}) },
            ]}
          >
            <View style={styles.sheetHandleWrap}>
              <View style={styles.sheetHandle} />
            </View>

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{sheetDate}</Text>
              <Text style={styles.sheetClose} onPress={closeSheet}>Close</Text>
            </View>

            <FlatList
              data={sheetItems}
              keyExtractor={(it: any) => String(it.instance_id)}
              renderItem={({ item }) => (<EventListItem title={item.title} start={item.start_at} end={item.end_at} />)}
              ListEmptyComponent={<Text style={styles.empty}>No events</Text>}
              getItemLayout={(_, i) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * i, index: i })}
              initialNumToRender={10}
              windowSize={5}
              maxToRenderPerBatch={8}
              updateCellsBatchingPeriod={80}
              removeClippedSubviews
              onEndReached={onEndReached}
              onEndReachedThreshold={0.5}
              contentContainerStyle={sheetItems.length === 0 ? styles.emptyContainer : undefined}
            />
          </Animated.View>
        </View>
      )}

    </View>
  );
}

/* styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  layerWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  layerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.3)',
  },

  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: SCREEN_W * 0.6,
  },
  headerEmojiCircle: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: HAIR_SAFE, borderColor: '#e5e7eb',
  },
  headerEmojiText: { fontSize: 14 },
  headerTitleText: { fontSize: 16, fontWeight: '800', color: '#111827' },

  monthTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' },

  sortPills: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 9999, padding: 3 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  pillActive: { backgroundColor: '#2563eb' },
  pillText: { fontSize: 12, color: '#334155', fontWeight: '700' },
  pillTextActive: { color: '#fff' },

  gridBlock: {
    flex: 1,
    minHeight: 0,
    borderLeftWidth: LINE_W,
    borderTopWidth: HAIR_SAFE,
    borderColor: LINE_COLOR,
    paddingLeft: SIDE_PAD,
    paddingRight: SIDE_PAD,
  },
  gridInner: {},

  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: Math.floor(SCREEN_H * 0.6),
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 12,
  },
  sheetHandleWrap: { alignItems: 'center', paddingTop: 8 },
  sheetHandle: { width: 42, height: 5, borderRadius: 2.5, backgroundColor: '#e5e7eb' },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: HAIR_SAFE, borderBottomColor: '#eef2f7', gap: 12,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  sheetClose: { color: '#2563eb', fontWeight: '700' },

  emptyContainer: { paddingVertical: 24 },
  empty: { textAlign: 'center', color: '#6b7280' },

  drawer: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0,
    backgroundColor: '#ffffff',
    borderRightWidth: HAIR_SAFE, borderRightColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.18,
    shadowOffset: { width: 2, height: 0 }, shadowRadius: 12,
    paddingTop: 12,
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: HAIR_SAFE, borderBottomColor: '#eef2f7', gap: 12,
  },
  drawerTitle: { fontSize: 16, fontWeight: '800', color: '#111827', flex: 1 },
  drawerClose: { color: '#2563eb', fontWeight: '700' },
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: '#6b7280',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },

  profileDrawer: {
    position: 'absolute',
    top: 0, bottom: 0, right: 0,
    backgroundColor: '#ffffff',
    borderLeftWidth: HAIR_SAFE, borderLeftColor: '#e5e7eb',
    shadowColor: '#000', shadowOpacity: 0.18,
    shadowOffset: { width: -2, height: 0 }, shadowRadius: 12,
    paddingTop: 12,
  },
  profileHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: HAIR_SAFE, borderBottomColor: '#eef2f7', gap: 12,
  },
  profileAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f8fafc',
    borderWidth: HAIR_SAFE, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center',
  },
  profileName: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  profileEmail: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  profileFooter: {
    marginTop: 'auto',
    borderTopWidth: HAIR_SAFE, borderTopColor: '#eef2f7',
    paddingVertical: 8,
  },
});

export {};
