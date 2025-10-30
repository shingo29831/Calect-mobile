// // src/features/calendar/screens/EventModal.tsx
// import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
// import {
//   View, Text, Pressable, Platform, TextInput, KeyboardAvoidingView, Animated,
//   Image, StyleSheet, Switch, PanResponder, ScrollView, Alert
// } from 'react-native';
// import type { DateData } from 'react-native-calendars';
// import { Calendar as MiniCalendar } from 'react-native-calendars';
// import LinearGradient from 'react-native-linear-gradient';
// import dayjs from '../../../lib/dayjs';

// import type { NativeStackScreenProps } from '@react-navigation/native-stack';
// import type { RootStackParamList } from '../../../navigation';

// import { useAppTheme } from '../../../theme';
// import { getAllTags } from '../../../store/db';
// import { upsertEvent, type UpsertEventInput } from '../services/eventUpsert';
// import { EventVisibility } from 'src/api/types';

// /* =====================
//  *  画面 Props
//  * ===================== */
// type Props = NativeStackScreenProps<RootStackParamList, 'EventModal'>;

// /* =====================
//  *  ユーティリティ
//  * ===================== */
// const HAIR = StyleSheet.hairlineWidth;
// const SCREEN_W = 360; // モーダル内幅の目安（実サイズは style で調整）
// const COLOR_PALETTE: string[] = [
//   '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4',
//   '#3B82F6', '#22C55E', '#EAB308', '#F97316', '#EC4899', '#14B8A6',
//   '#0EA5E9', '#84CC16', '#E11D48', '#A855F7', '#F43F5E', '#38BDF8',
//   '#34D399', '#C084FC', '#111827', '#6B7280', '#D1D5DB', '#FFFFFF'
// ];

// const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// /* === HSV <-> HEX === */
// function hsvToHex(h: number, s: number, v: number): string {
//   h = ((h % 360) + 360) % 360;
//   s = clamp01(s); v = clamp01(v);
//   const c = v * s;
//   const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
//   const m = v - c;
//   let r = 0, g = 0, b = 0;
//   if (0 <= h && h < 60) { r = c; g = x; b = 0; }
//   else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
//   else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
//   else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
//   else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
//   else { r = c; g = 0; b = x; }
//   const R = Math.round((r + m) * 255);
//   const G = Math.round((g + m) * 255);
//   const B = Math.round((b + m) * 255);
//   const toHex = (n: number) => n.toString(16).padStart(2, '0');
//   return `#${toHex(R)}${toHex(G)}${toHex(B)}`;
// }
// function hexToHsv(hex: string): { h: number; s: number; v: number } {
//   const m = hex.trim().match(/^#?([0-9a-f]{6})/i);
//   if (!m) return { h: 0, s: 0, v: 0 };
//   const int = parseInt(m[1], 16);
//   const r = ((int >> 16) & 255) / 255;
//   const g = ((int >> 8) & 255) / 255;
//   const b = (int & 255) / 255;
//   const max = Math.max(r, g, b), min = Math.min(r, g, b);
//   const d = max - min;
//   let h = 0;
//   if (d !== 0) {
//     switch (max) {
//       case r: h = ((g - b) / d) % 6; break;
//       case g: h = (b - r) / d + 2; break;
//       default: h = (r - g) / d + 4;
//     }
//     h *= 60; if (h < 0) h += 360;
//   }
//   const s = max === 0 ? 0 : d / max;
//   const v = max;
//   return { h, s, v };
// }

// /* === HEX6/8 + alpha === */
// const HEX6 = /^#([0-9a-f]{6})$/i;
// const HEX8 = /^#([0-9a-f]{8})$/i;
// function hexToRgb(hex: string) {
//   const m6 = HEX6.exec(hex);
//   const m8 = HEX8.exec(hex);
//   const raw = (m8 ? m8[1].slice(0, 6) : m6 ? m6[1] : null);
//   if (!raw) return { r: 0, g: 0, b: 0 };
//   const r = parseInt(raw.slice(0, 2), 16);
//   const g = parseInt(raw.slice(2, 4), 16);
//   const b = parseInt(raw.slice(4, 6), 16);
//   return { r, g, b };
// }
// function rgbaStringFrom(hex6: string, alpha01: number) {
//   const { r, g, b } = hexToRgb(hex6);
//   return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha01))})`;
// }
// function appendAlpha(hex6: string, alpha01: number) {
//   const a = Math.round(Math.max(0, Math.min(1, alpha01)) * 255).toString(16).padStart(2, '0').toUpperCase();
//   return HEX6.test(hex6) ? `${hex6}${a}` : hex6;
// }
// function extractAlpha01(hex: string) {
//   if (!HEX8.test(hex)) return 1;
//   const aa = hex.slice(-2);
//   return parseInt(aa, 16) / 255;
// }

// /* =====================
//  *  ミニコンポーネント
//  * ===================== */
// const useMeasure = () => {
//   const ref = useRef<View>(null);
//   const [size, setSize] = useState({ w: 0, h: 0 });
//   const onLayout = useCallback((e: any) => {
//     const { width, height } = e.nativeEvent.layout;
//     setSize({ w: width, h: height });
//   }, []);
//   return { ref, size, onLayout };
// };

// /** Hue 連続バー */
// const HueBar = ({
//   hue,
//   onChange,
//   theme,
//   onDragStateChange,
// }: {
//   hue: number;
//   onChange: (h: number) => void;
//   theme: ReturnType<typeof useAppTheme>;
//   onDragStateChange?: (dragging: boolean) => void;
// }) => {
//   const { ref, size, onLayout } = useMeasure();
//   const handle = useCallback(
//     (x: number) => {
//       const w = Math.max(1, size.w);
//       const ratio = clamp01(x / w);
//       onChange(ratio * 360);
//     },
//     [size.w, onChange]
//   );

//   const BAR_H = 16;
//   const MARK = 12;

