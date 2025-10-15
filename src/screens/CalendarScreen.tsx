// src/screens/CalendarScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { View, Text, Pressable, Platform, TextInput, KeyboardAvoidingView, Animated, Image, StyleSheet } from 'react-native';
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
  FIRST_DAY as FIRST_DAY_FALLBACK,
  PROFILE_ICON_SIZE,
} from './CalendarParts';

import LeftDrawer from './calendar/LeftDrawer';
import ProfileDrawer from './calendar/ProfileDrawer';
import DayEventsSheet from './calendar/DayEventsSheet';
import { useAnimatedDrawer } from './calendar/hooks/useAnimatedDrawer';
import { useMonthEvents } from './calendar/hooks/useMonthEvents';
import { styles } from './calendar/calendarStyles';

// テーマ
import { useAppTheme } from '../theme';

// ローカル保存＆時間ユーティリティ
import { loadLocalEvents, saveLocalEvent } from '../store/localEvents';
import { fromUTC, startOfLocalDay, endOfLocalDay } from '../utils/time';
import { CALENDARS } from '../store/seeds';

type Props = NativeStackScreenProps<RootStackParamList, 'Calendar'>;
type SortMode = 'span' | 'start';

// ===== 新スキーマ: ローダ =====
type ServerDocV2 = {
  version: number;
  profile?: {
    current_user_id?: string;
    default_tz?: string;
    locale?: string;
    profile_image_path?: string | null;
    username?: string | null;
    username_url?: string | null;
    display_name?: string | null;
    email?: string | null;
    updated_at?: string;
  };
  entities?: {
    organizations?: Record<string, { org_id: string; name: string; plan?: string; locale?: string; tz?: string }>;
    follows?: Record<string, { user_id: string; display_name?: string; profile_image_path?: string | null }>;
    groups?: Record<string, {
      group_id: string; owner_org_id?: string | null; owner_user_id?: string | null; name: string;
      updated_at?: string;
      members?: Record<string, { user_id: string; name?: string; role?: string; can_share?: string | boolean; can_invite?: string | boolean; }>;
    }>;
  };
  sync?: unknown;
  tombstones?: unknown;
};

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
    const m: any = await import('../store/appData');
    if (typeof m?.getAppData === 'function') return m.getAppData();
    if (m?.default && (m.default.server || m.default.prefs)) return m.default;
    return { server: m.server, prefs: m.prefs };
  } catch {
    return {};
  }
}

// ===== 旧ハードコード（フォールバック） =====
const ORGS_FALLBACK: EntityItem[] = [
  { id: 'org_me',   label: 'My Schedule', emoji: '🙂', kind: 'me' },
  { id: 'org_fam',  label: 'Family',      emoji: '👨‍👩‍👧‍👦', kind: 'org' },
  { id: 'org_team', label: 'Team',        emoji: '👥', kind: 'org' },
];

const GROUPS_BY_ORG_FALLBACK: Record<string, EntityItem[]> = {
  org_me:  [ { id: 'grp_me_private', label: 'Private', emoji: '🔒', kind: 'group' } ],
  org_fam: [
    { id: 'grp_fam_all',     label: 'All Members', emoji: '🏠', kind: 'group' },
    { id: 'grp_fam_parents', label: 'Parents',     emoji: '🧑‍🧑‍🧒', kind: 'group' },
  ],
  org_team: [
    { id: 'grp_team_all', label: 'All Hands', emoji: '🗓️', kind: 'group' },
    { id: 'grp_team_dev', label: 'Developers', emoji: '💻', kind: 'group' },
    { id: 'grp_team_des', label: 'Designers',  emoji: '🎨', kind: 'group' },
  ],
};

const FOLLOWS_FALLBACK: EntityItem[] = [
  { id: 'u1', label: 'Alice', emoji: '🧑‍💻', kind: 'user' },
  { id: 'u2', label: 'Bob',   emoji: '🎨',   kind: 'user' },
  { id: 'u3', label: 'Chris', emoji: '🎸',   kind: 'user' },
];

