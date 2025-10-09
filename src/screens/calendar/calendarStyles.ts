// src/screens/calendar/calendarStyles.ts
import { StyleSheet } from 'react-native';
import { SCREEN_H, SCREEN_W, LINE_W, LINE_COLOR, HAIR_SAFE, SIDE_PAD } from '../CalendarParts';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  /* ===== Overlay layers ===== */
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

  /* ===== Header title (React Navigation header) ===== */
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: SCREEN_W * 0.6,
  },
  headerEmojiCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: HAIR_SAFE,
    borderColor: '#e5e7eb',
  },
  headerEmojiText: { fontSize: 14 },
  headerTitleText: { fontSize: 16, fontWeight: '800', color: '#111827' },

  /* ===== Month title & sort pills ===== */
  monthTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' },
  sortPills: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 9999, padding: 3 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  pillActive: { backgroundColor: '#2563eb' },
  pillText: { fontSize: 12, color: '#334155', fontWeight: '700' },
  pillTextActive: { color: '#fff' },

  /* ===== Calendar area (baseline for pageHeight/cellH) =====
   * 縦方向の padding / margin / border は入れない（高さズレ防止）
   * 左右の内側余白のみ適用（横方向は pageHeight に無関係）
   */
  gridBlock: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingLeft: SIDE_PAD,
    paddingRight: SIDE_PAD,
  },

  // 任意の補助罫線（absolute で重ねる→高さに影響しない）
  gridTopLine: {
    position: 'absolute',
    top: 0,
    left: SIDE_PAD,
    right: SIDE_PAD,
    height: HAIR_SAFE,
    backgroundColor: LINE_COLOR,
  },
  gridLeftLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: SIDE_PAD,
    width: LINE_W,
    backgroundColor: LINE_COLOR,
  },

  // CalendarList の直親。縦余白ゼロで高さ汚さない
  gridInner: {
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
  },

  /* ===== Bottom sheet ===== */
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: HAIR_SAFE,
    borderBottomColor: '#eef2f7',
    gap: 12,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  sheetClose: { color: '#2563eb', fontWeight: '700' },
  emptyContainer: { paddingVertical: 24 },
  empty: { textAlign: 'center', color: '#6b7280' },

  /* ===== Left drawer ===== */
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#ffffff',
    borderRightWidth: HAIR_SAFE,
    borderRightColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 2, height: 0 },
    shadowRadius: 12,
    paddingTop: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: HAIR_SAFE,
    borderBottomColor: '#eef2f7',
    gap: 12,
  },
  drawerTitle: { fontSize: 16, fontWeight: '800', color: '#111827', flex: 1 },
  drawerClose: { color: '#2563eb', fontWeight: '700' },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  /* ===== Right drawer ===== */
  profileDrawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderLeftWidth: HAIR_SAFE,
    borderLeftColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: -2, height: 0 },
    shadowRadius: 12,
    paddingTop: 12,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: HAIR_SAFE,
    borderBottomColor: '#eef2f7',
    gap: 12,
  },
  profileName: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  profileEmail: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  profileFooter: {
    marginTop: 'auto',
    borderTopWidth: HAIR_SAFE,
    borderTopColor: '#eef2f7',
    paddingVertical: 8,
  },
});