//   return (
//     <View style={{ height: BAR_H, borderRadius: 6, overflow: 'hidden', borderWidth: HAIR, borderColor: theme.border }}>
//       <View ref={ref as any} onLayout={onLayout} style={{ height: BAR_H }}>
//         <LinearGradient
//           colors={[0, 60, 120, 180, 240, 300, 360].map((h) => hsvToHex(h, 1, 1))}
//           start={{ x: 0, y: 0 }}
//           end={{ x: 1, y: 0 }}
//           style={StyleSheet.absoluteFill}
//         />
//         <View
//           style={StyleSheet.absoluteFill}
//           onStartShouldSetResponder={() => true}
//           onMoveShouldSetResponder={() => true}
//           onResponderGrant={(e) => {
//             onDragStateChange?.(true);
//             handle(e.nativeEvent.locationX);
//           }}
//           onResponderMove={(e) => handle(e.nativeEvent.locationX)}
//           onResponderRelease={() => onDragStateChange?.(false)}
//           onResponderTerminate={() => onDragStateChange?.(false)}
//         />
//         <View
//           style={{
//             position: 'absolute',
//             left: clamp01(hue / 360) * Math.max(1, size.w) - MARK / 2,
//             top: BAR_H / 2 - MARK / 2,
//             width: MARK, height: MARK, borderRadius: MARK / 2,
//             borderWidth: 2, borderColor: theme.surface,
//             backgroundColor: hsvToHex(hue, 1, 1),
//             shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
//           }}
//         />
//       </View>
//     </View>
//   );
// };

// /** SV ピッカー */
// const SVPicker = ({
//   hue, s, v, onChange, theme, onDragStateChange,
// }: {
//   hue: number; s: number; v: number;
//   onChange: (s: number, v: number) => void;
//   theme: ReturnType<typeof useAppTheme>;
//   onDragStateChange?: (dragging: boolean) => void;
// }) => {
//   const { ref, size, onLayout } = useMeasure();
//   const handle = useCallback(
//     (x: number, y: number) => {
//       const w = Math.max(1, size.w);
//       const h = Math.max(1, size.h);
//       const ss = clamp01(x / w);
//       const vv = clamp01(1 - y / h);
//       onChange(ss, vv);
//     },
//     [size.w, size.h, onChange]
//   );
//   const markerX = clamp01(s) * Math.max(1, size.w);
//   const markerY = (1 - clamp01(v)) * Math.max(1, size.h);
//   const R = 10, MARK = 14;

//   return (
//     <View
//       ref={ref as any}
//       onLayout={onLayout}
//       style={{ aspectRatio: 1, borderRadius: 10, overflow: 'hidden', borderWidth: HAIR, borderColor: theme.border }}
//     >
//       <View style={[StyleSheet.absoluteFill, { backgroundColor: hsvToHex(hue, 1, 1) }]} />
//       <LinearGradient colors={['#FFFFFF', '#FFFFFF00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
//       <LinearGradient colors={['#00000000', '#000000FF']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
//       <View
//         style={StyleSheet.absoluteFill}
//         onStartShouldSetResponder={() => true}
//         onMoveShouldSetResponder={() => true}
//         onResponderGrant={(e) => { onDragStateChange?.(true); handle(e.nativeEvent.locationX, e.nativeEvent.locationY); }}
//         onResponderMove={(e) => handle(e.nativeEvent.locationX, e.nativeEvent.locationY)}
//         onResponderRelease={() => onDragStateChange?.(false)}
//         onResponderTerminate={() => onDragStateChange?.(false)}
//       />
//       <View
//         style={{
//           position: 'absolute',
//           left: markerX - MARK / 2, top: markerY - MARK / 2,
//           width: MARK, height: MARK, borderRadius: MARK / 2,
//           borderWidth: 2, borderColor: '#fff', backgroundColor: hsvToHex(hue, s, v),
//           shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
//         }}
//       />
//     </View>
//   );
// };

// /** Alpha バー */
// const AlphaBar = ({
//   width = 260, height = 18, value, onChange, baseHex,
// }: { width?: number; height?: number; value: number; onChange: (a01: number) => void; baseHex: string }) => {
//   const theme = useAppTheme();
//   const { ref, size, onLayout } = useMeasure();
//   const w = size.w || width;
//   const knobX = Math.round(Math.max(0, Math.min(1, value)) * (w - 20));
//   const start = rgbaStringFrom(baseHex, 0);
//   const end   = rgbaStringFrom(baseHex, 1);

//   const pan = React.useRef(
//     PanResponder.create({
//       onStartShouldSetPanResponder: () => true,
//       onMoveShouldSetPanResponder: () => true,
//       onPanResponderGrant: (e) => { const x = e.nativeEvent.locationX; onChange(Math.max(0, Math.min(1, x / Math.max(1, w)))); },
//       onPanResponderMove:  (e) => { const x = e.nativeEvent.locationX; onChange(Math.max(0, Math.min(1, x / Math.max(1, w)))); },
//       onPanResponderRelease: () => {},
//     })
//   ).current;

//   return (
//     <View style={{ width, alignItems: 'center' }}>
//       <View
//         ref={ref}
//         onLayout={onLayout}
//         {...pan.panHandlers}
//         style={{ width, height, borderRadius: 10, overflow: 'hidden', borderWidth: HAIR, borderColor: theme.border }}
//       >
//         <LinearGradient colors={[start, end]} style={{ width: '100%', height: '100%' }} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} />
//         <View
//           pointerEvents="none"
//           style={{
//             position: 'absolute', left: knobX, top: -4, width: 20, height: height + 8,
//             borderRadius: 10, borderWidth: 2, borderColor: theme.surface,
//             backgroundColor: rgbaStringFrom(baseHex, value),
//             shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
//           }}
//         />
//       </View>
//       <Text style={{ marginTop: 6, fontSize: 11, color: theme.textSecondary }}>
//         透明度（Alpha）: {Math.round(value * 100)}%
//       </Text>
//     </View>
//   );
// };

