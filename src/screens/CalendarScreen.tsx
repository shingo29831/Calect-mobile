// src/screens/CalendarScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { View, Text, Pressable, Platform, TextInput, KeyboardAvoidingView, Animated } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { CalendarList } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import dayjs from '../lib/dayjs';
import { listInstancesByDate } from '../store/db';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import type { EventInstance } from '../api/types';

import {
  EntityItem,
  getMonthRangeDates,
  WeekHeader,
  DayCell,
  SCREEN_H,
  SCREEN_W,
  HAIR_SAFE,
  DAY_FONT,
  MONTH_TITLE_HEIGHT,
  ROWS,
  FIRST_DAY,
  PROFILE_ICON_SIZE,
} from './CalendarParts';

import LeftDrawer from './calendar/LeftDrawer';
import ProfileDrawer from './calendar/ProfileDrawer';
import DayEventsSheet from './calendar/DayEventsSheet';
import { useAnimatedDrawer } from './calendar/hooks/useAnimatedDrawer';
import { useMonthEvents } from './calendar/hooks/useMonthEvents';
import { styles } from './calendar/calendarStyles';

// ローカル保存＆時間ユーティリティ
import { loadLocalEvents, saveLocalEvent } from '../store/localEvents';
import { fromUTC, startOfLocalDay, endOfLocalDay } from '../utils/time';
import { CALENDARS } from '../store/seeds';

type Props = NativeStackScreenProps<RootStackParamList, 'Calendar'>;
type SortMode = 'span' | 'start';

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

const ROW_HEIGHT = 64;
const PAGE = 50;

