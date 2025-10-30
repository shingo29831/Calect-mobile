// src/features/calendar/screens/CalendarScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue, memo } from 'react';
import {
  View, Text, Pressable, Platform, Image, StyleSheet, Switch, Animated, Alert
} from 'react-native';
import type { AppStateStatus } from 'react-native';
import { CalendarList } from 'react-native-calendars';
import { Calendar as MiniCalendar } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import dayjs from '../../../lib/dayjs';
import { listInstancesByDate } from '../../../store/db';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation';
import { useFocusEffect } from '@react-navigation/native';

//  月シャードAPI（新パス固定）
import {
  ensureMonths as ensureMonthsLoaded,
  loadMonth as ensureMonthLoaded,
} from '../../../data/persistence/monthShard';

//  ローカル全初期化（snapshot / ops / months / queue 等）
import { resetLocalData } from '../../../data/persistence/localStore';

// UIへリスト反映を飛ばす（store/db 側の購読に通知）
import { replaceAllInstances } from '../../../store/db';

import {
  EntityItem,
  getPrevCurrNextRange,
  WeekHeader,
  DayCell,
  SCREEN_H,
  SCREEN_W,
  HAIR_SAFE,
  DAY_FONT,
  ROWS,
  FIRST_DAY as FIRST_DAY_FALLBACK,
  PROFILE_ICON_SIZE,
} from '../components/CalendarParts';

import LeftDrawer from '../components/LeftDrawer';
import ProfileDrawer from '../components/ProfileDrawer';
import DayEventsSheet from '../components/DayEventsSheet';
import { useAnimatedDrawer } from '../hooks/useAnimatedDrawer';
import { useMonthEvents } from '../hooks/useMonthEvents';
import { styles } from '../styles/calendarStyles';
import { useAppTheme } from '../../../theme';
import type { ServerDocV2 } from '../../../data/persistence/schemas';

type Props = NativeStackScreenProps<RootStackParamList, 'Calendar'>;
type SortMode = 'span' | 'start';

/* =======================
 * 今日文字列を日付またぎで更新するフック
 * ======================= */
function useTodayTick(fmt: string = 'YYYY-MM-DD') {
  const [todayStr, setTodayStr] = useState(() => dayjs().format(fmt));
  useEffect(() => {
    let timer: any;
    const schedule = () => {
      const now = dayjs();
      const next = now.add(1, 'day').startOf('day');
      const ms = Math.max(1000, next.diff(now, 'millisecond'));
      timer = setTimeout(() => {
        setTodayStr(dayjs().format(fmt));
        schedule();
      }, ms);
    };
    schedule();
    return () => timer && clearTimeout(timer);
  }, [fmt]);
  return todayStr;
}

/* --------- 新JSON(v2)に完全対応した型定義（アプリ内設定のみ使用） --------- */
type ClientPrefsV1 = {
  version: number;
  meta?: { updated_at?: string; app_version?: string; device_id?: string };
  display?: { week_start?: 'mon' | 'sun'; theme?: 'light'|'dark'|'system'; time_format?: '24h'|'12h' };
  calendars?: Record<string, {
    background_image?: string | null;
    event_style_default?: { font_family?: string; font_color?: string; background_color?: string; border_color?: string };
    overlays?: Array<{ calendar_id: string; event_filters?: unknown }>;
  }>;
};

async function loadAppData(): Promise<{ server?: ServerDocV2; prefs?: ClientPrefsV1 }> {
  try {
    const m: any = await import('../../../config/appData');
    if (typeof m?.getAppData === 'function') return m.getAppData();
    if (m?.default && (m.default.server || m.default.prefs)) return m.default;
    return { server: m.server, prefs: m.prefs };
  } catch {
    return {};
  }
}