// ステータスバッジ（テーマ依存）
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

// EventInstance -> DayCell 変換（最小）
type EventSegmentMinimal = EventInstance & { spanLeft: boolean; spanRight: boolean };
const toLocalSegment = (ev: EventInstance): EventSegmentMinimal => ({ ...ev, spanLeft: false, spanRight: false });

// 重複キー
const dedupeKey = (ev: EventInstance) =>
  `${String(ev.calendar_id ?? '')}|${String(ev.title ?? '')}|${String(ev.start_at ?? '')}|${String(ev.end_at ?? '')}`;

export default function CalendarScreen({ navigation }: Props) {
  const theme = useAppTheme();

  // ===== 新スキーマロード =====
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

  // 背景画像URI（prefs.calendars の最初の background_image を使用）
  const bgImageUri = useMemo(() => {
    const all = Object.values(prefs?.calendars ?? {});
    const first = all.find(c => !!c?.background_image)?.background_image ?? null;
    return (typeof first === 'string' && first.length > 0) ? first : null;
  }, [prefs]);

  // ■ UI用マッピング
  const ORGS: EntityItem[] = useMemo(() => {
    const list: EntityItem[] = [];
    const displayName = server?.profile?.display_name || 'My Schedule';
    list.push({ id: 'org_me', label: displayName, emoji: '🙂', kind: 'me' });

    const orgs = Object.values(server?.entities?.organizations ?? {});
    for (const o of orgs) {
      list.push({ id: o.org_id, label: o.name, emoji: '🏢', kind: 'org' });
    }
    return list.length ? list : ORGS_FALLBACK;
  }, [server]);

  const GROUPS_BY_ORG: Record<string, EntityItem[]> = useMemo(() => {
    const map: Record<string, EntityItem[]> = {};
    map['org_me'] = [{ id: 'grp_me_private', label: 'Private', emoji: '🔒', kind: 'group' }];

    const groups = Object.values(server?.entities?.groups ?? {});
    for (const g of groups) {
      const ownerOrg = g.owner_org_id || 'org_me';
      (map[ownerOrg] ||= []).push({ id: g.group_id, label: g.name, emoji: '👥', kind: 'group' });
    }
    return Object.keys(map).length ? map : GROUPS_BY_ORG_FALLBACK;
  }, [server]);

  const FOLLOWS: EntityItem[] = useMemo(() => {
    const follows = Object.values(server?.entities?.follows ?? {}).map(f => ({
      id: f.user_id, label: f.display_name || f.user_id, emoji: '👤', kind: 'user' as const
    }));
    return follows.length ? follows : FOLLOWS_FALLBACK;
  }, [server]);

  // 週開始
  const FIRST_DAY = useMemo(() => {
    const wk = prefs?.display?.week_start;
    if (wk === 'mon') return 1;
    if (wk === 'sun') return 0;
    return FIRST_DAY_FALLBACK;
  }, [prefs]);

  // ===== 以降は従来ロジック =====
  const today = dayjs().format('YYYY-MM-DD');
  const [selected, setSelected] = useState<string>(today);
  const [currentMonth, setCurrentMonth] = useState<string>(dayjs().format('YYYY-MM'));
  const [sortMode, setSortMode] = useState<SortMode>('span');

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
  const SHEET_H = Math.floor(SCREEN_H * 0.6);

  // 段階ロード状態
  const [localLoaded, setLocalLoaded] = useState(false);
  const [dbReady, setDbReady] = useState(false);

  // ✅ 同期制御（タイムアウト強制終了に対応）
  const [syncing, setSyncing] = useState(false);
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const hasSyncedRef = useRef(false);
  const syncRunIdRef = useRef(0);

  // ドロワー
  const left = useAnimatedDrawer(Math.floor(Math.min(360, SCREEN_W * 0.84)), 'left');
  const right = useAnimatedDrawer(Math.floor(Math.min(360, SCREEN_W * 0.9)), 'right');

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

  // 初期カレンダー
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

  // 二重保存ロック
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  const initialCurrent = useRef(dayjs().startOf('month').format('YYYY-MM-DD')).current;

  // ★ CalendarList の参照
  const calRef = useRef<any>(null);

  // ページ高さ→行高さ（整数で厳密化）
  const pageHeight = useMemo(() => {
    if (gridH <= 0) return 0;
    const weekH = Math.max(weekHeaderH, 24);
    const usable = Math.max(0, gridH - MONTH_TITLE_HEIGHT - weekH);
    const cell = Math.max(1, Math.floor(usable / ROWS));
    return cell * ROWS;
  }, [gridH, weekHeaderH]);

  const cellH = useMemo(() => {
    if (pageHeight <= 0) return 0;
    return Math.floor(pageHeight / ROWS);
  }, [pageHeight]);

  // CalendarList 可否
  const [calReady, setCalReady] = useState(false);
  useEffect(() => {
    setCalReady(innerW > 0 && pageHeight > 0);
  }, [innerW, pageHeight]);

  // ★ レイアウト確定後に「今月」へ強制スクロール
  useEffect(() => {
    if (!calReady || !calRef.current) return;
    calRef.current?.scrollToMonth?.(initialCurrent, 0, true);
  }, [calReady, initialCurrent]);

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
  useEffect(() => () => { if (monthDebounceRef.current) clearTimeout(monthDebounceRef.current); }, []);

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

  // ==== 月データ（DB側）は dbReady まで停止 ====
  const deferredMonth = useDeferredValue(currentMonth);
  const monthDates = useMemo(() => getMonthRangeDates(deferredMonth), [deferredMonth]);
  const enabledMonthDates = dbReady ? monthDates : [];
  const { eventsByDate, overflowByDate } = useMonthEvents(
    enabledMonthDates,
    filterEventsByEntity,
    sortMode
  );

  // ローカル読み込み（ calReady を待たない ）
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const list = await loadLocalEvents();
      if (monthDates.length === 0) return;
      const monthStart = startOfLocalDay(monthDates[0]);
      const monthEnd   = endOfLocalDay(monthDates[monthDates.length - 1]);
      const map: Record<string, EventInstance[]> = {};
      for (const ev of list) {
        const s = fromUTC(ev.start_at); const e = fromUTC(ev.end_at);
        const clipStart = s.isAfter(monthStart) ? s : monthStart;
        const clipEnd   = e.isBefore(monthEnd) ? e : monthEnd;
        if (clipEnd.isBefore(clipStart)) continue;
        let d = clipStart.startOf('day'); const endDay = clipEnd.startOf('day');
        while (d.isBefore(endDay) || d.isSame(endDay)) {
          const key = d.format('YYYY-MM-DD'); (map[key] ||= []).push(ev); d = d.add(1, 'day');
        }
      }
      if (!cancelled) { setLocalByDate(map); setLocalLoaded(true); }
    };
    run();
    return () => { cancelled = true; setLocalLoaded(false); };
  }, [deferredMonth, monthDates]);

  // ===== DB同期（タイムアウトで"確実に"打ち切る：ランIDでレース無効化） =====
  useEffect(() => {
    if (!localLoaded || hasSyncedRef.current) return;

    const thisRunId = ++syncRunIdRef.current;
    let hardTimer: any = null;
    let finished = false;

    setSyncing(true);

    const finish = (opts: { ok: boolean; timedOut?: boolean }) => {
      if (finished) return;
      finished = true;
      if (syncRunIdRef.current !== thisRunId) return;
      hasSyncedRef.current = true;
      setDbReady(true);
      setSyncing(false);
      if (opts.timedOut) setSyncTimedOut(true);
      if (hardTimer) clearTimeout(hardTimer);
    };

    (async () => {
      try {
        const mod = (await import('../store/monthShard').catch(() => null)) as
          | { ensureMonthLoaded?: (m: string)=>Promise<void>; ensureMonthsLoaded?: (ms: string[])=>Promise<void> }
          | null;

        const center = dayjs(currentMonth + '-01');
        const months = [
          center.subtract(1,'month').format('YYYY-MM'),
          center.format('YYYY-MM'),
          center.add(1,'month').format('YYYY-MM')
        ];

        const ensurePromise = mod?.ensureMonthsLoaded
          ? mod.ensureMonthsLoaded(months)
          : mod?.ensureMonthLoaded
            ? Promise.all(months.map(m => mod.ensureMonthLoaded!(m)))
            : Promise.resolve();

        hardTimer = setTimeout(() => finish({ ok: false, timedOut: true }), 2500);
        await ensurePromise;
        finish({ ok: true });
      } catch {
        finish({ ok: false });
      }
    })();

    return () => { if (hardTimer) clearTimeout(hardTimer); };
  }, [localLoaded, currentMonth]);

  // タイムアウト通知は数秒で自動で消す
  useEffect(() => {
    if (!syncTimedOut) return;
    const t = setTimeout(() => setSyncTimedOut(false), 2500);
    return () => clearTimeout(t);
  }, [syncTimedOut]);

  // ヘッダ
  useEffect(() => {
    const showEmoji = selectedEntity.kind === 'group';
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
          <Text style={{ fontSize: 18 }}>🙂</Text>
        </View>
      </Pressable>
    );

    (navigation as any).setOptions({
      headerStyle: { backgroundColor: theme.appBg },
      headerTitleAlign: 'left',
      headerTitle: () => (
        <View style={styles.headerTitleRow}>
          {showEmoji ? (
            <View style={[styles.headerEmojiCircle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={styles.headerEmojiText}>👥</Text>
            </View>
          ) : null}
          <Text style={[styles.headerTitleText, { color: theme.textPrimary }]} numberOfLines={1}>
            {selectedEntity.label}
          </Text>
        </View>
      ),
      headerLeft,
      headerRight,
    });
  }, [navigation, selectedEntity, left.openDrawer, right.openDrawer, theme]);

  const marked = useMemo(() => ({ [selected]: { selected: true } }), [selected]);

  // 日別シート
  const openSheet = useCallback((dateStr: string) => {
    setSheetDate(dateStr);
    const dbList = dbReady ? (listInstancesByDate(dateStr) ?? []) : [];
    const merged = [ ...(localByDate[dateStr] ?? []), ...filterEventsByEntity(dbList) ];
    setSheetItems(merged.slice(0, 50));
    setSheetVisible(true);
    requestAnimationFrame(() => {
      sheetY.stopAnimation(); sheetY.setValue(SHEET_H);
      Animated.timing(sheetY, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    });
  }, [filterEventsByEntity, sheetY, SHEET_H, localByDate, dbReady]);

  const closeSheet = useCallback(() => {
    sheetY.stopAnimation();
    Animated.timing(sheetY, { toValue: SHEET_H, duration: 220, useNativeDriver: true }).start(() => setSheetVisible(false));
  }, [sheetY, SHEET_H]);

  const handleDayPress = useCallback((d: DateData) => { setSelected(d.dateString); openSheet(d.dateString); }, [openSheet]);

  const onEndReached = useCallback(() => {
    setSheetItems((prev) => {
      const dbList = dbReady ? (listInstancesByDate(sheetDate) ?? []) : [];
      const all = [ ...(localByDate[sheetDate] ?? []), ...filterEventsByEntity(dbList) ];
      if (prev.length >= all.length) return prev;
      const nextLen = Math.min(prev.length + 50, all.length);
      return all.slice(0, nextLen);
    });
  }, [sheetDate, filterEventsByEntity, localByDate, dbReady]);

  // CalendarList テーマ（背景画像がある時は透明化）
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
        dayContainer: { flex: 0, padding: 0, margin: 0, alignItems: 'flex-start', justifyContent: 'flex-start', width: undefined, backgroundColor: 'transparent' },
      },
      'stylesheet.day.basic': { base: { flex: 0, width: undefined, margin: 0, padding: 0, alignItems: 'stretch', justifyContent: 'flex-start', backgroundColor: 'transparent' } },
      'stylesheet.calendar-list.main': { calendar: { paddingLeft: 0, paddingRight: 0, paddingTop: 0, marginTop: 0, backgroundColor: 'transparent' } },
      'stylesheet.calendar.header': { header: { marginBottom: 0, paddingVertical: 0, height: 0, backgroundColor: 'transparent' } },
    };
  }, [bgImageUri, theme.appBg]);

  // DayCell（中日でも罫線を隠さない）
  const renderDay = useCallback(
    ({ date, state, marking, onPress }: any) => {
      const dateStr = date?.dateString as string;

      const dbSegsRaw = dbReady ? (eventsByDate[dateStr] ?? []) : [];
      const dbSegs = dbSegsRaw.map((s: any) => ({ ...s, spanLeft: false, spanRight: false }));

      const localSegs = (localByDate[dateStr] ?? []).map(toLocalSegment);

      const merged = [ ...dbSegs, ...localSegs ] as any[];
      const moreLocal = localSegs.length;
      const moreDb    = dbReady ? (overflowByDate[dateStr] ?? 0) : 0;

      return (
        <View style={{ height: cellH, overflow: 'hidden', backgroundColor: 'transparent' }}>
          <DayCell
            date={date}
            state={state}
            marking={marking}
            onPress={onPress}
            colWBase={colWBase}
            colWLast={colWLast}
            cellH={cellH}
            dayEvents={merged}
            hideRightDivider={false}
            moreCount={moreDb + moreLocal}
          />
        </View>
      );
    },
    [colWBase, colWLast, cellH, eventsByDate, overflowByDate, localByDate, dbReady]
  );

  // 先読み
  const visitedMonthsRef = useRef<Set<string>>(new Set());
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
        const mod = (await import('../store/monthShard').catch(() => null)) as
          | { ensureMonthLoaded?: (m: string)=>Promise<void>; ensureMonthsLoaded?: (ms: string[])=>Promise<void> }
          | null;
        if (mod?.ensureMonthsLoaded) await mod.ensureMonthsLoaded(targets);
        else if (mod?.ensureMonthLoaded) await Promise.all(targets.map((m) => mod.ensureMonthLoaded!(m)));
        targets.forEach((t) => visitedMonthsRef.current.add(t));
      } catch {}
    };
    run();
  }, [currentMonth, dbReady]);

  // iOS 復帰先読み
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

  const openHelp = useCallback(() => {
    setHelpVisible(true);
    requestAnimationFrame(() => {
      helpSheetY.stopAnimation(); helpSheetY.setValue(HELP_SHEET_H);
      Animated.timing(helpSheetY, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    });
  }, [helpSheetY, HELP_SHEET_H]);
  const closeHelp = useCallback(() => {
    helpSheetY.stopAnimation();
    Animated.timing(helpSheetY, { toValue: HELP_SHEET_H, duration: 220, useNativeDriver: true }).start(() => setHelpVisible(false));
  }, [helpSheetY, HELP_SHEET_H]);

  const injectTestEventsForThisMonth = useCallback(async () => {
    const monthStart = dayjs(currentMonth + '-01');
    const samples = [
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
    setLocalByDate(prev => { const next = { ...prev }; for (const { inst, dStr } of created) (next[dStr] ||= []).push(inst); return next; });
    if (sheetVisible) {
      const addedForSheet = created.filter(x => x.dStr === sheetDate).map(x => x.inst);
      if (addedForSheet.length > 0) setSheetItems(prev => [...addedForSheet, ...prev]);
    }
    closeHelp();
  }, [currentMonth, formCalId, sheetDate, sheetVisible, closeHelp]);

  // 背景（画像があれば透過、なければテーマの appBg）
  const bgColor = bgImageUri ? 'transparent' : theme.appBg;
  const bgScrim = bgImageUri
    ? (theme.mode === 'dark' ? 'rgba(4,7,14,0.42)' : 'rgba(0,0,0,0.25)')
    : 'transparent';

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* 背景画像 & スクリーン */}
      {bgImageUri ? (
        <>
          <Image source={{ uri: bgImageUri }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: bgScrim }]} />
        </>
      ) : null}

      {/* ステータスバッジ */}
      {!schemaReady && <StatusBadge text="Loading profile & entities…" />}
      {schemaReady && !localLoaded && <StatusBadge text="Load events…" />}
      {schemaReady && localLoaded && syncing && <StatusBadge text="Sync server…" />}
      {syncTimedOut && <StatusBadge text="Sync timeout — local first" />}

      {/* カレンダー */}
      <View style={[styles.gridBlock, { backgroundColor: 'transparent' }]} onLayout={(e) => setGridH(Math.round(e.nativeEvent.layout.height))}>
        {/* absolute 罫線（左端ラインを削除） */}
        <View style={styles.gridTopLine} />
        {/* <View style={styles.gridLeftLine} /> ← 削除 */}

        <View style={[styles.gridInner, { backgroundColor: 'transparent' }]} onLayout={(e) => setInnerW(e.nativeEvent.layout.width)}>
          {/* 月タイトル */}
          <View style={{ height: MONTH_TITLE_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={[styles.monthTitle, { color: theme.textPrimary }]}>{dayjs(currentMonth + '-01').format('YYYY MMM')}</Text>

              {/* ソートPill */}
              <View style={[styles.sortPills, { backgroundColor: 'transparent' }]}>
                <Pressable
                  onPress={() => setSortMode('span')}
                  style={[
                    styles.pill,
                    { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: HAIR_SAFE },
                    sortMode === 'span' && { backgroundColor: theme.accent, borderColor: theme.accent }
                  ]}
                >
                  <Text style={[
                    styles.pillText,
                    { color: theme.textSecondary, fontWeight: '700' },
                    sortMode === 'span' && { color: theme.accentText }
                  ]}>Span</Text>
                </Pressable>

                <Pressable
                  onPress={() => setSortMode('start')}
                  style={[
                    styles.pill,
                    { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: HAIR_SAFE },
                    sortMode === 'start' && { backgroundColor: theme.accent, borderColor: theme.accent }
                  ]}
                >
                  <Text style={[
                    styles.pillText,
                    { color: theme.textSecondary, fontWeight: '700' },
                    sortMode === 'start' && { color: theme.accentText }
                  ]}>Start</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* 曜日ヘッダー */}
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
                onDayPress={handleDayPress}
                onVisibleMonthsChange={onVisibleMonthsChange}
                markedDates={marked}
                showScrollIndicator={false}
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
        emoji="🙂"
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
        rowHeight={64}
      />

      {/* 右下 ＋ FAB */}
      <Pressable
        onPress={() => {
          setFormTitle('');
          setFormStart(dayjs(selected).hour(10).minute(0).format('YYYY-MM-DD HH:mm'));
          setFormEnd(dayjs(selected).hour(11).minute(0).format('YYYY-MM-DD HH:mm'));
          const list = Array.isArray(CALENDARS) ? CALENDARS : [];
          const safeCalId = (list.find(c => c?.name?.includes('My: Private'))?.calendar_id ?? list[0]?.calendar_id) ?? 'CAL_LOCAL_DEFAULT';
          setFormCalId(safeCalId);
          setAddVisible(true);
          requestAnimationFrame(() => {
            addSheetY.stopAnimation(); addSheetY.setValue(ADD_SHEET_H);
            Animated.timing(addSheetY, { toValue: 0, duration: 260, useNativeDriver: true }).start();
          });
        }}
        hitSlop={10}
        style={{
          position: 'absolute', right: 18, bottom: 24, width: 56, height: 56, borderRadius: 28,
          backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          elevation: 6, borderWidth: HAIR_SAFE, borderColor: theme.border,
        }}
      >
        <Text style={{ color: theme.textPrimary, fontSize: 28, lineHeight: 28, marginTop: -2 }}>＋</Text>
      </Pressable>

      {/* 左下 ？ FAB */}
      <Pressable
        onPress={openHelp}
        hitSlop={10}
        style={{
          position: 'absolute', left: 18, bottom: 24, width: 44, height: 44, borderRadius: 22,
          backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
          elevation: 4, borderWidth: HAIR_SAFE, borderColor: theme.border,
        }}
      >
        <Text style={{ color: theme.textPrimary, fontSize: 20, lineHeight: 20 }}>?</Text>
      </Pressable>

      {/* 追加ボトムシート（テーマ配色） */}
      {addVisible && (
        <Pressable
          onPress={() => { addSheetY.stopAnimation(); Animated.timing(addSheetY, { toValue: ADD_SHEET_H, duration: 220, useNativeDriver: true }).start(() => setAddVisible(false)); }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <Animated.View
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: ADD_SHEET_H,
                backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
                borderWidth: HAIR_SAFE, borderColor: theme.border, padding: 16,
                transform: [{ translateY: addSheetY }],
              }}
            >
              <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center', marginBottom: 12 }} />
              <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 12, color: theme.textPrimary }}>Add Event (Local JSON)</Text>

              <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>Title</Text>
              <TextInput
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="e.g. Meeting"
                placeholderTextColor={theme.textSecondary}
                selectionColor={theme.accent}
                style={{
                  borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 12,
                  color: theme.textPrimary, backgroundColor: theme.appBg,
                }}
              />

              <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>Start (YYYY-MM-DD HH:mm)</Text>
              <TextInput
                value={formStart}
                onChangeText={setFormStart}
                placeholder="2025-10-06 10:00"
                placeholderTextColor={theme.textSecondary}
                selectionColor={theme.accent}
                style={{
                  borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 12,
                  color: theme.textPrimary, backgroundColor: theme.appBg,
                }}
              />

              <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>End (YYYY-MM-DD HH:mm)</Text>
              <TextInput
                value={formEnd}
                onChangeText={setFormEnd}
                placeholder="2025-10-06 11:00"
                placeholderTextColor={theme.textSecondary}
                selectionColor={theme.accent}
                style={{
                  borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 12,
                  color: theme.textPrimary, backgroundColor: theme.appBg,
                }}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                <Pressable
                  onPress={() => { addSheetY.stopAnimation(); Animated.timing(addSheetY, { toValue: ADD_SHEET_H, duration: 220, useNativeDriver: true }).start(() => setAddVisible(false)); }}
                  style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.border }}
                >
                  <Text style={{ fontWeight: '700', color: theme.textPrimary }}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={async () => {
                    if (savingRef.current) return; savingRef.current = true; setIsSaving(true);
                    try {
                      if (!formTitle.trim()) return;
                      const cal = (Array.isArray(CALENDARS) ? CALENDARS : []).find(c => c?.calendar_id === formCalId);
                      const inst = await saveLocalEvent({
                        calendar_id: formCalId, title: formTitle.trim(), startLocalISO: formStart, endLocalISO: formEnd, color: cal?.color ?? undefined,
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
                      addSheetY.stopAnimation();
                      Animated.timing(addSheetY, { toValue: ADD_SHEET_H, duration: 220, useNativeDriver: true }).start(() => setAddVisible(false));
                    } finally { setIsSaving(false); savingRef.current = false; }
                  }}
                  disabled={isSaving}
                  style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: isSaving ? theme.border : theme.accent }}
                >
                  <Text style={{ color: isSaving ? theme.textSecondary : theme.accentText, fontWeight: '800' }}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </Pressable>
      )}
    </View>
  );
}