// /** HourDial */
// type HourDialProps = {
//   size?: number; innerRatio?: number; outerRatio?: number; thresholdRatio?: number;
//   value?: number | null; onChange: (hour: number) => void; onConfirm: (hour: number) => void;
//   selectedColor?: string; textColor?: string;
// };
// const HourDial: React.FC<HourDialProps> = memo(({
//   size = 380, innerRatio = 0.50, outerRatio = 0.78, thresholdRatio = 0.64,
//   value = null, onChange, onConfirm, selectedColor = '#2563eb', textColor = '#111',
// }) => {
//   const radius = size / 2;
//   const itemsInner = Array.from({ length: 12 }, (_, h) => h);
//   const itemsOuter = Array.from({ length: 12 }, (_, i) => i + 12);

//   const pickFromXY = useCallback((x: number, y: number) => {
//     const dx = x - radius; const dy = y - radius;
//     let ang = Math.atan2(dy, dx); ang = ang + Math.PI / 2; if (ang < 0) ang += Math.PI * 2;
//     const deg = (ang * 180) / Math.PI;
//     const r = Math.sqrt(dx * dx + dy * dy); const ratio = r / radius;
//     const isOuter = ratio >= thresholdRatio;
//     const index = Math.round((deg / 360) * 12) % 12;
//     const hour = isOuter ? (12 + index) % 24 : index;
//     return hour;
//   }, [radius, thresholdRatio]);

//   const handleMove = useCallback((evt: any) => {
//     const { locationX, locationY } = evt.nativeEvent;
//     onChange(pickFromXY(locationX, locationY));
//   }, [pickFromXY, onChange]);

//   const handleRelease = useCallback((evt: any) => {
//     const { locationX, locationY } = evt.nativeEvent;
//     onConfirm(pickFromXY(locationX, locationY));
//   }, [pickFromXY, onConfirm]);

//   const ring = (items: number[], ringRatio: number) => (
//     <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none">
//       {items.map((h) => {
//         const idx = h % 12;
//         const angle = ((idx / 12) * 360 - 90) * (Math.PI / 180);
//         const r = radius * ringRatio;
//         const x = radius + r * Math.cos(angle);
//         const y = radius + r * Math.sin(angle);
//         const selected = value === h;
//         return (
//           <View
//             key={h}
//             style={{
//               position: 'absolute', left: x - 24, top: y - 24, width: 48, height: 48, borderRadius: 24,
//               alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? selectedColor : 'transparent',
//             }}
//           >
//             <Text style={{ fontWeight: '800', fontSize: 16, color: selected ? '#fff' : textColor }}>{h}</Text>
//           </View>
//         );
//       })}
//     </View>
//   );

//   return (
//     <View
//       style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}
//       onStartShouldSetResponder={() => true}
//       onMoveShouldSetResponder={() => true}
//       onResponderGrant={handleMove}
//       onResponderMove={handleMove}
//       onResponderRelease={handleRelease}
//       onResponderTerminate={handleRelease}
//     >
//       {ring(itemsOuter, outerRatio)}
//       {ring(itemsInner, innerRatio)}
//       <View style={{ width: radius * 0.9, height: radius * 0.9, borderRadius: (radius * 0.9) / 2, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
//         <Text style={{ fontSize: 28, fontWeight: '900', color: textColor }}>{value ?? '--'}:00</Text>
//       </View>
//     </View>
//   );
// });

// /** MinuteDial */
// type MinuteDialProps = {
//   size?: number; ringRatio?: number; value?: number | null;
//   onChange: (min: number) => void; onConfirm: (min: number) => void;
//   selectedColor?: string; textColor?: string;
// };
// const MinuteDial: React.FC<MinuteDialProps> = memo(({
//   size = 380, ringRatio = 0.78, value = null, onChange, onConfirm, selectedColor = '#2563eb', textColor = '#111',
// }) => {
//   const radius = size / 2;
//   const pickFromXY = useCallback((x: number, y: number) => {
//     const dx = x - radius; const dy = y - radius;
//     let ang = Math.atan2(dy, dx); ang = ang + Math.PI / 2; if (ang < 0) ang += Math.PI * 2;
//     const minFloat = (ang / (Math.PI * 2)) * 60;
//     return Math.round(minFloat) % 60;
//   }, [radius]);

//   const handleMove = useCallback((evt: any) => {
//     const { locationX, locationY } = evt.nativeEvent;
//     onChange(pickFromXY(locationX, locationY));
//   }, [pickFromXY, onChange]);

//   const handleRelease = useCallback((evt: any) => {
//     const { locationX, locationY } = evt.nativeEvent;
//     onConfirm(pickFromXY(locationX, locationY));
//   }, [pickFromXY, onConfirm]);

//   const items = Array.from({ length: 60 }, (_, i) => i);
//   return (
//     <View
//       style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}
//       onStartShouldSetResponder={() => true}
//       onMoveShouldSetResponder={() => true}
//       onResponderGrant={handleMove}
//       onResponderMove={handleMove}
//       onResponderRelease={handleRelease}
//       onResponderTerminate={handleRelease}
//     >
//       <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none">
//         {items.map((m) => {
//           const angle = ((m / 60) * 360 - 90) * (Math.PI / 180);
//           const r = radius * ringRatio;
//           const x = radius + r * Math.cos(angle);
//           const y = radius + r * Math.sin(angle);
//           const showLabel = m % 5 === 0;
//           const selected = value === m;
//           return (
//             <View
//               key={m}
//               style={{
//                 position: 'absolute',
//                 left: x - (showLabel ? 22 : 6),
//                 top: y - (showLabel ? 22 : 6),
//                 width: showLabel ? 44 : 12,
//                 height: showLabel ? 44 : 12,
//                 borderRadius: showLabel ? 22 : 6,
//                 alignItems: 'center',
//                 justifyContent: 'center',
//                 backgroundColor: selected ? selectedColor : 'transparent',
//               }}
//             >
//               {showLabel ? (
//                 <Text style={{ fontWeight: '800', fontSize: 14, color: selected ? '#fff' : textColor }}>{m}</Text>
//               ) : (
//                 <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: selected ? '#fff' : textColor, opacity: 0.35 }} />
//               )}
//             </View>
//           );
//         })}
//       </View>
//       <View
//         style={{ width: radius * 0.9, height: radius * 0.9, borderRadius: (radius * 0.9) / 2, alignItems: 'center', justifyContent: 'center' }}
//         pointerEvents="none"
//       >
//         <Text style={{ fontSize: 28, fontWeight: '900', color: textColor }}>{value ?? '--'}分</Text>
//       </View>
//     </View>
//   );
// });

