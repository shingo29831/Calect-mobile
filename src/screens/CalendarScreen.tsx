// src/screens/CalendarScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import {
  View, Text, Pressable, Platform, TextInput, KeyboardAvoidingView, Animated,
  Image, StyleSheet, Switch, PanResponder, GestureResponderEvent, PanResponderGestureState, ScrollView
} from 'react-native';
import type { AppStateStatus } from 'react-native';
import { CalendarList } from 'react-native-calendars';
import { Calendar as MiniCalendar } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import dayjs from '../lib/dayjs';
import { listInstancesByDate, createEventLocal, getAllTags } from '../store/db';
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
import { useAppTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Calendar'>;
type SortMode = 'span' | 'start';

// ===== 新スキーマ: ローダ =====
type ServerDocV2 = {
  version: number;
  profile?: { current_user_id?: string; default_tz?: string; locale?: string; profile_image_path?: string | null;
    username?: string | null; username_url?: string | null; display_name?: string | null; email?: string | null; updated_at?: string; };
  entities?: {
    organizations?: Record<string, { org_id: string; name: string; plan?: string; locale?: string; tz?: string }>;
    follows?: Record<string, { user_id: string; display_name?: string; profile_image_path?: string | null }>;
    groups?: Record<string, { group_id: string; owner_org_id?: string | null; owner_user_id?: string | null; name: string; updated_at?: string;
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

// ステータスバッジ
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

  // 背景画像
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
    for (const o of orgs) list.push({ id: o.org_id, label: o.name, emoji: '🏢', kind: 'org' });
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

  // ====== 日別イベントシート最大高さ（上まで伸ばす先） ======
  const SHEET_MAX = Math.floor(SCREEN_H * 0.8);

  // DB準備フラグ
  const [dbReady, setDbReady] = useState(false);

  // ✅ 同期制御
  const [syncing, setSyncing] = useState(false);
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const hasSyncedRef = useRef(false);
  const syncRunIdRef = useRef(0);

  // ドロワー
  const left = useAnimatedDrawer(Math.floor(Math.min(360, SCREEN_W * 0.84)), 'left');
  const right = useAnimatedDrawer(Math.floor(Math.min(360, SCREEN_W * 0.9)), 'right');

  // 日別イベントシート（表示切替は boolean のみ／アニメは DayEventsSheet が担当）
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetDate, setSheetDate] = useState<string>(today);
  const [sheetItems, setSheetItems] = useState<any[]>([]);
  // 互換のため保持（DayEventsSheet は使用しない）
  const sheetY = useRef(new Animated.Value(0)).current;

  // 追加用ボトムシート（ドラッグ対応）
  const [addVisible, setAddVisible] = useState(false);
  const MAX_SHEET_H = Math.floor(SCREEN_H * 0.9); // シート自体の最大高さ
  const SNAP_HEIGHTS = [
    Math.floor(SCREEN_H * 0.40),
    Math.floor(SCREEN_H * 0.65),
    Math.floor(SCREEN_H * 0.90),
  ]; // 表示領域の高さ（小/中/大）
  const [currentSnap, setCurrentSnap] = useState(1); // 0..2
  const addSheetTranslateY = useRef(new Animated.Value(MAX_SHEET_H)).current; // 画面下からのスライド量

  const openAddSheet = useCallback((snapIndex: number) => {
    setCurrentSnap(snapIndex);
    const visibleH = SNAP_HEIGHTS[snapIndex];
    const targetY = MAX_SHEET_H - visibleH;
    addSheetTranslateY.stopAnimation();
    Animated.timing(addSheetTranslateY, { toValue: targetY, duration: 260, useNativeDriver: true }).start();
  }, [MAX_SHEET_H, SNAP_HEIGHTS, addSheetTranslateY]);

  const closeAddSheet = useCallback(() => {
    addSheetTranslateY.stopAnimation();
    Animated.timing(addSheetTranslateY, { toValue: MAX_SHEET_H, duration: 220, useNativeDriver: true }).start(() => setAddVisible(false));
  }, [MAX_SHEET_H, addSheetTranslateY]);

  // ▼ 追加：ワンタップ最大化
  const expandAddSheet = useCallback(() => {
    const snapIndex = SNAP_HEIGHTS.length - 1; // 最大スナップ
    setCurrentSnap(snapIndex);
    const visibleH = SNAP_HEIGHTS[snapIndex];
    const targetY = MAX_SHEET_H - visibleH;
    addSheetTranslateY.stopAnimation();
    Animated.timing(addSheetTranslateY, { toValue: targetY, duration: 220, useNativeDriver: true }).start();
  }, [SNAP_HEIGHTS, MAX_SHEET_H, addSheetTranslateY]);

  // ===== ドラッグ（PanResponder）— ScrollView が先頭の時のみ奪取 =====
  const DRAG_ACTIVATE_DY = 6;
  const scrollYRef = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => {
        const atTop = scrollYRef.current <= 0 + 1; // 多少の誤差を許容
        return atTop && Math.abs(g.dy) > DRAG_ACTIVATE_DY && Math.abs(g.dy) > Math.abs(g.dx);
      },
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_e, g) => {
        const atTop = scrollYRef.current <= 0 + 1;
        return atTop && Math.abs(g.dy) > DRAG_ACTIVATE_DY && Math.abs(g.dy) > Math.abs(g.dx);
      },
      onPanResponderGrant: () => {
        addSheetTranslateY.stopAnimation();
      },
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const baseY = MAX_SHEET_H - SNAP_HEIGHTS[currentSnap];
        let nextY = baseY + g.dy;
        const minY = MAX_SHEET_H - SNAP_HEIGHTS[SNAP_HEIGHTS.length - 1]; // 最大展開
        const maxY = MAX_SHEET_H; // 完全に隠す位置
        if (nextY < minY) nextY = minY;
        if (nextY > maxY) nextY = maxY;
        addSheetTranslateY.setValue(nextY);
      },
      onPanResponderRelease: (_e, g) => {
        const currentY = (addSheetTranslateY as any).__getValue?.() ?? MAX_SHEET_H;
        const snapTargets = SNAP_HEIGHTS.map(h => MAX_SHEET_H - h);

        // ほぼ最下部：閉じる
        const NEAR_BOTTOM_PX = 16;
        if (currentY >= MAX_SHEET_H - NEAR_BOTTOM_PX) {
          Animated.timing(addSheetTranslateY, { toValue: MAX_SHEET_H, duration: 160, useNativeDriver: true })
            .start(() => setAddVisible(false));
          return;
        }

        // 下方向に速いフリック：閉じる
        if (g.vy > 1.0 || (g.dy > 80 && Math.abs(g.vy) > 0.2)) {
          Animated.timing(addSheetTranslateY, { toValue: MAX_SHEET_H, duration: 180, useNativeDriver: true })
            .start(() => setAddVisible(false));
          return;
        }

        // 最寄りスナップへ
        let nearest = 0;
        let best = Infinity;
        snapTargets.forEach((y, i) => {
          const d = Math.abs(currentY - y);
          if (d < best) { best = d; nearest = i; }
        });
        setCurrentSnap(nearest);
        Animated.timing(addSheetTranslateY, { toValue: snapTargets[nearest], duration: 180, useNativeDriver: true }).start();
      },
    })
  ).current;

  // 追加フォーム
  const [formTitle, setFormTitle] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formAllDay, setFormAllDay] = useState(false);
  const [formColor, setFormColor] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [allTags, setAllTags] = useState<string[]>([]); // 既存タグ（DBから）
  useEffect(() => { setAllTags(getAllTags()); }, [addVisible]); // 開くたびに更新

  const [startDate, setStartDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [endDate, setEndDate]     = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [startTime, setStartTime] = useState<string>('10:00');
  const [endTime, setEndTime]     = useState<string>('11:00');

  // ポップアップ（どちらのカレンダーを開くか）
  const [startCalOpen, setStartCalOpen] = useState(false);
  const [endCalOpen, setEndCalOpen]     = useState(false);

  const DEFAULT_CAL_ID = 'CAL_LOCAL_DEFAULT';
  const [formCalId, setFormCalId] = useState<string>(DEFAULT_CAL_ID);

  const [refreshKey, setRefreshKey] = useState(0);
  const initialCurrent = useRef(dayjs().startOf('month').format('YYYY-MM-DD')).current;

  // ★ CalendarList の参照
  const calRef = useRef<any>(null);

  // ページ高さ→行高さ
  const pageHeight = useMemo(() => {
    if (gridH <= 0) return 0;
    const weekH = Math.max(weekHeaderH, 24);
    const usable = Math.max(0, gridH - MONTH_TITLE_HEIGHT - weekH);
    const cell = Math.max(1, Math.floor(usable / ROWS));
    return cell * ROWS;
  }, [gridH, weekHeaderH]);

  const cellH = useMemo(() => (pageHeight <= 0 ? 0 : Math.floor(pageHeight / ROWS)), [pageHeight]);

  // CalendarList 可否
  const [calReady, setCalReady] = useState(false);
  useEffect(() => { setCalReady(innerW > 0 && pageHeight > 0); }, [innerW, pageHeight]);

  useEffect(() => { if (!calReady || !calRef.current) return; calRef.current?.scrollToMonth?.(initialCurrent, 0, true); }, [calReady, initialCurrent]);

  // ==== 月ヘッダ切替：デバウンス ====
  const monthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onVisibleMonthsChange = useCallback((months: Array<{ year: number; month: number }>) => {
    if (!months?.length) return;
    const m = months[0];
    const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
    if (monthDebounceRef.current) clearTimeout(monthDebounceRef.current);
    monthDebounceRef.current = setTimeout(() => { setCurrentMonth((prev) => (prev === key ? prev : key)); }, 80);
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

  // ==== 月データ ====
  const deferredMonth = useDeferredValue(currentMonth);
  const monthDates = useMemo(() => getMonthRangeDates(deferredMonth), [deferredMonth]);
  const enabledMonthDates = dbReady ? monthDates : [];
  const { eventsByDate, overflowByDate } = useMonthEvents(enabledMonthDates, filterEventsByEntity, sortMode, refreshKey);

  // ===== DB同期（タイムアウト） =====
  useEffect(() => {
    if (hasSyncedRef.current) return;

    const thisRunId = ++syncRunIdRef.current;
    let hardTimer: any = null;
    let finished = false;

    setSyncing(true);
    const finish = (opts: { ok: boolean; timedOut?: boolean }) => {
      if (finished) return;
      finished = true;
      if (syncRunIdRef.current !== thisRunId) return;
      hasSyncedRef.current = true; setDbReady(true); setSyncing(false);
      if (opts.timedOut) setSyncTimedOut(true);
      if (hardTimer) clearTimeout(hardTimer);
    };

    (async () => {
      try {
        const mod = (await import('../store/monthShard').catch(() => null)) as
          | { ensureMonthLoaded?: (m: string)=>Promise<void>; ensureMonthsLoaded?: (ms: string[])=>Promise<void> }
          | null;

        const center = dayjs(currentMonth + '-01');
        const months = [center.subtract(1,'month').format('YYYY-MM'), center.format('YYYY-MM'), center.add(1,'month').format('YYYY-MM')];

        const ensurePromise = mod?.ensureMonthsLoaded
          ? mod.ensureMonthsLoaded(months)
          : mod?.ensureMonthLoaded
            ? Promise.all(months.map(m => mod.ensureMonthLoaded!(m)))
            : Promise.resolve();

        hardTimer = setTimeout(() => finish({ ok: false, timedOut: true }), 2500);
        await ensurePromise;
        finish({ ok: true });
      } catch { finish({ ok: false }); }
    })();

    return () => { if (hardTimer) clearTimeout(hardTimer); };
  }, [currentMonth]);

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

  // 日別シート（表示切替のみ／DayEventsSheet がアニメ & 操作を内包）
  const openSheet = useCallback((dateStr: string) => {
    setSheetDate(dateStr);
    const dbList = dbReady ? filterEventsByEntity(listInstancesByDate(dateStr) ?? []) : [];
    setSheetItems(dbList.slice(0, 50));
    setSheetVisible(true);
  }, [filterEventsByEntity, dbReady]);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
  }, []);

  const handleDayPress = useCallback((d: DateData) => { setSelected(d.dateString); openSheet(d.dateString); }, [openSheet]);

  const onEndReached = useCallback(() => {
    setSheetItems((prev) => {
      const dbList = dbReady ? filterEventsByEntity(listInstancesByDate(sheetDate) ?? []) : [];
      if (prev.length >= dbList.length) return prev;
      const nextLen = Math.min(prev.length + 50, dbList.length);
      return dbList.slice(0, nextLen);
    });
  }, [sheetDate, filterEventsByEntity, dbReady]);

  // CalendarList テーマ
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

  // DayCell
  const renderDay = useCallback(
    ({ date, state, marking, onPress }: any) => {
      const dateStr = date?.dateString as string;
      const dbSegs = dbReady ? (eventsByDate[dateStr] ?? []) : [];
      const moreDb = dbReady ? (overflowByDate[dateStr] ?? 0) : 0;
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
            dayEvents={dbSegs}
            hideRightDivider={false}
            moreCount={moreDb}
          />
        </View>
      );
    },
    [colWBase, colWLast, cellH, eventsByDate, overflowByDate, dbReady]
  );

  // 先読みなど（省略なし）
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

  // 背景
  const bgColor = bgImageUri ? 'transparent' : theme.appBg;
  const bgScrim = bgImageUri ? (theme.mode === 'dark' ? 'rgba(4,7,14,0.42)' : 'rgba(0,0,0,0.25)') : 'transparent';

  // ====== タグ操作 ======
  const addTag = useCallback((tRaw?: string) => {
    const raw = (tRaw ?? tagInput).trim();
    if (!raw) return;
    if (tags.includes(raw)) { if (!tRaw) setTagInput(''); return; }
    setTags((prev) => [...prev, raw]);
    if (!tRaw) setTagInput('');
  }, [tagInput, tags]);

  const removeTag = useCallback((t: string) => {
    setTags((prev) => prev.filter(x => x !== t));
  }, []);

  // 似たタグ候補（前方一致を優先、その後部分一致）
  const similarTagCandidates = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [] as string[];
    const notSelected = allTags.filter(t => !tags.includes(t));
    const starts = notSelected.filter(t => t.toLowerCase().startsWith(q));
    const contains = notSelected.filter(t => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 8);
  }, [tagInput, allTags, tags]);

  // All day 切替時に時間を自動補正
  const onToggleAllDay = useCallback((v: boolean) => {
    setFormAllDay(v);
    if (v) { setStartTime('00:00'); setEndTime('23:59'); }
  }, []);

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
      {schemaReady && syncing && <StatusBadge text="Sync server…" />}
      {syncTimedOut && <StatusBadge text="Sync timeout — local first" />}

      {/* カレンダー */}
      <View style={[styles.gridBlock, { backgroundColor: 'transparent' }]} onLayout={(e) => setGridH(Math.round(e.nativeEvent.layout.height))}>
        <View style={styles.gridTopLine} />
        <View style={styles.gridLeftLine} />

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
        height={SHEET_MAX}
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
          setFormSummary('');
          setFormAllDay(false);
          setFormColor('');
          setTags([]);
          setTagInput('');
          setAllTags(getAllTags());

          setStartDate(selected);
          setEndDate(selected);
          setStartTime('10:00');
          setEndTime('11:00');
          setFormCalId(DEFAULT_CAL_ID);

          setAddVisible(true);
          requestAnimationFrame(() => {
            // 初期は中サイズでオープン
            openAddSheet(1);
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

      {/* 追加ボトムシート（スクロール領域拡大 + 先頭のみドラッグ奪取） */}
      {addVisible && (
        <Pressable
          onPress={closeAddSheet}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <Animated.View
              {...panResponder.panHandlers}
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: MAX_SHEET_H,
                backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
                borderWidth: HAIR_SAFE, borderColor: theme.border,
                transform: [{ translateY: addSheetTranslateY }],
              }}
            >
              {/* ヘッダー（タップで最大化） */}
              <Pressable onPress={expandAddSheet} style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
                <View style={{ alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: theme.border }} />
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 6 }}>
                    Swipe anywhere to resize
                  </Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: theme.textPrimary }}>
                  Add Event (Local JSON)
                </Text>
              </Pressable>

              {/* 本文ラッパー：flex:1 + minHeight:0 でスクロール領域を最大化 */}
              <View style={{ flex: 1, minHeight: 0 }}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                  scrollEventThrottle={16}
                  contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 24 }}
                  style={{ flex: 1 }}
                >
                  {/* タイトル入力 */}
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

                  {/* 説明/メモ（summary） */}
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>Summary / Notes</Text>
                  <TextInput
                    value={formSummary}
                    onChangeText={setFormSummary}
                    placeholder="optional description"
                    placeholderTextColor={theme.textSecondary}
                    selectionColor={theme.accent}
                    multiline
                    style={{
                      borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 12,
                      minHeight: 68, color: theme.textPrimary, backgroundColor: theme.appBg,
                    }}
                  />

                  {/* 色（#HEX）＋ 終日 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>Color (#HEX)</Text>
                      <TextInput
                        value={formColor}
                        onChangeText={setFormColor}
                        autoCapitalize="none"
                        placeholder="#2563EB"
                        placeholderTextColor={theme.textSecondary}
                        selectionColor={theme.accent}
                        style={{
                          borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                          paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
                          color: theme.textPrimary, backgroundColor: theme.appBg,
                        }}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>All day</Text>
                      <Switch value={formAllDay} onValueChange={onToggleAllDay} />
                    </View>
                  </View>

                  {/* ===== 日付（ポップアップ） ===== */}
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>Dates</Text>

                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {/* 開始日 */}
                      <Pressable
                        onPress={() => { setStartCalOpen(true); setEndCalOpen(false); }}
                        style={{
                          flex: 1, borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                          paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.appBg
                        }}
                      >
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>Start</Text>
                        <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '700' }}>
                          {dayjs(startDate).format('YYYY-MM-DD')}
                        </Text>
                      </Pressable>

                      {/* 終了日 */}
                      <Pressable
                        onPress={() => { setEndCalOpen(true); setStartCalOpen(false); }}
                        style={{
                          flex: 1, borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                          paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.appBg
                        }}
                      >
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>End</Text>
                        <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '700' }}>
                          {dayjs(endDate).format('YYYY-MM-DD')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* ===== 時刻入力（HH:mm） ===== */}
                  {!formAllDay && (
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>
                          Start time (HH:mm)
                        </Text>
                        <TextInput
                          value={startTime}
                          onChangeText={setStartTime}
                          placeholder="10:00"
                          keyboardType="numbers-and-punctuation"
                          placeholderTextColor={theme.textSecondary}
                          selectionColor={theme.accent}
                          style={{
                            borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                            paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 12,
                            color: theme.textPrimary, backgroundColor: theme.appBg,
                          }}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>
                          End time (HH:mm)
                        </Text>
                        <TextInput
                          value={endTime}
                          onChangeText={setEndTime}
                          placeholder="11:00"
                          keyboardType="numbers-and-punctuation"
                          placeholderTextColor={theme.textSecondary}
                          selectionColor={theme.accent}
                          style={{
                            borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                            paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 12,
                            color: theme.textPrimary, backgroundColor: theme.appBg,
                          }}
                        />
                      </View>
                    </View>
                  )}

                  {/* ===== タグ ===== */}
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4, marginBottom: 6 }}>Tags</Text>

                  {/* 既存タグセレクタ（選択済みを除く） */}
                  {allTags.filter(t => !tags.includes(t)).length > 0 && (
                    <View style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 6 }}>Pick from existing</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {allTags.filter(t => !tags.includes(t)).slice(0, 24).map(t => (
                          <Pressable
                            key={`opt-${t}`}
                            onPress={() => addTag(t)}
                            style={{
                              paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
                              backgroundColor: theme.surface, borderWidth: HAIR_SAFE, borderColor: theme.border
                            }}
                          >
                            <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>#{t}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* 選択中のタグ */}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    {tags.map((t) => (
                      <Pressable
                        key={`sel-${t}`}
                        onPress={() => removeTag(t)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
                          backgroundColor: `${theme.accent}22`, borderWidth: HAIR_SAFE, borderColor: theme.accent
                        }}
                      >
                        <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>#{t}</Text>
                        <Text style={{ color: theme.accent }}>×</Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* 入力 + 追加 */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={tagInput}
                      onChangeText={setTagInput}
                      onSubmitEditing={() => addTag()}
                      placeholder="タグを入力して Enter（新規作成可）"
                      placeholderTextColor={theme.textSecondary}
                      selectionColor={theme.accent}
                      style={{
                        flex: 1,
                        borderWidth: HAIR_SAFE, borderColor: theme.border, borderRadius: 10,
                        paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
                        color: theme.textPrimary, backgroundColor: theme.appBg,
                      }}
                    />
                    <Pressable
                      onPress={() => addTag()}
                      style={{ paddingHorizontal: 14, borderRadius: 10, backgroundColor: theme.accent, justifyContent: 'center' }}
                    >
                      <Text style={{ color: theme.accentText, fontWeight: '800' }}>Add</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>

              {/* ===== 日付ポップアップ（ミニカレンダー） ===== */}
              {(startCalOpen || endCalOpen) && (
                <View style={{
                  position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
                  alignItems: 'center', justifyContent: 'center', zIndex: 20
                }}>
                  {/* 背景タップで閉じる */}
                  <Pressable
                    onPress={() => { setStartCalOpen(false); setEndCalOpen(false); }}
                    style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                  />
                  <View style={{
                    width: Math.min(SCREEN_W - 32, 360),
                    borderRadius: 12, borderWidth: HAIR_SAFE, borderColor: theme.border,
                    backgroundColor: theme.surface, overflow: 'hidden'
                  }}>
                    <MiniCalendar
                      firstDay={FIRST_DAY}
                      initialDate={startCalOpen ? startDate : endDate}
                      markedDates={{ [startCalOpen ? startDate : endDate]: { selected: true } }}
                      hideExtraDays={false}
                      enableSwipeMonths
                      theme={{
                        backgroundColor: theme.surface,
                        calendarBackground: theme.surface,
                        dayTextColor: theme.textPrimary,
                        textDisabledColor: theme.dayDisabled,
                        monthTextColor: theme.textPrimary,
                        todayTextColor: theme.accent,
                        selectedDayTextColor: theme.accentText,
                        selectedDayBackgroundColor: theme.accent,
                        arrowColor: theme.textPrimary,
                        textDayFontWeight: '700',
                        textMonthFontWeight: '800',
                      }}
                      onDayPress={(d: DateData) => {
                        const nd = d.dateString;
                        if (startCalOpen) {
                          setStartDate(nd);
                          if (dayjs(endDate).isBefore(dayjs(nd))) setEndDate(nd);
                          setStartCalOpen(false);
                        } else {
                          if (dayjs(nd).isBefore(dayjs(startDate))) setEndDate(startDate);
                          else setEndDate(nd);
                          setEndCalOpen(false);
                        }
                      }}
                    />
                  </View>
                </View>
              )}

              {/* アクション（フッター固定） */}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, padding: 16, paddingTop: 8 }}>
                <Pressable
                  onPress={closeAddSheet}
                  style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.border }}
                >
                  <Text style={{ fontWeight: '700', color: theme.textPrimary }}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={async () => {
                    const saving = (CalendarScreen as any).__saving;
                    if (saving) return;
                    (CalendarScreen as any).__saving = true;
                    try {
                      if (!formTitle.trim()) return;

                      // 時刻正規化
                      const norm = (t: string) => {
                        const m = String(t || '').match(/^(\d{1,2}):(\d{1,2})$/);
                        if (!m) return null;
                        const hh = String(Math.max(0, Math.min(23, Number(m[1])))).padStart(2, '0');
                        const mm = String(Math.max(0, Math.min(59, Number(m[2])))).padStart(2, '0');
                        return `${hh}:${mm}`;
                      };

                      // All day は 00:00–23:59 に強制
                      const st = formAllDay ? '00:00' : norm(startTime);
                      const et = formAllDay ? '23:59' : norm(endTime);
                      if (!st || !et) return;

                      // 日付整合
                      let sDate = startDate;
                      let eDate = endDate;
                      if (dayjs(eDate).isBefore(dayjs(sDate))) eDate = sDate;

                      const startIso = dayjs(`${sDate} ${st}`).format('YYYY-MM-DD HH:mm');
                      const endIso   = dayjs(`${eDate} ${et}`).format('YYYY-MM-DD HH:mm');

                      if (!dayjs(endIso).isAfter(dayjs(startIso))) return;

                      // color 入力は #HEX 簡易バリデーション
                      const color = (formColor || '').trim();
                      const validColor = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : undefined;

                      // 保存
                      await createEventLocal({
                        calendar_id: formCalId,
                        title: formTitle.trim(),
                        summary: formSummary.trim(),
                        color: validColor,
                        style: tags.length ? { tags } : undefined,
                        start_at: startIso,
                        end_at:   endIso,
                      });

                      // タグ一覧を即時更新（UX向上）
                      if (tags.length) setAllTags(getAllTags());

                      const dStr = dayjs(startIso).format('YYYY-MM-DD');
                      setRefreshKey(v => v + 1);
                      if (sheetVisible && sheetDate === dStr) {
                        setSheetItems((filterEventsByEntity(listInstancesByDate(dStr) ?? [])).slice(0, 50));
                      }

                      closeAddSheet();
                    } finally {
                      (CalendarScreen as any).__saving = false;
                    }
                  }}
                  style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.accent }}
                >
                  <Text style={{ color: theme.accentText, fontWeight: '800' }}>Save</Text>
                </Pressable>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </Pressable>
      )}
    </View>
  );
}