// 小さな状態バッジ
function StatusBadge({ text }: { text: string }) {
  return (
    <View style={{
      position: 'absolute', right: 12, top: 8,
      backgroundColor: '#0f172a', paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 9999, borderWidth: HAIR_SAFE, borderColor: '#0b1222',
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
      elevation: 4,
      zIndex: 10,
    }}>
      <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

// EventInstance -> DayCell で必要な形（EventSegment風）へ変換
type EventSegmentMinimal = EventInstance & { spanLeft: boolean; spanRight: boolean };
const toLocalSegment = (ev: EventInstance): EventSegmentMinimal => ({
  ...ev,
  spanLeft: false,
  spanRight: false,
});

// ★ EventInstanceの重複判定用キー（idが無い型でも安定）
const dedupeKey = (ev: EventInstance) =>
  `${String(ev.calendar_id ?? '')}|${String(ev.title ?? '')}|${String(ev.start_at ?? '')}|${String(ev.end_at ?? '')}`;

export default function CalendarScreen({ navigation }: Props) {
  const today = dayjs().format('YYYY-MM-DD');
  const [selected, setSelected] = useState<string>(today);
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

  const [innerW, setInnerW] = useState<number>(0);
  const [gridH, setGridH] = useState<number>(0);
  const [weekHeaderH, setWeekHeaderH] = useState<number>(0);
  const SHEET_H = Math.floor(SCREEN_H * 0.6);

  // 段階ロード状態
  const [localLoaded, setLocalLoaded] = useState(false);
  const [dbReady, setDbReady] = useState(false);

  // ドロワー
  const left = useAnimatedDrawer(DRAWER_W, 'left');
  const right = useAnimatedDrawer(PROFILE_DRAWER_W, 'right');

  // 日別イベントシート
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetDate, setSheetDate] = useState<string>(today);
  const [sheetItems, setSheetItems] = useState<any[]>([]);
  const sheetY = useRef(new Animated.Value(SHEET_H)).current;

  // 追加用ボトムシート
  const [addVisible, setAddVisible] = useState(false);
  const ADD_SHEET_H = Math.floor(SCREEN_H * 0.65);
  const addSheetY = useRef(new Animated.Value(ADD_SHEET_H)).current;

  // 使い方 / テスト投入
  const [helpVisible, setHelpVisible] = useState(false);
  const HELP_SHEET_H = Math.floor(SCREEN_H * 0.62);
  const helpSheetY = useRef(new Animated.Value(HELP_SHEET_H)).current;

  // 追加フォーム
  const [formTitle, setFormTitle] = useState('');
  const [formStart, setFormStart] = useState<string>(dayjs().format('YYYY-MM-DD HH:mm'));
  const [formEnd, setFormEnd] = useState<string>(dayjs().add(1, 'hour').format('YYYY-MM-DD HH:mm'));

  // 初期カレンダー選択を安全に決定
  const [formCalId, setFormCalId] = useState<string>(() => {
    const list = Array.isArray(CALENDARS) ? CALENDARS : [];
    return (
      list.find(c => c?.name?.includes('My: Private'))?.calendar_id ??
      list[0]?.calendar_id ??
      'CAL_LOCAL_DEFAULT'
    );
  });

  // ローカルイベント（日付別）
  const [localByDate, setLocalByDate] = useState<Record<string, EventInstance[]>>({});

  // ★ 二重保存ロック（UIと同期的ガード）
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const initialCurrent = useRef(dayjs().startOf('month').format('YYYY-MM-DD')).current;

  // セル高さ
  const cellH = useMemo(() => {
    if (gridH <= 0 || weekHeaderH <= 0) return 0;
    const usable = gridH - MONTH_TITLE_HEIGHT - weekHeaderH;
    const per = Math.max(28, Math.floor(usable / ROWS));
    return Math.floor(per);
  }, [gridH, weekHeaderH]);

  // カレンダーBody高さ
  const calendarBodyH = useMemo(() => {
    if (cellH <= 0) return 0;
    return Math.floor(cellH * ROWS);
  }, [cellH]);

  // CalendarList を描画可能に（初回ペイントを待たない）
  const [calReady, setCalReady] = useState(false);
  useEffect(() => {
    setCalReady(innerW > 0 && cellH > 0);
  }, [innerW, cellH]);

  // ==== 月ヘッダ切替：デバウンス ====
  const monthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onVisibleMonthsChange = useCallback((months: Array<{ year: number; month: number }>) => {
    if (!months?.length) return;
    const m = months[0];
    const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
    if (monthDebounceRef.current) clearTimeout(monthDebounceRef.current);
    monthDebounceRef.current = setTimeout(() => {
      setCurrentMonth((prev) => (prev === key ? prev : key));
    }, 80);
  }, []);
  useEffect(() => {
    return () => {
      if (monthDebounceRef.current) {
        clearTimeout(monthDebounceRef.current);
        monthDebounceRef.current = null;
      }
    };
  }, []);

  // 列幅
  const colWBase = useMemo(() => (innerW > 0 ? Math.floor(innerW / 7) : 0), [innerW]);
  const colWLast = useMemo(() => (innerW > 0 ? innerW - colWBase * 6 : 0), [innerW, colWBase]);

  // 表示対象のグループ
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

  // ==== 月データ（DB側）は dbReady になるまで止める ====
  const deferredMonth = useDeferredValue(currentMonth);
  const monthDates = useMemo(() => getMonthRangeDates(deferredMonth), [deferredMonth]);
  const enabledMonthDates = dbReady ? monthDates : [];
  const { eventsByDate, overflowByDate, hideRightDividerDays } = useMonthEvents(
    enabledMonthDates,
    filterEventsByEntity,
    sortMode
  );

  // 1) 画面描画 → 2) ローカル読み込み（イベント期間だけをループ＝線形化）
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!calReady) return;
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const list = await loadLocalEvents();

      // 当月の先頭/末尾（ローカル日付）
      if (monthDates.length === 0) return;
      const monthStart = startOfLocalDay(monthDates[0]);
      const monthEnd   = endOfLocalDay(monthDates[monthDates.length - 1]);

      const map: Record<string, EventInstance[]> = {};

      for (const ev of list) {
        const s = fromUTC(ev.start_at);
        const e = fromUTC(ev.end_at);

      // この月にかかる区間にクリップ
        const clipStart = s.isAfter(monthStart) ? s : monthStart;
        const clipEnd   = e.isBefore(monthEnd) ? e : monthEnd;
        if (clipEnd.isBefore(clipStart)) continue;

        // その期間の日付だけを回す（最大でも実在する日数分）
        let d = clipStart.startOf('day');
        const endDay = clipEnd.startOf('day');
        while (d.isBefore(endDay) || d.isSame(endDay)) {
          const key = d.format('YYYY-MM-DD');
          (map[key] ||= []).push(ev);
          d = d.add(1, 'day');
        }
      }

      if (!cancelled) {
        setLocalByDate(map);
        setLocalLoaded(true);
      }
    };
    run();
    return () => { cancelled = true; setLocalLoaded(false); };
  }, [calReady, deferredMonth, monthDates]);

  // 3) ローカル読み込み完了 → DB同期（当月＋前後月）
  useEffect(() => {
    if (!localLoaded) return;
    let alive = true;
    (async () => {
      try {
        type MonthShardModule = {
          ensureMonthLoaded?: (month: string) => Promise<void>;
          ensureMonthsLoaded?: (months: string[]) => Promise<void>;
        };
        const mod = (await import('../store/monthShard').catch(() => null)) as MonthShardModule | null;

        const center = dayjs(currentMonth + '-01');
        const months = [
          center.subtract(1, 'month').format('YYYY-MM'),
          center.format('YYYY-MM'),
          center.add(1, 'month').format('YYYY-MM'),
        ];

        // ローカル描画が見えた直後に少し間を置いてから同期開始（体感改善）
        await new Promise<void>(r => setTimeout(() => r(), 120));

        if (mod?.ensureMonthsLoaded) {
          await mod.ensureMonthsLoaded(months);
        } else if (mod?.ensureMonthLoaded) {
          await Promise.all(months.map(m => mod.ensureMonthLoaded!(m)));
        }
        if (alive) setDbReady(true);
      } catch {
        if (alive) setDbReady(true); // 失敗してもUIは進める
      }
    })();
    return () => { alive = false; setDbReady(false); };
  }, [localLoaded, currentMonth]);

  // ヘッダ
  useEffect(() => {
    const showEmoji = selectedEntity.kind === 'group';
    const headerLeft = () => (
      <Pressable onPress={left.openDrawer} hitSlop={12} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <View style={{ gap: 4 }}>
          <View style={{ width: 20, height: 2, backgroundColor: '#111827', borderRadius: 1 }} />
          <View style={{ width: 16, height: 2, backgroundColor: '#111827', borderRadius: 1 }} />
          <View style={{ width: 20, height: 2, backgroundColor: '#111827', borderRadius: 1 }} />
        </View>
      </Pressable>
    );
    const headerRight = () => (
      <Pressable onPress={right.openDrawer} hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
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
    );

    (navigation as any).setOptions({
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
      headerLeft,
      headerRight,
    });
  }, [navigation, selectedEntity, left.openDrawer, right.openDrawer]);

  const marked = useMemo(() => ({ [selected]: { selected: true } }), [selected]);

  // 日別シート：DB準備できていない間はローカルのみで表示
  const openSheet = useCallback((dateStr: string) => {
    setSheetDate(dateStr);
    const dbList = dbReady ? (listInstancesByDate(dateStr) ?? []) : [];
    const merged = [
      ...(localByDate[dateStr] ?? []),
      ...filterEventsByEntity(dbList),
    ];
    setSheetItems(merged.slice(0, PAGE));
    setSheetVisible(true);

    requestAnimationFrame(() => {
      sheetY.stopAnimation();
      sheetY.setValue(SHEET_H);
      Animated.timing(sheetY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start();
    });
  }, [filterEventsByEntity, sheetY, SHEET_H, localByDate, dbReady]);

  const closeSheet = useCallback(() => {
    sheetY.stopAnimation();
    Animated.timing(sheetY, { toValue: SHEET_H, duration: 220, useNativeDriver: true })
      .start(() => setSheetVisible(false));
  }, [sheetY, SHEET_H]);

  const handleDayPress = useCallback((d: DateData) => {
    setSelected(d.dateString);
    openSheet(d.dateString);
  }, [openSheet]);

  const onEndReached = useCallback(() => {
    setSheetItems((prev) => {
      const dbList = dbReady ? (listInstancesByDate(sheetDate) ?? []) : [];
      const all = [
        ...(localByDate[sheetDate] ?? []),
        ...filterEventsByEntity(dbList),
      ];
      if (prev.length >= all.length) return prev;
      const nextLen = Math.min(prev.length + PAGE, all.length);
      return all.slice(0, nextLen);
    });
  }, [sheetDate, filterEventsByEntity, localByDate, dbReady]);

  // CalendarList の内部ヘッダーは使わないので高さ 0 にする
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
          marginTop: 0, marginBottom: 0, padding: 0,
          flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'stretch',
        },
        dayContainer: { flex: 0, padding: 0, margin: 0, alignItems: 'flex-start', justifyContent: 'flex-start', width: undefined },
      },
      'stylesheet.day.basic': {
        base: { flex: 0, width: undefined, margin: 0, padding: 0, alignItems: 'stretch', justifyContent: 'flex-start' },
      },
      'stylesheet.calendar-list.main': { calendar: { paddingLeft: 0, paddingRight: 0, paddingTop: 0, marginTop: 0 } },
      'stylesheet.calendar.header': { header: { marginBottom: 0, paddingVertical: 0, height: 0 } },
    }),
    []
  );

  // DayCell レンダラ（DBは dbReady の時だけ合流）
  const renderDay = useCallback(
    ({ date, state, marking, onPress }: any) => {
      const dateStr = date?.dateString as string;

      // DB側（EventSegment[]）
      const dbSegs = dbReady ? (eventsByDate[dateStr] ?? []) : [];

      // ローカル側（EventInstance[] -> EventSegment風に変換）
      const localSegs = (localByDate[dateStr] ?? []).map(toLocalSegment);

      const merged = [
        ...dbSegs,
        ...localSegs,
      ] as any[]; // DayCell 側の型に合わせる（spanLeft/spanRight は付与済み）

      const moreLocal = localSegs.length;
      const moreDb    = dbReady ? (overflowByDate[dateStr] ?? 0) : 0;

      return (
        <DayCell
          date={date}
          state={state}
          marking={marking}
          onPress={onPress}
          colWBase={colWBase}
          colWLast={colWLast}
          cellH={cellH}
          dayEvents={merged}
          hideRightDivider={hideRightDividerDays.has(dateStr)}
          moreCount={moreDb + moreLocal}
        />
      );
    },
    [colWBase, colWLast, cellH, eventsByDate, hideRightDividerDays, overflowByDate, localByDate, dbReady]
  );

  /* =========================
   * 先読み（任意）
   * =========================*/
  const visitedMonthsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!dbReady) return; // DB準備前は先読みを止めて同時IOを避ける
    const run = async () => {
      const m0 = dayjs(currentMonth + '-01');
      const months = [-2, -1, 1, 2].map((off) => m0.add(off, 'month').format('YYYY-MM'));
      const targets = months.filter((m) => !visitedMonthsRef.current.has(m));
      if (targets.length === 0) return;

      const { InteractionManager } = require('react-native');
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      try {
        type MonthShardModule = {
          ensureMonthsLoaded?: (months: string[]) => Promise<void>;
          ensureMonthLoaded?: (month: string) => Promise<void>;
        };
        const mod = (await import('../store/monthShard').catch(() => null)) as MonthShardModule | null;

        if (mod?.ensureMonthsLoaded) {
          await mod.ensureMonthsLoaded(targets);
        } else if (mod?.ensureMonthLoaded) {
          await Promise.all(targets.map((m) => mod.ensureMonthLoaded!(m)));
        } else {
          return;
        }
        targets.forEach((t) => visitedMonthsRef.current.add(t));
        if (__DEV__) console.log('[prefetch] months loaded:', targets.join(', '));
      } catch (e) {
        if (__DEV__) console.warn('[prefetch] failed:', e);
      }
    };
    run();
  }, [currentMonth, dbReady]);

  // iOS 復帰時の軽い先読み
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const { AppState } = require('react-native');
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (last.match(/inactive|background/) && s === 'active') {
        const m = dayjs(currentMonth + '-01').add(1, 'month').format('YYYY-MM');
        if (!visitedMonthsRef.current.has(m)) {
          import('../store/monthShard')
            .then((mod) => (mod as { ensureMonthLoaded?: (month: string) => Promise<void> } | null)?.ensureMonthLoaded?.(m))
            .then(() => visitedMonthsRef.current.add(m))
            .catch(() => {});
        }
      }
      last = s;
    });
    return () => sub.remove();
  }, [currentMonth]);

  // 使い方 / テスト投入
  const openHelp = useCallback(() => {
    setHelpVisible(true);
    requestAnimationFrame(() => {
      helpSheetY.stopAnimation();
      helpSheetY.setValue(HELP_SHEET_H);
      Animated.timing(helpSheetY, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    });
  }, [helpSheetY, HELP_SHEET_H]);

  const closeHelp = useCallback(() => {
    helpSheetY.stopAnimation();
    Animated.timing(helpSheetY, { toValue: HELP_SHEET_H, duration: 220, useNativeDriver: true })
      .start(() => setHelpVisible(false));
  }, [helpSheetY, HELP_SHEET_H]);

  const injectTestEventsForThisMonth = useCallback(async () => {
    const monthStart = dayjs(currentMonth + '-01');
    const samples: Array<{ day: number; title: string; start: string; end: string }> = [
      { day: 3,  title: 'Test: Standup',    start: '10:00', end: '10:30' },
      { day: 7,  title: 'Test: 1on1',       start: '14:00', end: '14:30' },
      { day: 12, title: 'Test: Design Mtg', start: '11:00', end: '12:00' },
      { day: 18, title: 'Test: Family',     start: '18:00', end: '19:00' },
      { day: 25, title: 'Test: Focus',      start: '09:00', end: '11:00' },
    ];
    const cal = (Array.isArray(CALENDARS) ? CALENDARS : []).find(c => c?.calendar_id === formCalId);
    const color = cal?.color ?? undefined;

    const created: Array<{ inst: EventInstance; dStr: string }> = [];
    for (const smp of samples) {
      const d = monthStart.date(smp.day);
      const startLocalISO = d.format(`YYYY-MM-DD ${smp.start}`);
      const endLocalISO   = d.format(`YYYY-MM-DD ${smp.end}`);
      const inst = await saveLocalEvent({ calendar_id: formCalId, title: smp.title, startLocalISO, endLocalISO, color });
      created.push({ inst, dStr: d.format('YYYY-MM-DD') });
    }

    setLocalByDate(prev => {
      const next = { ...prev };
      for (const { inst, dStr } of created) (next[dStr] ||= []).push(inst);
      return next;
    });

    if (sheetVisible) {
      const addedForSheet = created.filter(x => x.dStr === sheetDate).map(x => x.inst);
      if (addedForSheet.length > 0) setSheetItems(prev => [...addedForSheet, ...prev]);
    }

    closeHelp();
  }, [currentMonth, formCalId, sheetDate, sheetVisible, closeHelp]);

  return (
    <View style={styles.container}>
      {/* ステータスバッジ（段階進行を表示） */}
      {!localLoaded && <StatusBadge text="Loading local events…" />}
      {localLoaded && !dbReady && <StatusBadge text="Syncing with server…" />}

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
          <View onLayout={(e) => setWeekHeaderH(Math.round(e.nativeEvent.layout.height))}>
            {innerW > 0 ? <WeekHeader colWBase={colWBase} colWLast={colWLast} /> : null}
          </View>

          {/* CalendarList */}
          <View style={{ overflow: 'hidden' }}>
            {calReady && weekHeaderH > 0 && (
              <CalendarList
                key={`${innerW}x${cellH}x${weekHeaderH}`}
                firstDay={FIRST_DAY}
                current={initialCurrent}
                horizontal={false}
                pagingEnabled
                hideDayNames
                renderHeader={() => null}
                style={{ height: calendarBodyH }}
                calendarStyle={{ paddingTop: 0, marginTop: 0 }}
                calendarHeight={calendarBodyH}
                pastScrollRange={12}
                futureScrollRange={12}
                minDate={'1900-01-01'}
                maxDate={'2100-12-31'}
                hideExtraDays={false}
                showSixWeeks
                onDayPress={handleDayPress}
                onVisibleMonthsChange={onVisibleMonthsChange}
                markedDates={marked}
                showScrollIndicator={false}
                removeClippedSubviews
                theme={calendarTheme as any}
                contentContainerStyle={{ alignItems: 'flex-start', paddingHorizontal: 0, paddingTop: 0 }}
                dayComponent={renderDay as any}
              />
            )}
          </View>
        </View>
      </View>

      {/* 左ドロワー */}
      <LeftDrawer
        open={left.open}
        width={DRAWER_W}
        translateX={left.x}
        selectedEntityId={selectedEntityId}
        setSelectedEntityId={setSelectedEntityId}
        expandedOrgId={expandedOrgId}
        setExpandedOrgId={setExpandedOrgId}
        closeDrawer={left.closeDrawer}
        ORGS={ORGS}
        GROUPS_BY_ORG={GROUPS_BY_ORG}
        FOLLOWS={FOLLOWS}
      />

      {/* 右ドロワー */}
      <ProfileDrawer
        open={right.open}
        width={PROFILE_DRAWER_W}
        translateX={right.x}
        close={right.closeDrawer}
        emoji={PROFILE_EMOJI}
      />

      {/* 日別イベントシート */}
      <DayEventsSheet
        visible={sheetVisible}
        sheetY={sheetY}
        height={SHEET_H}
        date={sheetDate}
        items={sheetItems}
        onClose={closeSheet}
        onEndReached={onEndReached}
        rowHeight={ROW_HEIGHT}
      />

      {/* 右下 ＋ FAB */}
      <Pressable
        onPress={() => {
          setFormTitle('');
          setFormStart(dayjs(selected).hour(10).minute(0).format('YYYY-MM-DD HH:mm'));
          setFormEnd(dayjs(selected).hour(11).minute(0).format('YYYY-MM-DD HH:mm'));
          const list = Array.isArray(CALENDARS) ? CALENDARS : [];
          const safeCalId =
            (list.find(c => c?.name?.includes('My: Private'))?.calendar_id ?? list[0]?.calendar_id) ??
            'CAL_LOCAL_DEFAULT';
          setFormCalId(safeCalId);
          setAddVisible(true);
          requestAnimationFrame(() => {
            addSheetY.stopAnimation();
            addSheetY.setValue(ADD_SHEET_H);
            Animated.timing(addSheetY, { toValue: 0, duration: 260, useNativeDriver: true }).start();
          });
        }}
        hitSlop={10}
        style={{
          position: 'absolute',
          right: 18,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#111827',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
          borderWidth: HAIR_SAFE,
          borderColor: '#0f172a',
        }}
      >
        <Text style={{ color: 'white', fontSize: 28, lineHeight: 28, marginTop: -2 }}>＋</Text>
      </Pressable>

      {/* 左下 ？ FAB（使い方 / テスト投入） */}
      <Pressable
        onPress={openHelp}
        hitSlop={10}
        style={{
          position: 'absolute',
          left: 18,
          bottom: 24,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: '#e5e7eb',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
          borderWidth: HAIR_SAFE,
          borderColor: '#cbd5e1',
        }}
      >
        <Text style={{ color: '#111827', fontSize: 20, lineHeight: 20 }}>?</Text>
      </Pressable>

      {/* 追加ボトムシート */}
      {addVisible && (
        <Pressable
          onPress={() => {
            addSheetY.stopAnimation();
            Animated.timing(addSheetY, { toValue: ADD_SHEET_H, duration: 220, useNativeDriver: true })
              .start(() => setAddVisible(false));
          }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)' }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <Animated.View
              style={{
                position: 'absolute',
                left: 0, right: 0, bottom: 0,
                height: ADD_SHEET_H,
                backgroundColor: 'white',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                borderWidth: HAIR_SAFE,
                borderColor: '#e5e7eb',
                padding: 16,
                transform: [{ translateY: addSheetY }],
              }}
            >
              <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', alignSelf: 'center', marginBottom: 12 }} />
              <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Add Event (Local JSON)</Text>

              <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Title</Text>
              <TextInput
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="e.g. Meeting"
                style={{
                  borderWidth: HAIR_SAFE, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                  fontSize: 16, marginBottom: 12,
                }}
              />

              <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Start (YYYY-MM-DD HH:mm)</Text>
              <TextInput
                value={formStart}
                onChangeText={setFormStart}
                placeholder="2025-10-06 10:00"
                style={{
                  borderWidth: HAIR_SAFE, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                  fontSize: 16, marginBottom: 12,
                }}
              />

              <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>End (YYYY-MM-DD HH:mm)</Text>
              <TextInput
                value={formEnd}
                onChangeText={setFormEnd}
                placeholder="2025-10-06 11:00"
                style={{
                  borderWidth: HAIR_SAFE, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                  fontSize: 16, marginBottom: 12,
                }}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                <Pressable
                  onPress={() => {
                    addSheetY.stopAnimation();
                    Animated.timing(addSheetY, { toValue: ADD_SHEET_H, duration: 220, useNativeDriver: true })
                      .start(() => setAddVisible(false));
                  }}
                  style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: '#e5e7eb' }}
                >
                  <Text style={{ fontWeight: '700' }}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={async () => {
                    // ---- ★ 二重押しロック ----
                    if (savingRef.current) return;
                    savingRef.current = true;
                    setIsSaving(true);
                    try {
                      if (!formTitle.trim()) return;

                      const cal = (Array.isArray(CALENDARS) ? CALENDARS : []).find(c => c?.calendar_id === formCalId);
                      const inst = await saveLocalEvent({
                        calendar_id: formCalId,
                        title: formTitle.trim(),
                        startLocalISO: formStart,
                        endLocalISO: formEnd,
                        color: cal?.color ?? undefined,
                      });

                      const dStr = dayjs(formStart).format('YYYY-MM-DD');
                      setLocalByDate(prev => {
                        const next = { ...prev };
                        const list = (next[dStr] ||= []);
                        const k = dedupeKey(inst);
                        if (!list.some(x => dedupeKey(x) === k)) list.unshift(inst);
                        return next;
                      });

                      if (sheetVisible && sheetDate === dStr) {
                        const k = dedupeKey(inst);
                        setSheetItems(prev => (prev.some(x => dedupeKey(x) === k) ? prev : [inst, ...prev]));
                      }

                      // 閉じるアニメーション
                      addSheetY.stopAnimation();
                      Animated.timing(addSheetY, { toValue: ADD_SHEET_H, duration: 220, useNativeDriver: true })
                        .start(() => setAddVisible(false));
                    } finally {
                      setIsSaving(false);
                      savingRef.current = false;
                    }
                  }}
                  disabled={isSaving}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: isSaving ? '#9ca3af' : '#111827'
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '700' }}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </Pressable>
      )}

      {/* 使い方 / テスト投入ボトムシート */}
      {helpVisible && (
        <Pressable
          onPress={closeHelp}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <Animated.View
              style={{
                position: 'absolute',
                left: 0, right: 0, bottom: 0,
                height: HELP_SHEET_H,
                backgroundColor: 'white',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                borderWidth: HAIR_SAFE,
                borderColor: '#e5e7eb',
                padding: 16,
                transform: [{ translateY: helpSheetY }],
              }}
            >
              <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', alignSelf: 'center', marginBottom: 12 }} />
              <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>使い方 & テスト投入</Text>

              <Text style={{ color: '#475569', lineHeight: 20, marginBottom: 12 }}>
                ・日付タップでその日の予定が開きます{'\n'}
                ・右下「＋」でローカルJSONへ予定追加{'\n'}
                ・追加先カレンダーは「＋」シートの丸ボタンで選択
              </Text>

              <View style={{ height: 12 }} />

              <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 6 }}>▶ テストデータの投入</Text>
              <Text style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>
                表示中の月に、選択中カレンダーへサンプル予定を追加します。
              </Text>

              <Pressable
                onPress={injectTestEventsForThisMonth}
                style={{ alignSelf: 'flex-start', backgroundColor: '#111827', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }}
              >
                <Text style={{ color: 'white', fontWeight: '700' }}>この月にテストイベントを投入</Text>
              </Pressable>

              <View style={{ flex: 1 }} />

              <Pressable
                onPress={closeHelp}
                style={{ alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#e5e7eb', marginTop: 16 }}
              >
                <Text style={{ fontWeight: '700' }}>閉じる</Text>
              </Pressable>
            </Animated.View>
          </KeyboardAvoidingView>
        </Pressable>
      )}
    </View>
  );
}