// /* =====================
//  *  本体
//  * ===================== */
// export default function EventModal({ route, navigation }: Props) {
//   const theme = useAppTheme();

//   // 初期日
//   const base = route.params?.date || dayjs().format('YYYY-MM-DD');

//   // ====== フォーム状態 ======
//   const [formTitle, setFormTitle] = useState('New Event');
//   const [formSummary, setFormSummary] = useState('');
//   const [formAllDay, setFormAllDay] = useState(false);
//   const [formColor, setFormColor] = useState<string>('#2563EBAA'); // 既定：ブルー＋少し透明
//   const [formVisibility, setFormVisibility] = useState<EventVisibility>('Normal');
//   const [formTz, setFormTz] = useState<string>('local');

//   const DEFAULT_CAL_ID = 'CAL_LOCAL_DEFAULT';
//   const [formCalId, setFormCalId] = useState<string>(DEFAULT_CAL_ID);

//   // タグ
//   const [tags, setTags] = useState<string[]>([]);
//   const [allTags, setAllTags] = useState<string[]>([]);
//   const [tagInput, setTagInput] = useState('');

//   useEffect(() => { setAllTags(getAllTags()); }, []);

//   const addTag = useCallback((tRaw?: string) => {
//     const raw = (tRaw ?? tagInput).trim();
//     if (!raw) return;
//     if (tags.includes(raw)) { if (!tRaw) setTagInput(''); return; }
//     setTags((prev) => [...prev, raw]);
//     if (!tRaw) setTagInput('');
//   }, [tagInput, tags]);

//   const removeTag = useCallback((t: string) => {
//     setTags((prev) => prev.filter(x => x !== t));
//   }, []);

//   const similarTagCandidates = useMemo(() => {
//     const q = tagInput.trim().toLowerCase();
//     if (!q) return [] as string[];
//     const notSelected = allTags.filter(t => !tags.includes(t));
//     const starts = notSelected.filter(t => t.toLowerCase().startsWith(q));
//     const contains = notSelected.filter(t => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q));
//     return [...starts, ...contains].slice(0, 8);
//   }, [tagInput, allTags, tags]);

//   // 日付・時刻
//   const [startDate, setStartDate] = useState<string>(base);
//   const [endDate, setEndDate]     = useState<string>(base);
//   const [startTime, setStartTime] = useState<string>('10:00');
//   const [endTime, setEndTime]     = useState<string>('11:00');

//   // ミニカレンダーオーバーレイ
//   const [startCalOpen, setStartCalOpen] = useState(false);
//   const [endCalOpen, setEndCalOpen]     = useState(false);

//   // 時刻オーバーレイ（時）
//   const [startTimeOpen, setStartTimeOpen] = useState(false);
//   const [endTimeOpen, setEndTimeOpen] = useState(false);
//   const [startHour, setStartHour] = useState<number | null>(10);
//   const [endHour, setEndHour] = useState<number | null>(11);

//   // 分オーバーレイ
//   const [startMinuteOpen, setStartMinuteOpen] = useState(false);
//   const [endMinuteOpen, setEndMinuteOpen] = useState(false);
//   const [startMinute, setStartMinute] = useState<number | null>(0);
//   const [endMinute, setEndMinute] = useState<number | null>(0);

//   // カラーパレット
//   const [colorOpen, setColorOpen] = useState(false);
//   const [draggingColor, setDraggingColor] = useState(false);
//   const [tempColor, setTempColor] = useState<string>('#2563EB'); // #RRGGBB
//   const [tempAlpha, setTempAlpha] = useState<number>(0.67);      // 0..1
//   const [hue, setHue] = useState<number>(210);
//   const [svS, setSvS] = useState<number>(1);
//   const [svV, setSvV] = useState<number>(1);

//   // スクロール監視（ダイヤルやSVドラッグ時にスクロール抑制）
//   const scrollYRef = useRef(0);

//   // Validation helpers
//   const parseHM = useCallback((t: string): number | null => {
//     const m = String(t || '').match(/^(\d{1,2}):(\d{1,2})$/);
//     if (!m) return null;
//     const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
//     const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
//     return hh * 60 + mm;
//   }, []);

//   const ensureEndDateNotBeforeStart = useCallback((s: string, e: string) => {
//     if (dayjs(e).isBefore(dayjs(s))) setEndDate(s);
//   }, []);

//   const ensureEndTimeNotBeforeStart = useCallback((s: string, e: string) => {
//     if (formAllDay) return;
//     const sm = parseHM(s);
//     const em = parseHM(e);
//     if (sm != null && em != null && em < sm) {
//       setEndTime(s);
//       setEndHour(Math.floor(sm / 60));
//       setEndMinute(sm % 60);
//     }
//   }, [formAllDay, parseHM]);

//   useEffect(() => { ensureEndDateNotBeforeStart(startDate, endDate); }, [startDate, endDate, ensureEndDateNotBeforeStart]);
//   useEffect(() => { ensureEndTimeNotBeforeStart(startTime, endTime); }, [startTime, endTime, ensureEndTimeNotBeforeStart]);

//   // ヘッダー
//   useEffect(() => {
//     (navigation as any).setOptions({
//       headerTitle: '新規イベント',
//       headerRight: () => (
//         <Pressable
//           onPress={handleSave}
//           style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.accent }}
//         >
//           <Text style={{ color: theme.accentText, fontWeight: '800' }}>保存</Text>
//         </Pressable>
//       ),
//     });
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [navigation, theme, formTitle, formSummary, formAllDay, startDate, endDate, startTime, endTime, formColor, tags, formCalId]);

