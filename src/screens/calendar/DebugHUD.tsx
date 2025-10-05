// src/screens/calendar/DebugHUD.tsx
import React, { useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  PanResponder,
  Animated,
  Platform,
} from 'react-native';
// Safe Area（未導入でもビルド通るように optional import）
let useSafeAreaInsets: undefined | (() => { top: number; bottom: number; left: number; right: number });
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useSafeAreaInsets = require('react-native-safe-area-context').useSafeAreaInsets;
} catch (_) {
  useSafeAreaInsets = undefined;
}

type Props = {
  open: boolean;
  onClose: () => void;
  data: Record<string, any>;
  title?: string;
  initialHeightPct?: number; // 0.3〜0.9
};

export default function DebugHUD({
  open,
  onClose,
  data,
  title = 'Debug HUD',
  initialHeightPct = 0.55,
}: Props) {
  const { height: screenH, width: screenW } = useWindowDimensions();
  const insets = useSafeAreaInsets ? useSafeAreaInsets() : { top: 0, bottom: 0, left: 0, right: 0 };

  const minH = Math.max(220, Math.round(screenH * 0.3));
  const maxH = Math.round(screenH * 0.9);
  const startH = Math.max(minH, Math.min(maxH, Math.round(screenH * initialHeightPct)));

  const height = useRef(new Animated.Value(startH)).current;

  // 上のバーをドラッグで高さ変更
  const pan = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        pan.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset?.();
        const next = Math.max(minH, Math.min(maxH, (height as any)._value - g.dy));
        Animated.spring(height, { toValue: next, useNativeDriver: false, friction: 8, tension: 120 }).start(() => {
          pan.setValue(0);
        });
      },
      onPanResponderTerminate: () => {
        pan.setValue(0);
      },
    })
  ).current;

  const containerStyle = useMemo(
    () => [
      styles.wrap,
      {
        height,
        paddingBottom: insets.bottom + 8, // ★ 下の見切れ対策
        width: screenW,
      },
      Platform.OS === 'android' ? { elevation: 24 } : {},
    ],
    [height, insets.bottom, screenW]
  );

  if (!open) return null;

  const entries = Object.entries(data ?? {});
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={containerStyle}>
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        {/* Scrollable content */}
        <ScrollView
          bounces
          style={styles.scroll}
          contentContainerStyle={{ padding: 12, paddingBottom: 12 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {entries.length === 0 ? (
            <Text style={styles.empty}>No debug data</Text>
          ) : (
            entries.map(([k, v]) => (
              <View key={k} style={styles.row}>
                <Text style={styles.key}>{k}</Text>
                <Text style={styles.val} selectable>
                  {formatVal(v)}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function formatVal(v: any) {
  try {
    if (typeof v === 'string') return v;
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10050,
    justifyContent: 'flex-end',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  wrap: {
    width: '100%',
    backgroundColor: '#0b1220ee',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#334155',
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: { color: '#e2e8f0', fontSize: 14, fontWeight: '700', flex: 1 },
  close: { color: '#93c5fd', fontSize: 14, fontWeight: '700' },
  scroll: { flex: 1 },
  row: { marginBottom: 10 },
  key: { color: '#60a5fa', fontWeight: '800', marginBottom: 2 },
  val: { color: '#e5e7eb', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) as any },
  empty: { color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
});
