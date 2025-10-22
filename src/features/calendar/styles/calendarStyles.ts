// src/features/calendar/styles/calendarStyles.ts
// -----------------------------------------------------------------------------
// カレンダー画面 共通スタイル（全置換版 / 2025-10-22）
// - Text用プロップ numberOfLines を style から削除（TS2345対策）
// - .StyleSheet.absoluteFillObject の誤記を解消
// -----------------------------------------------------------------------------

import { StyleSheet, Dimensions, PixelRatio } from 'react-native';

export const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

const hairRaw = StyleSheet.hairlineWidth;
export const HAIR_SAFE = Math.max(hairRaw, 0.5);

export const LINE_W = PixelRatio.roundToNearestPixel(1.5);

export const MONTH_TITLE_HEIGHT = 44;
export const WEEKROW_HEIGHT = 32;
export const DAY_CELL_MIN_HEIGHT = 64;

export const EVENT_BAR_HEIGHT = 18;
export const EVENT_BAR_RADIUS = 6;
export const EVENT_GAP_V = 3;
export const EVENT_GAP_H = 4;

export const MORE_BADGE_H = 18;
export const MORE_BADGE_RADIUS = 9;
export const MORE_DOT_SIZE = 4;

export type CalendarTheme = {
  colors: {
    background: string;
    surface: string;
    surfaceVariant?: string;
    onSurface: string;
    onSurfaceVariant?: string;
    primary: string;
    primaryContainer?: string;
    outline: string;
    overlay?: string;
    focus?: string;
    danger?: string;
    success?: string;
  };
  typography?: {
    xs?: { fontSize: number; fontWeight?: any };
    sm?: { fontSize: number; fontWeight?: any };
    md?: { fontSize: number; fontWeight?: any };
    lg?: { fontSize: number; fontWeight?: any };
  };
  roundness?: number;
};

export const makeCalendarStyles = (t: CalendarTheme) => {
  const round = t.roundness ?? 12;

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.colors.background,
    },

    monthHeader: {
      height: MONTH_TITLE_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      borderBottomWidth: HAIR_SAFE,
      borderBottomColor: t.colors.outline,
      backgroundColor: t.colors.surface,
    },
    monthTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: t.colors.onSurface,
    },
    monthNavBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: round,
      backgroundColor: t.colors.surfaceVariant ?? t.colors.surface,
    },
    monthNavBtnText: {
      fontSize: 14,
      color: t.colors.onSurface,
    },

    weekHeader: {
      height: WEEKROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: HAIR_SAFE,
      borderBottomColor: t.colors.outline,
      backgroundColor: t.colors.surface,
    },
    weekHeaderCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekHeaderText: {
      fontSize: 12,
      fontWeight: '600',
      color: t.colors.onSurfaceVariant ?? t.colors.onSurface,
    },

    monthGrid: {
      flex: 1,
      backgroundColor: t.colors.background,
    },
    weekRow: {
      flexDirection: 'row',
      borderBottomWidth: HAIR_SAFE,
      borderBottomColor: t.colors.outline,
      minHeight: DAY_CELL_MIN_HEIGHT,
    },

    dayCell: {
      flex: 1,
      borderRightWidth: HAIR_SAFE,
      borderRightColor: t.colors.outline,
      backgroundColor: t.colors.surface,
    },
    dayCellInner: {
      flex: 1,
      paddingHorizontal: 6,
      paddingTop: 6,
      paddingBottom: 4,
    },

    dateBadgeWrap: {
      position: 'absolute',
      top: 6,
      right: 6,
      alignItems: 'flex-end',
    },
    dateBadge: {
      minWidth: 24,
      height: 24,
      paddingHorizontal: 6,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surfaceVariant ?? t.colors.surface,
    },
    dateBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: t.colors.onSurface,
    },
    dateBadgeToday: {
      backgroundColor: t.colors.success,
    },
    dateBadgeTodayText: {
      color: '#ffffff',
    },
    dateBadgeOutside: {
      opacity: 0.5,
    },
    dateBadgeWeekend: {
      color: t.colors.danger,
    },

    eventsWrap: {
      marginTop: 28,
      gap: EVENT_GAP_V,
    },

    eventBar: {
      height: EVENT_BAR_HEIGHT,
      borderRadius: EVENT_BAR_RADIUS,
      paddingHorizontal: 8,
      justifyContent: 'center',
      marginHorizontal: EVENT_GAP_H,
      backgroundColor: t.colors.primaryContainer ?? t.colors.primary,
    },
    eventBarText: {
      fontSize: 11,
      includeFontPadding: false,
      color: '#ffffff',
      fontWeight: '600',
      // ← numberOfLines は Text の “prop” なので style に含めない
    },

    moreBadge: {
      alignSelf: 'flex-start',
      height: MORE_BADGE_H,
      borderRadius: MORE_BADGE_RADIUS,
      paddingHorizontal: 6,
      marginHorizontal: EVENT_GAP_H,
      backgroundColor: t.colors.surfaceVariant ?? t.colors.surface,
      borderWidth: HAIR_SAFE,
      borderColor: t.colors.outline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreBadgeText: {
      fontSize: 11,
      color: t.colors.onSurface,
      fontWeight: '600',
    },

    divider: {
      height: HAIR_SAFE,
      backgroundColor: t.colors.outline,
    },

    absoluteFill: {
      ...StyleSheet.absoluteFillObject,
    },

    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.colors.overlay ?? 'rgba(0,0,0,0.35)',
    },

    focusRing: {
      borderWidth: 2,
      borderColor: t.colors.focus ?? t.colors.primary,
      borderRadius: round,
    },
  });
};

export type CalendarStyles = ReturnType<typeof makeCalendarStyles>;