//   // 保存
//   const handleSave = useCallback(async () => {
//     try {
//       if (!formTitle.trim()) {
//         Alert.alert('保存できません', 'タイトルを入力してください。');
//         return;
//       }
//       const norm = (t: string) => {
//         const m = String(t || '').match(/^(\d{1,2}):(\d{1,2})$/);
//         if (!m) return null;
//         const hh = String(Math.max(0, Math.min(23, Number(m[1])))).padStart(2, '0');
//         const mm = String(Math.max(0, Math.min(59, Number(m[2])))).padStart(2, '0');
//         return `${hh}:${mm}`;
//       };
//       const st = formAllDay ? '00:00' : norm(startTime);
//       const et = formAllDay ? '23:59' : norm(endTime);
//       if (!st || !et) {
//         Alert.alert('保存できません', '開始/終了時刻の形式が不正です（HH:mm）。');
//         return;
//       }
//       let sDate = startDate;
//       let eDate = endDate;
//       if (dayjs(eDate).isBefore(dayjs(sDate))) eDate = sDate;

//       const sm = parseHM(st) ?? 0;
//       const em = parseHM(et) ?? 0;
//       const endFixed = em < sm ? st : et;

//       const startIso = dayjs(`${sDate} ${st}`).format('YYYY-MM-DD HH:mm');
//       const endIso   = dayjs(`${eDate} ${endFixed}`).format('YYYY-MM-DD HH:mm');
//       if (!dayjs(endIso).isAfter(dayjs(startIso))) {
//         Alert.alert('保存できません', '終了が開始より後になるように設定してください。');
//         return;
//       }

//       const color = (formColor || '').trim();
//       const validColor = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : undefined;

//       const payload: UpsertEventInput = {
//         // 新規なので event_id は渡さない
//         calendar_id: formCalId,
//         title: formTitle.trim(),
//         summary: (formSummary || '').trim() || undefined,
//         rrule: '',

//         start_date: sDate,
//         end_date:   eDate,
//         start_time: st,
//         end_time:   endFixed,
//         allDay:     !!formAllDay,

//         tz:         formTz || 'local',
//         color:      validColor,
//         tags,
//         visibility: formVisibility ?? 'Normal',
//       };

//       await upsertEvent(payload);
//       Alert.alert('保存しました', 'イベントを作成しました。');
//       navigation.goBack();
//     } catch (e: any) {
//       console.warn('[EventModal] save failed:', e);
//       Alert.alert('保存に失敗しました', String(e?.message ?? e ?? 'unknown error'));
//     }
//   }, [formTitle, formSummary, formAllDay, startDate, endDate, startTime, endTime, formColor, tags, formCalId, formTz, formVisibility, navigation, parseHM]);

//   // UI - 本体
//   return (
//     <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
//       <ScrollView
//         keyboardShouldPersistTaps="handled"
//         keyboardDismissMode="on-drag"
//         onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
//         scrollEventThrottle={16}
//         contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
//         style={{ flex: 1, backgroundColor: theme.appBg }}
//         scrollEnabled={!draggingColor}
//       >
//         {/* タイトル */}
//         <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>タイトル(必須)</Text>
//         <TextInput
//           value={formTitle}
//           onChangeText={setFormTitle}
//           placeholder="例: 打ち合わせ"
//           placeholderTextColor={theme.textSecondary}
//           selectionColor={theme.accent}
//           style={{
//             borderWidth: HAIR, borderColor: theme.border, borderRadius: 10,
//             paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 12,
//             color: theme.textPrimary, backgroundColor: theme.surface,
//           }}
//         />

//         {/* サマリ */}
//         <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>メモ / 説明</Text>
//         <TextInput
//           value={formSummary}
//           onChangeText={setFormSummary}
//           placeholder="任意で入力"
//           placeholderTextColor={theme.textSecondary}
//           selectionColor={theme.accent}
//           multiline
//           style={{
//             borderWidth: HAIR, borderColor: theme.border, borderRadius: 10,
//             paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 12,
//             minHeight: 68, color: theme.textPrimary, backgroundColor: theme.surface,
//           }}
//         />

//         {/* 日付 */}
//         <View style={{ marginBottom: 12 }}>
//           <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>日付</Text>
//           <View style={{ flexDirection: 'row', gap: 12 }}>
//             <Pressable
//               onPress={() => { setStartCalOpen(true); setEndCalOpen(false); }}
//               style={{
//                 flex: 1, borderWidth: HAIR, borderColor: theme.border, borderRadius: 10,
//                 paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.surface
//               }}
//             >
//               <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>開始</Text>
//               <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '700' }}>
//                 {dayjs(startDate).format('YYYY-MM-DD')}
//               </Text>
//             </Pressable>

//             <Pressable
//               onPress={() => { setEndCalOpen(true); setStartCalOpen(false); }}
//               style={{
//                 flex: 1, borderWidth: HAIR, borderColor: theme.border, borderRadius: 10,
//                 paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.surface
//               }}
//             >
//               <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 4 }}>終了</Text>
//               <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '700' }}>
//                 {dayjs(endDate).format('YYYY-MM-DD')}
//               </Text>
//             </Pressable>
//           </View>
//         </View>

//         {/* 時刻 */}
//         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
//           <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>終日</Text>
//           <Switch
//             value={formAllDay}
//             onValueChange={(v) => {
//               setFormAllDay(v);
//               if (v) { setStartTime('00:00'); setEndTime('23:59'); }
//             }}
//           />
//         </View>
//         {!formAllDay && (
//           <View style={{ flexDirection: 'row', gap: 12 }}>
//             <Pressable
//               onPress={() => {
//                 setStartTimeOpen(true);
//                 const mm = String(startTime || '').match(/^(\d{1,2}):(\d{1,2})$/);
//                 const h = mm ? Math.max(0, Math.min(23, parseInt(mm[1],10))) : 0;
//                 const m = mm ? Math.max(0, Math.min(59, parseInt(mm[2],10))) : 0;
//                 setStartHour(h); setStartMinute(m);
//               }}
//               style={{
//                 flex: 1, borderWidth: HAIR, borderColor: theme.border, borderRadius: 10,
//                 paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.surface
//               }}
//             >
//               <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>
//                 開始時刻（タップで選択）
//               </Text>
//               <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '700' }}>{startTime}</Text>
//             </Pressable>

