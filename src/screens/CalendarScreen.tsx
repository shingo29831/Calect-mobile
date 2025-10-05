// src/screens/CalendarScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { CalendarList } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import dayjs from '../lib/dayjs';
import { listInstancesByDate } from '../store/db';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';

import {
  EntityItem,
  getMonthRangeDates,
  WeekHeader,
  DayCell,
  SCREEN_H,
  SCREEN_W,
  HAIR_SAFE,
  LINE_COLOR,
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
  const [weekHeaderH, setWeekHeaderH] = useState<number>(0); // ★ 実測の曜日ヘッダー高さ
  const SHEET_H = Math.floor(SCREEN_H * 0.6);

  // ドロワー
  const left = useAnimatedDrawer(DRAWER_W, 'left');
  const right = useAnimatedDrawer(PROFILE_DRAWER_W, 'right');

  // ボトムシート
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetDate, setSheetDate] = useState<string>(today);
  const [sheetItems, setSheetItems] = useState<any[]>([]);
  const sheetY = useRef(new (require('react-native').Animated.Value)(SHEET_H)).current;

  const initialCurrent = useRef(dayjs().startOf('month').format('YYYY-MM-DD')).current;

  // セル高さ：固定値ではなく “曜日以下のレイアウト実測” から算出
  const cellH = useMemo(() => {
    if (gridH <= 0 || weekHeaderH <= 0) return 0;
    const usable = gridH - MONTH_TITLE_HEIGHT - weekHeaderH;
    const per = Math.max(28, Math.floor(usable / ROWS));
    return Math.floor(per);
  }, [gridH, weekHeaderH]);

  // CalendarList に渡す高さは “グリッドのみ”
  const calendarBodyH = useMemo(() => {
    if (cellH <= 0) return 0;
    return Math.floor(cellH * ROWS);
  }, [cellH]);

  // CalendarList を描画可能に
  const [calReady, setCalReady] = useState(false);
  useEffect(() => {
    if (innerW > 0 && cellH > 0) {
      const { InteractionManager } = require('react-native');
      const task = InteractionManager.runAfterInteractions(() => setCalReady(true));
      return () => task.cancel();
    } else {
      setCalReady(false);
    }
  }, [innerW, cellH]);

  // ==== 月ヘッダ切替：デバウンス + 後始末 ====
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

  // ==== 月データ生成を少し遅延してUIを滑らかに ====
  const deferredMonth = useDeferredValue(currentMonth);
  const monthDates = useMemo(() => getMonthRangeDates(deferredMonth), [deferredMonth]);

  // イベント配置（新シグネチャ）
  const { eventsByDate, overflowByDate, hideRightDividerDays } = useMonthEvents(
    monthDates,
    filterEventsByEntity,
    sortMode
  );

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

  const openSheet = useCallback((dateStr: string) => {
    setSheetDate(dateStr);
    const listRaw = listInstancesByDate(dateStr) ?? [];
    const list = filterEventsByEntity(listRaw);
    setSheetItems(list.slice(0, PAGE));
    setSheetVisible(true);

    const { Animated, Easing } = require('react-native');
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
  }, [filterEventsByEntity, sheetY]);

  const closeSheet = useCallback(() => {
    const { Animated, Easing } = require('react-native');
    sheetY.stopAnimation();
    Animated.timing(sheetY, {
      toValue: SHEET_H,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setSheetVisible(false));
  }, [sheetY]);

  const handleDayPress = useCallback((d: DateData) => {
    setSelected(d.dateString);
    openSheet(d.dateString);
  }, [openSheet]);

  const onEndReached = useCallback(() => {
    setSheetItems((prev) => {
      const allRaw = listInstancesByDate(sheetDate) ?? [];
      const all = filterEventsByEntity(allRaw);
      if (prev.length >= all.length) return prev;
      const nextLen = Math.min(prev.length + PAGE, all.length);
      return all.slice(0, nextLen);
    });
  }, [sheetDate, filterEventsByEntity]);

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
      'stylesheet.calendar.header': { header: { marginBottom: 0, paddingVertical: 0, height: 0 } }, // ★ 0 に固定
    }),
    []
  );

  // ==== DayCell レンダラをメモ化 ====
  const renderDay = useCallback(
    ({ date, state, marking, onPress }: any) => {
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
    },
    [colWBase, colWLast, cellH, eventsByDate, hideRightDividerDays, overflowByDate]
  );

  /* =========================
   * 先読み（任意）：前後2ヶ月を非同期プリフェッチ
   *   - monthShard.ts がある時だけ動くよう動的 import でガード
   *   - 同じ月の重複ロードを避けるため visited セットで管理
   *   - UI優先：InteractionManager 後に実行
   * =========================*/
  const visitedMonthsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const run = async () => {
      const m0 = dayjs(currentMonth + '-01');
      const months = [-2, -1, 1, 2].map((off) => m0.add(off, 'month').format('YYYY-MM'));
      const targets = months.filter((m) => !visitedMonthsRef.current.has(m));
      if (targets.length === 0) return;

      // UIの重い処理が終わってから
      const { InteractionManager } = require('react-native');
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      try {
        // monthShard が存在する場合のみ実行（未導入でも壊さない）
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
          // monthShard未導入 → 何もしない
          return;
        }
        targets.forEach((t) => visitedMonthsRef.current.add(t));
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[prefetch] months loaded:', targets.join(', '));
        }
      } catch (e) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[prefetch] failed:', e);
        }
      }
    };
    run();
  }, [currentMonth]);

  // iOS で AppState 復帰時に軽く先読み（体感向上オプション）
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const { AppState } = require('react-native');
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (last.match(/inactive|background/) && s === 'active') {
        // 復帰時：今の currentMonth の +1 を軽くプリフェッチ
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

          {/* 曜日ヘッダー（実測） */}
          <View onLayout={(e) => setWeekHeaderH(Math.round(e.nativeEvent.layout.height))}>
            {innerW > 0 ? <WeekHeader colWBase={colWBase} colWLast={colWLast} /> : null}
          </View>

          {/* CalendarList（曜日直下にピッタリ合う） */}
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
                calendarStyle={{ paddingTop: 0, marginTop: 0 }} // 余白補正なし
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

      {/* ボトムシート */}
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
    </View>
  );
}