/* === 編集対象イベントのID抽出ヘルパー === */
function getEventIdFromRow(row: any): string | undefined {
  if (!row) return undefined;
  if (typeof row.event_id === 'string') return row.event_id;
  if (typeof row.cid_ulid === 'string') return row.cid_ulid;
  if (typeof row.eventId === 'string') return row.eventId;
  const ok = String(row?.occurrence_key ?? row?.occurrenceKey ?? '');
  const at = ok.indexOf('@@'); // "eventId@@YYYY-MM-DD"
  if (at > 0) return ok.slice(0, at);
  return undefined;
}

/* ステータスバッジ */
function StatusBadge({ text }: { text: string }) {
  const theme = useAppTheme();
  return (
    <View style={{
      position: 'absolute', right: 12, top: 8,
      backgroundColor: theme.surface, paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 9999, borderWidth: HAIR_SAFE, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
      elevation: 4, zIndex: 10,
    }}>
      <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export default function CalendarScreen({ navigation }: Props) {
  const theme = useAppTheme();

  // 今日（YYYY-MM-DD）
  const todayStr = useTodayTick('YYYY-MM-DD');

  // ===== スキーマ・プロフィール読み込み =====
  const [{ server, prefs }, setAppData] = useState<{ server?: ServerDocV2; prefs?: ClientPrefsV1 }>({});
  const [schemaReady, setSchemaReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded = await loadAppData();
      if (!alive) return;
      setAppData(loaded);
      setSchemaReady(true);
    })();
    return () => { alive = false; };
  }, []);

  // 背景画像
  const bgImageUri = useMemo(() => {
    const all = Object.values(prefs?.calendars ?? {});
    const first = all.find(c => !!c?.background_image)?.background_image ?? null;
    return (typeof first === 'string' && first.length > 0) ? first : null;
  }, [prefs]);

  // UI 用エンティティ
  const ORGS: EntityItem[] = useMemo(() => {
    const list: EntityItem[] = [];
    const displayName =
      server?.profile?.display_name ||
      server?.profile?.username ||
      'My Schedule';
    list.push({ id: 'org_me', label: displayName, emoji: '🗓️', kind: 'me' });

    const orgs = Object.values(server?.entities?.organizations ?? {});
    for (const o of orgs) list.push({ id: o.org_id, label: o.name, emoji: '🏢', kind: 'org' });
    return list.length ? list : [
      { id: 'org_me',   label: 'My Schedule', emoji: '🗓️', kind: 'me' },
      { id: 'org_fam',  label: 'Family',      emoji: '👨‍👩‍👧‍👦', kind: 'org' },
      { id: 'org_team', label: 'Team',        emoji: '👥', kind: 'org' },
    ];
  }, [server]);

  const GROUPS_BY_ORG: Record<string, EntityItem[]> = useMemo(() => {
    const map: Record<string, EntityItem[]> = {};
    map['org_me'] = [{ id: 'grp_me_private', label: 'Private', emoji: '🔒', kind: 'group' }];
    const groups = Object.values(server?.entities?.groups ?? {});
    for (const g of groups) {
      const ownerOrg = g.owner_org_id || 'org_me';
      (map[ownerOrg] ||= []).push({ id: g.group_id, label: g.name, emoji: '👥', kind: 'group' });
    }
    if (Object.keys(map).length) return map;
    return {
      org_me:  [ { id: 'grp_me_private', label: 'Private', emoji: '🔒', kind: 'group' } ],
      org_fam: [ { id: 'grp_fam_all', label: 'All Members', emoji: '👨‍👩‍👧‍👦', kind: 'group' } ],
      org_team:[ { id: 'grp_team_all', label: 'All Hands', emoji: '🙌', kind: 'group' } ],
    };
  }, [server]);

  const FOLLOWS: EntityItem[] = useMemo(() => {
    const follows = Object.values(server?.entities?.follows ?? {}).map(f => ({
      id: f.user_id, label: f.display_name || f.user_id, emoji: '🧑', kind: 'user' as const
    }));
    return follows.length ? follows : [
      { id: 'u1', label: 'Alice', emoji: '👩', kind: 'user' },
      { id: 'u2', label: 'Bob',   emoji: '👨', kind: 'user' },
      { id: 'u3', label: 'Chris', emoji: '🧑', kind: 'user' },
    ];
  }, [server]);

  // 週の開始曜日
  const FIRST_DAY = useMemo(() => {
    const wk = prefs?.display?.week_start;
    if (wk === 'mon') return 1;
    if (wk === 'sun') return 0;
    return FIRST_DAY_FALLBACK;
  }, [prefs]);

  // 画面状態
  const [selected, setSelected] = useState<string>(todayStr);
  const [currentMonth, setCurrentMonth] = useState<string>(dayjs().format('YYYY-MM'));
  const monthLabel = useMemo(() => dayjs(currentMonth + '-01').format('YYYY年M月'), [currentMonth]);
  const [sortMode] = useState<SortMode>('span');

  const [selectedEntityId, setSelectedEntityId] = useState<string>('org_me');
  const selectedEntity = useMemo<EntityItem>(
    () =>
      [...ORGS, ...Object.values(GROUPS_BY_ORG).flat(), ...FOLLOWS].find((x) => x.id === selectedEntityId) ??
      ORGS[0],
    [selectedEntityId, ORGS, GROUPS_BY_ORG, FOLLOWS]
  );
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>('org_me');

  const [innerW, setInnerW] = useState<number>(0);
  const [gridH, setGridH] = useState<number>(0);
  const [weekHeaderH, setWeekHeaderH] = useState<number>(0);

  // シート高さ
  const SHEET_MAX = Math.floor(SCREEN_H * 0.8);

  // DB
  const [dbReady, setDbReady] = useState(false);

  // 同期
  const [syncing, setSyncing] = useState(false);
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const hasSyncedRef = useRef(false);
  const syncRunIdRef = useRef(0);

  // ドロワー
  const left = useAnimatedDrawer(Math.floor(Math.min(360, SCREEN_W * 0.84)), 'left');
  const right = useAnimatedDrawer(Math.floor(Math.min(360, SCREEN_W * 0.9)), 'right');

  // DayEventsSheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetDate, setSheetDate] = useState<string>(todayStr);
  const [sheetItems, setSheetItems] = useState<any[]>([]);
  const sheetY = useRef(new Animated.Value(0)).current;

  const initialCurrent = useRef(dayjs().startOf('month').format('YYYY-MM-DD')).current;
  const calRef = useRef<any>(null);

  // 列・行レイアウト
  const pageHeight = useMemo(() => {
    if (gridH <= 0) return 0;
    const weekH = Math.max(weekHeaderH, 24);
    const usable = Math.max(0, gridH - weekH);
    const cell = Math.max(1, Math.floor(usable / ROWS));
    return cell * ROWS;
  }, [gridH, weekHeaderH]);
  const cellH = useMemo(() => (pageHeight <= 0 ? 0 : Math.floor(pageHeight / ROWS)), [pageHeight]);

  // CalendarList 準備OK？
  const [calReady, setCalReady] = useState(false);
  useEffect(() => { setCalReady(innerW > 0 && pageHeight > 0); }, [innerW, pageHeight]);
  useEffect(() => { if (!calReady || !calRef.current) return; calRef.current?.scrollToMonth?.(initialCurrent, 0, true); }, [calReady, initialCurrent]);

  // 可視月
  const monthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onVisibleMonthsChange = useCallback((months: Array<{ year: number; month: number }>) => {
    if (!months?.length) return;
    const m = months[0];
    const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
    if (monthDebounceRef.current) clearTimeout(monthDebounceRef.current);
    monthDebounceRef.current = setTimeout(() => { setCurrentMonth((prev) => (prev === key ? prev : key)); }, 80);
  }, []);
  useEffect(() => () => { if (monthDebounceRef.current) clearTimeout(monthDebounceRef.current); }, []);

  const colWBase = useMemo(() => (innerW > 0 ? Math.floor(innerW / 7) : 0), [innerW]);
  const colWLast = useMemo(() => (innerW > 0 ? innerW - colWBase * 6 : 0), [innerW, colWBase]);

  const getVisibleGroupIds = useCallback((): string[] => {
    if (selectedEntity.kind === 'group') return [selectedEntity.id];
    if (selectedEntity.kind === 'org' || selectedEntity.kind === 'me') {
      return (GROUPS_BY_ORG[selectedEntity.id] ?? []).map((g) => g.id);
    }
    return [];
  }, [selectedEntity, GROUPS_BY_ORG]);

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

  // 3ヶ月分
  const deferredMonth = useDeferredValue(currentMonth);
  const threeMonthsDates = useMemo(() => {
    const { startISO, endISO } = getPrevCurrNextRange(deferredMonth);
    const start = dayjs(startISO).startOf('day');
    const end   = dayjs(endISO).startOf('day');
    const out: string[] = [];
    for (let cur = start; cur.isBefore(end) || cur.isSame(end, 'day'); cur = cur.add(1, 'day')) {
      out.push(cur.format('YYYY-MM-DD'));
    }
    return out;
  }, [deferredMonth]);

  // ▼ 修正：dbReady 依存を外し、常に3ヶ月分を渡す
  const enabledMonthDates = threeMonthsDates;

  // ★ 追加：再計算キー（初回描画 & 画面復帰 & 保存直後の反映用）
  const [refreshTick, setRefreshTick] = useState(0);

  // ★ 追加：emit + 再計算を1か所に集約
  const forceRecalcAndEmit = useCallback(async () => {
    setRefreshTick((t) => t + 1);
    try {
      const db = await import('../../../store/db');
      (db as any).emitInstancesChanged?.(); // 実装されていれば購読者へ通知（useMonthEvents が購読している場合に効く）
    } catch {}
  }, []);

  const { eventsByDate, overflowByDate } = useMonthEvents(enabledMonthDates, filterEventsByEntity, sortMode, refreshTick);

  // ★ 追加：画面フォーカス時に前後月を再ロードして再計算
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const center = dayjs(currentMonth + '-01');
          const months = [
            center.subtract(1, 'month').format('YYYY-MM'),
            center.format('YYYY-MM'),
            center.add(1, 'month').format('YYYY-MM'),
          ];
          await ensureMonthsLoaded(months);
          if (!alive) return;
          await forceRecalcAndEmit();
        } catch {
          // オフライン等は無視：ローカルキャッシュで描画継続
          await forceRecalcAndEmit(); // それでも再計算は叩く
        }
      })();
      return () => { alive = false; };
    }, [currentMonth, forceRecalcAndEmit])
  );

  // ★ 追加：navigation の focus でも再計算（EventModal→戻る直後の確実反映）
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { forceRecalcAndEmit(); });
    return unsub;
  }, [navigation, forceRecalcAndEmit]);

  // 初回同期
  useEffect(() => {
    if (hasSyncedRef.current) return;
    const thisRunId = ++syncRunIdRef.current;
    let hardTimer: any = null;
    let finished = false;
    setSyncing(true);
    const finish = async (opts: { ok: boolean; timedOut?: boolean }) => {
      if (finished) return;
      finished = true;
      if (syncRunIdRef.current !== thisRunId) return;
      hasSyncedRef.current = true; setDbReady(true); setSyncing(false);
      if (opts.timedOut) setSyncTimedOut(true);
      if (hardTimer) clearTimeout(hardTimer);
      // ★ 初回ロード直後に再計算（起動直後にイベントバーが出ない対策）
      await forceRecalcAndEmit();
    };
    (async () => {
      try {
        const center = dayjs(currentMonth + '-01');
        const months = [center.subtract(1,'month').format('YYYY-MM'), center.format('YYYY-MM'), center.add(1,'month').format('YYYY-MM')];
        hardTimer = setTimeout(() => finish({ ok: false, timedOut: true }), 2500);
        await ensureMonthsLoaded(months);
        await finish({ ok: true });
      } catch {
        await finish({ ok: false });
      }
    })();
    return () => { if (hardTimer) clearTimeout(hardTimer); };
  }, [currentMonth, forceRecalcAndEmit]);

  // ★ 追加：マウント直後の保険（UIレイアウト完了後にも一度叩く）
  useEffect(() => {
    const t = setTimeout(() => { forceRecalcAndEmit(); }, 300);
    return () => clearTimeout(t);
  }, [forceRecalcAndEmit]);

  // ★ 追加：カレンダー準備完了の瞬間にも叩く（描画サイズ計算後）
  useEffect(() => {
    if (calReady) { forceRecalcAndEmit(); }
  }, [calReady, forceRecalcAndEmit]);

  useEffect(() => {
    if (!syncTimedOut) return;
    const t = setTimeout(() => setSyncTimedOut(false), 2500);
    return () => clearTimeout(t);
  }, [syncTimedOut]);

  // ローカルデータのリセット
  const visitedMonthsRef = useRef<Set<string>>(new Set());
  const runResetLocal = useCallback(async () => {
    try {
      setSyncing(true);
      await resetLocalData();
      try { const ms = await import('../../../data/persistence/monthShard'); (ms as any).clearMonthCache?.(); } catch {}
      try { const db = await import('../../../store/db'); db.replaceAllInstances?.([]); } catch {}
      visitedMonthsRef.current.clear();
      setSheetVisible(false);
      setDbReady(false);

      const center = dayjs(currentMonth + '-01');
      const months = [center.subtract(1,'month').format('YYYY-MM'), center.format('YYYY-MM'), center.add(1,'month').format('YYYY-MM')];
      await ensureMonthsLoaded(months);

      setDbReady(true);
      // ★ リセット直後も再計算
      await forceRecalcAndEmit();
      Alert.alert('リセット完了', 'ローカルデータを初期化しました。');
    } catch (e) {
      console.warn('[runResetLocal] failed:', e);
      Alert.alert('リセットに失敗しました', String(e ?? 'unknown error'));
    } finally {
      setSyncing(false);
      setSyncTimedOut(false);
    }
  }, [currentMonth, forceRecalcAndEmit]);

  // ヘッダー設定
  useEffect(() => {
    const headerLeft = () => (
      <Pressable onPress={left.openDrawer} hitSlop={12} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <View style={{ gap: 4 }}>
          <View style={{ width: 20, height: 2, backgroundColor: theme.textPrimary, borderRadius: 1 }} />
          <View style={{ width: 16, height: 2, backgroundColor: theme.textPrimary, borderRadius: 1 }} />
          <View style={{ width: 20, height: 2, backgroundColor: theme.textPrimary, borderRadius: 1 }} />
        </View>
      </Pressable>
    );
    const headerRight = () => (
      <Pressable onPress={right.openDrawer} hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <View style={{
          width: PROFILE_ICON_SIZE + 8, height: PROFILE_ICON_SIZE + 8,
          borderRadius: (PROFILE_ICON_SIZE + 8) / 2, backgroundColor: theme.surface,
          borderWidth: HAIR_SAFE, borderColor: theme.border, alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 18 }}>👤</Text>
        </View>
      </Pressable>
    );

    (navigation as any).setOptions({
      headerStyle: { backgroundColor: theme.appBg },
      headerTitleAlign: 'left',
      headerTitle: () => (
        <Text style={{ fontSize: 18, fontWeight: '800', color: theme.textPrimary }}>
          {dayjs(currentMonth + '-01').format('YYYY年M月')}
        </Text>
      ),
      headerLeft,
      headerRight,
    });
  }, [navigation, left.openDrawer, right.openDrawer, theme, monthLabel]);

  const marked = useMemo(() => ({ [selected]: { selected: true } }), [selected]);

  // DayEventsSheet 開く/閉じる
  const openSheet = useCallback((dateStr: string) => {
    setSheetDate(dateStr);
    const dbList = dbReady ? filterEventsByEntity(listInstancesByDate(dateStr) ?? []) : [];
    setSheetItems(dbList.slice(0, 50));
    setSheetVisible(true);
  }, [filterEventsByEntity, dbReady]);
  const closeSheet = useCallback(() => setSheetVisible(false), []);

  const handleDayPress = useCallback((d: DateData) => {
    const ds = d.dateString;
    if (selected !== ds) { setSelected(ds); return; }
    openSheet(ds);
  }, [selected, openSheet]);

  const onEndReached = useCallback(() => {
    setSheetItems((prev) => {
      const dbList = dbReady ? filterEventsByEntity(listInstancesByDate(sheetDate) ?? []) : [];
      if (prev.length >= dbList.length) return prev;
      const nextLen = Math.min(prev.length + 50, dbList.length);
      return dbList.slice(0, nextLen);
    });
  }, [sheetDate, filterEventsByEntity, dbReady]);

  // CalendarList のテーマ
  const calendarTheme: any = useMemo(() => {
    const transparent = !!bgImageUri;
    const bg = transparent ? 'transparent' : theme.appBg;
    return {
      backgroundColor: bg,
      calendarBackground: bg,
      textDayFontSize: DAY_FONT,
      textDayFontWeight: '700',
      textMonthFontSize: 20,
      textMonthFontWeight: '800',
      'stylesheet.calendar.main': {
        container: { paddingLeft: 0, paddingRight: 0, paddingTop: 0, backgroundColor: 'transparent' },
        monthView: { paddingHorizontal: 0, paddingTop: 0, marginTop: 0, backgroundColor: 'transparent' },
        week: { marginTop: 0, marginBottom: 0, padding: 0, flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'stretch', backgroundColor: 'transparent' },
        dayContainer: { flex: 0, padding: 0, margin: 0, alignItems: 'stretch', justifyContent: 'flex-start', width: undefined, backgroundColor: 'transparent' },
      },
      'stylesheet.day.basic': { base: { flex: 0, width: undefined, margin: 0, padding: 0, alignItems: 'stretch', justifyContent: 'flex-start', backgroundColor: 'transparent' } },
      'stylesheet.calendar-list.main': { calendar: { paddingLeft: 0, paddingRight: 0, paddingTop: 0, marginTop: 0, backgroundColor: 'transparent' } },
      'stylesheet.calendar.header': { header: { marginBottom: 0, paddingVertical: 0, height: 0, backgroundColor: 'transparent' } },
    };
  }, [bgImageUri, theme.appBg]);

  // DayCell
  const renderDay = useCallback(
    ({ date, state, marking, onPress }: any) => {
      const dateStr = date?.dateString as string;

      // hook の集計結果
      const hookList = dbReady ? (eventsByDate[dateStr] ?? []) : [];

      // フォールバック：まだ hook が空の瞬間は DB 直引き + 絞り込み
      const directList = dbReady ? (listInstancesByDate(dateStr) ?? []) : [];
      const filteredDirect = dbReady ? filterEventsByEntity(directList) : [];

      const dbSegs = hookList.length > 0 ? hookList : filteredDirect;

      // moreCount も hook 優先、無ければ直引きとの差分から概算
      const moreDb = hookList.length > 0
        ? (overflowByDate[dateStr] ?? 0)
        : Math.max(0, (filteredDirect.length - dbSegs.length));

      return (
        <View
          style={{
            height: cellH,
            overflow: 'hidden',
            backgroundColor: dateStr === todayStr ? theme.todayBg : 'transparent',
            borderRadius: 6,
          }}
        >
          <DayCell
            date={date}
            state={state}
            marking={marking}
            onPress={onPress}
            colWBase={colWBase}
            colWLast={colWLast}
            cellH={cellH}
            dayEvents={dbSegs}
            hideRightDivider
            moreCount={moreDb}
          />
        </View>
      );
    },
    [
      colWBase,
      colWLast,
      cellH,
      eventsByDate,
      overflowByDate,
      dbReady,
      todayStr,
      theme.mode,
      filterEventsByEntity, // 追加：フォールバックで使用
    ]
  );

  // 先読み
  useEffect(() => {
    if (!dbReady) return;
    const run = async () => {
      const m0 = dayjs(currentMonth + '-01');
      const months = [-2, -1, 1, 2].map((off) => m0.add(off, 'month').format('YYYY-MM'));
      const targets = months.filter((m) => !visitedMonthsRef.current.has(m));
      if (targets.length === 0) return;
      const { InteractionManager } = require('react-native');
      await new Promise<void>((resolve) => { InteractionManager.runAfterInteractions(() => resolve()); });
      try {
        await ensureMonthsLoaded(targets);
        targets.forEach((t) => visitedMonthsRef.current.add(t));
        // ★ 先読み後も一応再計算（新規に可視化される可能性に備える）
        await forceRecalcAndEmit();
      } catch {}
    };
    run();
  }, [currentMonth, dbReady, forceRecalcAndEmit]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const { AppState } = require('react-native');
    let last: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (last.match(/inactive|background/) && s === 'active') {
        const m = dayjs(currentMonth + '-01').add(1, 'month').format('YYYY-MM');
        if (!visitedMonthsRef.current.has(m)) {
          ensureMonthLoaded(m)
            .then(() => visitedMonthsRef.current.add(m))
            .then(() => forceRecalcAndEmit())
            .catch(() => {});
        } else {
          forceRecalcAndEmit();
        }
      }
      last = s;
    });
    return () => sub.remove();
  }, [currentMonth, forceRecalcAndEmit]);

  // 背景色
  const bgColor = bgImageUri ? 'transparent' : theme.appBg;
  const bgScrim = bgImageUri ? (theme.mode === 'dark' ? 'rgba(4,7,14,0.42)' : 'rgba(0,0,0,0.25)') : 'transparent';

  // ======== DayEventsSheet から「編集」を押した時：EventModal へ遷移 ========
  const onPressEditFromSheet = useCallback((row: any) => {
    if (!row) return;
    const eid = getEventIdFromRow(row);
    navigation.navigate('EventModal', {
      event_id: eid,
      calendar_id: row?.calendar_id ?? 'CAL_LOCAL_DEFAULT',
      title: row?.title ?? '',
      summary: row?.summary ?? '',
      start_date: String(row?.dtstart ?? sheetDate),
      end_date:   String(row?.dtend   ?? sheetDate),
      start_time: String(row?.start_at ?? '10:00'),
      end_time:   String(row?.end_at   ?? '11:00'),
      tz: row?.tz ?? 'local',
      color: row?.color,
      tags: Array.isArray(row?.tags) ? row.tags : [],
      visibility: row?.visibility ?? 'Hidden',
    } as any);
  }, [navigation, sheetDate]);

  // ==== UI ====
  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* 背景画像 & スクリーン */}
      {bgImageUri ? (
        <>
          <Image source={{ uri: bgImageUri }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: bgScrim }]} />
        </>
      ) : null}

      {/* ステータス */}
      {!schemaReady && <StatusBadge text="Loading profile & entities…" />}
      {schemaReady && syncing && <StatusBadge text="Sync server…" />}
      {syncTimedOut && <StatusBadge text="Sync timeout — local first" />}

      {/* カレンダー */}
      <View style={[styles.gridBlock, { backgroundColor: 'transparent' }]} onLayout={(e) => setGridH(Math.round(e.nativeEvent.layout.height))}>
        <View style={[styles.gridInner, { backgroundColor: 'transparent' }]} onLayout={(e) => setInnerW(e.nativeEvent.layout.width)}>
          {/* 曜日ヘッダ */}
          <View onLayout={(e) => setWeekHeaderH(Math.round(e.nativeEvent.layout.height))}>
            {innerW > 0 ? <WeekHeader colWBase={colWBase} colWLast={colWLast} /> : null}
          </View>

          {/* CalendarList */}
          <View style={{ overflow: 'hidden', backgroundColor: 'transparent' }}>
            {(pageHeight > 0 && innerW > 0) && (
              <CalendarList
                ref={calRef}
                key={`${innerW}x${cellH}x${weekHeaderH}x${pageHeight}x${FIRST_DAY}x${initialCurrent}`}
                firstDay={FIRST_DAY}
                current={initialCurrent}
                horizontal
                pagingEnabled
                calendarWidth={innerW}
                calendarHeight={pageHeight}
                hideDayNames
                renderHeader={() => null}
                style={{ height: pageHeight, backgroundColor: 'transparent' }}
                calendarStyle={{ paddingTop: 0, marginTop: 0, backgroundColor: 'transparent' }}
                pastScrollRange={120}
                futureScrollRange={120}
                minDate={'1900-01-01'}
                maxDate={'2100-12-31'}
                hideExtraDays={false}
                showSixWeeks
                onDayPress={(d: DateData) => {
                  const ds = d.dateString;
                  if (selected !== ds) { setSelected(ds); return; }
                  openSheet(ds);
                }}
                onVisibleMonthsChange={onVisibleMonthsChange}
                markedDates={marked}
                showScrollIndicator={false}
                theme={calendarTheme as any}
                contentContainerStyle={{ alignItems: 'flex-start', paddingHorizontal: 0, paddingTop: 0 }}
                dayComponent={renderDay as any}
                extraData={todayStr}
              />
            )}
          </View>
        </View>
      </View>

      {/* 左ドロワー */}
      <LeftDrawer
        open={left.open}
        width={Math.floor(Math.min(360, SCREEN_W * 0.84))}
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
        width={Math.floor(Math.min(360, SCREEN_W * 0.9))}
        translateX={right.x}
        close={right.closeDrawer}
        emoji="👤"
      />

      {/* Day Events シート */}
      <DayEventsSheet
        visible={sheetVisible}
        sheetY={sheetY}
        height={SHEET_MAX}
        date={sheetDate}
        items={sheetItems}
        onClose={closeSheet}
        onEndReached={onEndReached}
        rowHeight={64}
        onPressEdit={onPressEditFromSheet}
      />

      {/* 右下の FAB（新規作成 → EventModalへ遷移） */}
      <Pressable
        onPress={() => {
          const date = selected || todayStr;
          navigation.navigate('EventModal', {
            calendar_id: 'CAL_LOCAL_DEFAULT',
            title: '',
            summary: '',
            start_date: date,
            end_date: date,
            start_time: '10:00',
            end_time: '11:00',
            tz: 'local',
            color: undefined,
            tags: [],
            visibility: 'Hidden',
          } as any);
        }}
        hitSlop={10}
        style={{
          position: 'absolute', right: 18, bottom: 24, width: 56, height: 56, borderRadius: 28,
          backgroundColor: theme.overLayBg, alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          elevation: 6, borderWidth: HAIR_SAFE, borderColor: theme.border,
        }}
        accessibilityLabel="イベント作成画面を開く"
      >
        <Text style={{ color: theme.textPrimary, fontSize: 28, lineHeight: 28, marginTop: -2 }}>＋</Text>
      </Pressable>
    </View>
  );
}