//             <Pressable
//               onPress={() => {
//                 setEndTimeOpen(true);
//                 const mm = String(endTime || '').match(/^(\d{1,2}):(\d{1,2})$/);
//                 const h = mm ? Math.max(0, Math.min(23, parseInt(mm[1],10))) : 0;
//                 const m = mm ? Math.max(0, Math.min(59, parseInt(mm[2],10))) : 0;
//                 setEndHour(h); setEndMinute(m);
//               }}
//               style={{
//                 flex: 1, borderWidth: HAIR, borderColor: theme.border, borderRadius: 10,
//                 paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.surface
//               }}
//             >
//               <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 6 }}>
//                 終了時刻（タップで選択）
//               </Text>
//               <Text style={{ fontSize: 16, color: theme.textPrimary, fontWeight: '700' }}>{endTime}</Text>
//             </Pressable>
//           </View>
//         )}

//         {/* タグ */}
//         <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 8, marginBottom: 6 }}>タグ</Text>

//         {allTags.filter(t => !tags.includes(t)).length > 0 && (
//           <View style={{ marginBottom: 8 }}>
//             <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 6 }}>既存から選択</Text>
//             <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
//               {allTags.filter(t => !tags.includes(t)).slice(0, 24).map(t => (
//                 <Pressable
//                   key={`opt-${t}`}
//                   onPress={() => addTag(t)}
//                   style={{
//                     paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
//                     backgroundColor: theme.surface, borderWidth: HAIR, borderColor: theme.border
//                   }}
//                 >
//                   <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>#{t}</Text>
//                 </Pressable>
//               ))}
//             </View>
//           </View>
//         )}

//         {/* 選択済みタグ */}
//         <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
//           {tags.map((t) => (
//             <Pressable
//               key={`sel-${t}`}
//               onPress={() => removeTag(t)}
//               style={{
//                 flexDirection: 'row', alignItems: 'center', gap: 6,
//                 paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
//                 backgroundColor: `${theme.accent}22`, borderWidth: HAIR, borderColor: theme.accent
//               }}
//             >
//               <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>#{t}</Text>
//               <Text style={{ color: theme.accent }}>×</Text>
//             </Pressable>
//           ))}
//         </View>

//         {/* 新規タグ追加 */}
//         <View style={{ flexDirection: 'row', gap: 8 }}>
//           <TextInput
//             value={tagInput}
//             onChangeText={setTagInput}
//             onSubmitEditing={() => addTag()}
//             placeholder="タグを入力してEnter"
//             placeholderTextColor={theme.textSecondary}
//             selectionColor={theme.accent}
//             style={{
//               flex: 1,
//               borderWidth: HAIR, borderColor: theme.border, borderRadius: 10,
//               paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
//               color: theme.textPrimary, backgroundColor: theme.surface,
//             }}
//           />
//           <Pressable
//             onPress={() => addTag()}
//             style={{ paddingHorizontal: 14, borderRadius: 10, backgroundColor: theme.accent, justifyContent: 'center' }}
//           >
//             <Text style={{ color: theme.accentText, fontWeight: '800' }}>追加</Text>
//           </Pressable>
//         </View>

//         {/* 色 (#HEX) + プレビュー + パレットを開く */}
//         <View style={{ gap: 8, marginTop: 12 }}>
//           <Text style={{ fontSize: 12, color: theme.textSecondary }}>色</Text>
//           <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
//             {/* 現在色プレビュー（#RRGGBB/#RRGGBBAA対応） */}
//             <View
//               style={{
//                 width: 36, height: 36, borderRadius: 8,
//                 backgroundColor: (() => {
//                   const cur = (formColor || '').trim();
//                   if (HEX8.test(cur)) return rgbaStringFrom(`#${cur.replace('#','').slice(0,6)}`, extractAlpha01(cur));
//                   if (HEX6.test(cur)) return cur;
//                   return '#2563EB';
//                 })(),
//                 borderWidth: HAIR, borderColor: theme.border
//               }}
//             />
//             <Pressable
//               onPress={() => {
//                 // 既存色から base(#RRGGBB) と alpha(0..1) を抽出
//                 const cur = (formColor || '').trim();
//                 const base = HEX8.test(cur) ? `#${cur.replace('#','').slice(0,6)}`
//                   : HEX6.test(cur) ? cur
//                   : '#2563EB';
//                 const a = HEX8.test(cur) ? extractAlpha01(cur) : 1;

//                 setTempColor(base || '#2563EB');
//                 setTempAlpha(a);
//                 const { h, s, v } = hexToHsv(base || '#2563EB');
//                 setHue(h); setSvS(s); setSvV(v);
//                 setColorOpen(true);
//               }}
//               style={{
//                 paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
//                 backgroundColor: theme.surface, borderWidth: HAIR, borderColor: theme.border
//               }}
//             >
//               <Text style={{ color: theme.textPrimary, fontWeight: '800' }}>パレットを開く</Text>
//             </Pressable>
//           </View>
//           {!!formColor && !/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test((formColor || '').trim()) && (
//             <Text style={{ marginTop: 2, fontSize: 12, color: theme.accent }}>
//               色コードは #RRGGBB または #RRGGBBAA で入力してください
//             </Text>
//           )}
//         </View>

//         {/* 下にスペース */}
//         <View style={{ height: 24 }} />
//       </ScrollView>

//       {/* ====== MiniCalendar Overlay ====== */}
//       {(startCalOpen || endCalOpen) && (
//         <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
//           <Pressable onPress={() => { setStartCalOpen(false); setEndCalOpen(false); }} style={StyleSheet.absoluteFillObject}>
//             <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
//           </Pressable>
//           <View
//             style={{
//               position: 'absolute',
//               top: 90,
//               alignSelf: 'center',
//               width: Math.min(360, SCREEN_W - 24),
//               borderRadius: 12,
//               backgroundColor: theme.surface,
//               borderWidth: HAIR,
//               borderColor: theme.border,
//               shadowColor: '#000',
//               shadowOpacity: 0.2,
//               shadowRadius: 12,
//               shadowOffset: { width: 0, height: 6 },
//               overflow: 'hidden',
//             }}
//           >
//             <MiniCalendar
//               firstDay={1}
//               current={startCalOpen ? startDate : endDate}
//               markedDates={{ [startCalOpen ? startDate : endDate]: { selected: true } }}
//               onDayPress={(d: DateData) => {
//                 if (startCalOpen) {
//                   setStartDate(d.dateString);
//                   if (dayjs(endDate).isBefore(dayjs(d.dateString))) setEndDate(d.dateString);
//                 } else {
//                   if (dayjs(d.dateString).isBefore(dayjs(startDate))) setEndDate(startDate);
//                   else setEndDate(d.dateString);
//                 }
//                 setStartCalOpen(false); setEndCalOpen(false);
//               }}
//               theme={{
//                 backgroundColor: theme.surface,
//                 calendarBackground: theme.surface,
//                 textDayFontWeight: '700',
//                 textDayFontSize: 16,
//                 textMonthFontSize: 16,
//                 textMonthFontWeight: '800',
//                 dayTextColor: theme.textPrimary,
//                 monthTextColor: theme.textPrimary,
//                 todayTextColor: theme.accent,
//                 selectedDayBackgroundColor: theme.accent,
//                 selectedDayTextColor: theme.accentText,
//               }}
//             />
//           </View>
//         </View>
//       )}

//       {/* ====== Hour Dial Overlay ====== */}
//       {(startTimeOpen || endTimeOpen) && !formAllDay && (
//         <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
//           <Pressable onPress={() => { setStartTimeOpen(false); setEndTimeOpen(false); }} style={StyleSheet.absoluteFillObject}>
//             <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
//           </Pressable>
//           <View
//             style={{
//               position: 'absolute',
//               top: 90,
//               alignSelf: 'center',
//               width: Math.min(420, SCREEN_W - 16),
//               borderRadius: 16,
//               backgroundColor: theme.surface,
//               borderWidth: HAIR,
//               borderColor: theme.border,
//               shadowColor: '#000',
//               shadowOpacity: 0.25,
//               shadowRadius: 14,
//               shadowOffset: { width: 0, height: 8 },
//               overflow: 'hidden',
//               paddingVertical: 18,
//               alignItems: 'center',
//             }}
//           >
//             <Text style={{ fontSize: 16, fontWeight: '800', color: theme.textPrimary, marginBottom: 8 }}>
//               {startTimeOpen ? '開始時刻：ドラッグで選択（離して確定）' : '終了時刻：ドラッグで選択（離して確定）'}
//             </Text>

//             <HourDial
//               size={380}
//               innerRatio={0.50}
//               outerRatio={0.78}
//               thresholdRatio={0.64}
//               value={startTimeOpen ? startHour : endHour}
//               onChange={(h) => { if (startTimeOpen) setStartHour(h); else setEndHour(h); }}
//               onConfirm={(h) => {
//                 if (startTimeOpen) {
//                   setStartHour(h);
//                   setStartTimeOpen(false);
//                   const hh = String(h).padStart(2, '0');
//                   const next = `${hh}:${String(startMinute ?? 0).padStart(2, '0')}`;
//                   setStartTime(next);
//                   ensureEndTimeNotBeforeStart(next, endTime);
//                   setStartMinuteOpen(true);
//                 } else {
//                   setEndHour(h);
//                   setEndTimeOpen(false);
//                   const hh = String(h).padStart(2, '0');
//                   const next = `${hh}:${String(endMinute ?? 0).padStart(2, '0')}`;
//                   setEndTime(next);
//                   ensureEndTimeNotBeforeStart(startTime, next);
//                   setEndMinuteOpen(true);
//                 }
//               }}
//               selectedColor={theme.accent}
//               textColor={theme.textPrimary}
//             />
//           </View>
//         </View>
//       )}

//       {/* ====== Minute Dial Overlay ====== */}
//       {(startMinuteOpen || endMinuteOpen) && !formAllDay && (
//         <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
//           <Pressable onPress={() => { setStartMinuteOpen(false); setEndMinuteOpen(false); }} style={StyleSheet.absoluteFillObject}>
//             <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
//           </Pressable>
//           <View
//             style={{
//               position: 'absolute',
//               top: 90,
//               alignSelf: 'center',
//               width: Math.min(420, SCREEN_W - 16),
//               borderRadius: 16,
//               backgroundColor: theme.surface,
//               borderWidth: HAIR,
//               borderColor: theme.border,
//               shadowColor: '#000',
//               shadowOpacity: 0.25,
//               shadowRadius: 14,
//               shadowOffset: { width: 0, height: 8 },
//               overflow: 'hidden',
//               paddingVertical: 18,
//               alignItems: 'center',
//             }}
//           >
//             <Text style={{ fontSize: 16, fontWeight: '800', color: theme.textPrimary, marginBottom: 8 }}>
//               分をドラッグで選択（離して確定）
//             </Text>

//             <MinuteDial
//               size={380}
//               ringRatio={0.78}
//               value={startMinuteOpen ? startMinute : endMinute}
//               onChange={(m) => { if (startMinuteOpen) setStartMinute(m); else setEndMinute(m); }}
//               onConfirm={(m) => {
//                 if (startMinuteOpen) {
//                   setStartMinute(m);
//                   const mm = String(m).padStart(2, '0');
//                   const hh = String(startHour ?? 0).padStart(2, '0');
//                   const next = `${hh}:${mm}`;
//                   setStartTime(next);
//                   setStartMinuteOpen(false);
//                   ensureEndTimeNotBeforeStart(next, endTime);
//                 } else {
//                   setEndMinute(m);
//                   const mm = String(m).padStart(2, '0');
//                   const hh = String(endHour ?? 0).padStart(2, '0');
//                   const next = `${hh}:${mm}`;
//                   setEndTime(next);
//                   setEndMinuteOpen(false);
//                   ensureEndTimeNotBeforeStart(startTime, next);
//                 }
//               }}
//               selectedColor={theme.accent}
//               textColor={theme.textPrimary}
//             />
//           </View>
//         </View>
//       )}

//       {/* ====== Color Palette Overlay ====== */}
//       {colorOpen && (
//         <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
//           <Pressable onPress={() => setColorOpen(false)} style={StyleSheet.absoluteFillObject}>
//             <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
//           </Pressable>

//           <View
//             style={{
//               position: 'absolute',
//               top: 60,
//               alignSelf: 'center',
//               width: Math.min(420, SCREEN_W - 10),
//               maxHeight: 600,
//               borderRadius: 16,
//               backgroundColor: theme.surface,
//               borderWidth: HAIR,
//               borderColor: theme.border,
//               shadowColor: '#000',
//               shadowOpacity: 0.25,
//               shadowRadius: 14,
//               shadowOffset: { width: 0, height: 8 },
//               overflow: 'hidden',
//             }}
//           >
//             {/* 上：スクロール領域 */}
//             <View style={{ flex: 1 }}>
//               <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled" scrollEnabled={!draggingColor}>
//                 {/* プレビュー */}
//                 <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 }}>
//                   <View style={{ flex: 1, alignItems: 'center' }}>
//                     <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 6 }}>現在</Text>
//                     <View style={{
//                       width: 52, height: 52, borderRadius: 12,
//                       backgroundColor: (() => {
//                         const cur = (formColor || '').trim();
//                         if (HEX8.test(cur)) return rgbaStringFrom(`#${cur.replace('#','').slice(0,6)}`, extractAlpha01(cur));
//                         if (HEX6.test(cur)) return cur;
//                         return 'transparent';
//                       })(),
//                       borderWidth: HAIR, borderColor: theme.border
//                     }} />
//                   </View>
//                   <View style={{ flex: 1, alignItems: 'center' }}>
//                     <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 6 }}>選択中</Text>
//                     <View style={{
//                       width: 52, height: 52, borderRadius: 12,
//                       backgroundColor: rgbaStringFrom(tempColor, tempAlpha),
//                       borderWidth: HAIR, borderColor: theme.border
//                     }} />
//                   </View>
//                 </View>

//                 {/* 共通カラー */}
//                 <Text style={{ fontSize: 11, color: theme.textSecondary, marginBottom: 8 }}>共通カラー</Text>
//                 <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }} style={{ marginBottom: 12 }}>
//                   <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
//                     {COLOR_PALETTE.map((hex) => {
//                       const selected = tempColor.toLowerCase() === hex.toLowerCase();
//                       const CHIP = 24;
//                       return (
//                         <Pressable
//                           key={hex}
//                           onPress={() => {
//                             setTempColor(hex);
//                             const { h, s, v } = hexToHsv(hex);
//                             setHue(h); setSvS(s); setSvV(v);
//                           }}
//                           style={{
//                             width: CHIP, height: CHIP, borderRadius: CHIP / 2, backgroundColor: hex,
//                             alignItems: 'center', justifyContent: 'center',
//                             borderWidth: selected ? 2 : HAIR, borderColor: selected ? theme.accent : theme.border, marginRight: 2,
//                           }}
//                           accessibilityLabel={`色 ${hex}`}
//                         >
//                           {selected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
//                         </Pressable>
//                       );
//                     })}
//                     <Pressable
//                       onPress={() => {
//                         setTempColor('#FFFFFF');
//                         const { h, s, v } = hexToHsv('#FFFFFF');
//                         setHue(h); setSvS(s); setSvV(v);
//                       }}
//                       style={{
//                         width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF',
//                         alignItems: 'center', justifyContent: 'center', borderWidth: HAIR, borderColor: theme.border,
//                       }}
//                       accessibilityLabel="白"
//                     >
//                       <Text style={{ color: '#000', fontSize: 10 }}>□</Text>
//                     </Pressable>
//                   </View>
//                 </ScrollView>

//                 {/* Hue / SV / Alpha */}
//                 <View style={{ alignSelf: 'center', width: 350, gap: 10 }}>
//                   <Text style={{ fontSize: 11, color: theme.textSecondary }}>色相</Text>
//                   <HueBar
//                     hue={hue}
//                     onChange={(h) => { setHue(h); setTempColor(hsvToHex(h, svS, svV)); }}
//                     theme={theme}
//                     onDragStateChange={setDraggingColor}
//                   />

//                   <SVPicker
//                     hue={hue}
//                     s={svS}
//                     v={svV}
//                     onChange={(s, v) => { setSvS(s); setSvV(v); setTempColor(hsvToHex(hue, s, v)); }}
//                     theme={theme}
//                     onDragStateChange={setDraggingColor}
//                   />

//                   <Text style={{ fontSize: 11, color: theme.textSecondary }}>透明度</Text>
//                   <AlphaBar width={350} value={tempAlpha} onChange={setTempAlpha} baseHex={tempColor} />
//                 </View>
//               </ScrollView>
//             </View>

//             {/* 下：フッター */}
//             <View style={{ padding: 12, borderTopWidth: HAIR, borderColor: theme.border, backgroundColor: theme.surface }}>
//               <View style={{ flexDirection: 'row', gap: 10 }}>
//                 <Pressable
//                   onPress={() => setColorOpen(false)}
//                   style={{
//                     flex: 4, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
//                     borderWidth: HAIR, borderColor: theme.border, backgroundColor: theme.surface,
//                   }}
//                 >
//                   <Text style={{ color: theme.textPrimary, fontWeight: '800' }}>キャンセル</Text>
//                 </Pressable>
//                 <Pressable
//                   onPress={() => {
//                     const finalHex = appendAlpha(tempColor, tempAlpha); // #RRGGBBAA
//                     setFormColor(finalHex);
//                     setColorOpen(false);
//                   }}
//                   style={{ flex: 6, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent }}
//                 >
//                   <Text style={{ color: theme.accentText, fontWeight: '800' }}>決定</Text>
//                 </Pressable>
//               </View>
//             </View>
//           </View>
//         </View>
//       )}
//     </KeyboardAvoidingView>
//   );
// }
