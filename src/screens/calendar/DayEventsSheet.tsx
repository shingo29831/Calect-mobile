// src/screens/calendar/DayEventsSheet.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppTheme } from '../../theme';

// 既存の型そのまま（無ければ any でもOK）
type Props = {
  visible: boolean;
  sheetY: Animated.Value; // 既存: 表示/非表示のトランスレーションに使っているならそのまま受け取る（使わないなら無視でOK）
  height: number;         // 画面に対する最大高さ（CalendarScreenから渡す）
  date: string;
  items: any[];
  onClose: () => void;
  onEndReached: () => void;
  rowHeight: number;
};

const SNAP_RATIO_COLLAPSED = 0.45; // 初期の縮小比（45%）
const DRAG_CLOSE_THRESHOLD_PX = 80;
const DRAG_CLOSE_VELOCITY = 1.0;

export default function DayEventsSheet({
  visible,
  height,
  date,
  items,
  onClose,
  onEndReached,
  rowHeight,
}: Props) {
  const theme = useAppTheme();

  // 高さスナップ（collapsed <-> expanded）を1本の Animated.Value で管理
  const expandedH = height;                      // 最大展開
  const collapsedH = Math.max(200, height * SNAP_RATIO_COLLAPSED);
  const sheetHeight = useRef(new Animated.Value(collapsedH)).current;

  // 表示/非表示のフェード（半透明の背景）
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  // シートの角丸・枠色など（必要に応じて調整）
  const handleColor = useMemo(() => theme.border, [theme.border]);

  // visible 変化でフェード
  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
    if (!visible) {
      // 非表示にする際は高さも一旦 collapsed に戻しておくと次回の初期状態が安定
      sheetHeight.setValue(collapsedH);
    }
  }, [visible, overlayOpacity, collapsedH, sheetHeight]);

  // 展開/縮小のアニメ
  const expand = () => {
    Animated.spring(sheetHeight, {
      toValue: expandedH,
      useNativeDriver: false,
      friction: 8,
      tension: 80,
    }).start();
  };
  const collapse = () => {
    Animated.spring(sheetHeight, {
      toValue: collapsedH,
      useNativeDriver: false,
      friction: 8,
      tension: 80,
    }).start();
  };

  // ハンドルのドラッグで下に強く引いたら閉じる、そうでなければスナップ
  const dragY = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        // 縦方向に少しでもドラッグしたら奪う
        return Math.abs(gesture.dy) > 4;
      },
      onPanResponderGrant: () => {
        dragY.current = 0;
      },
      onPanResponderMove: (_, gesture) => {
        dragY.current = gesture.dy;
        // 指に追従して高さを可変（上に引くと増える、下に引くと減る）
        const next = Math.min(expandedH, Math.max(collapsedH, (sheetHeight as any).__getValue() - gesture.dy));
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const { dy, vy } = gesture;
        // 強い下方向 or 一定距離でクローズ
        if (dy > DRAG_CLOSE_THRESHOLD_PX || vy > DRAG_CLOSE_VELOCITY) {
          onClose();
          return;
        }
        // それ以外はスナップ（動いた方向で判断）
        const halfway = (expandedH + collapsedH) / 2;
        const current = (sheetHeight as any).__getValue();
        if (current >= halfway || dy < 0) {
          expand();
        } else {
          collapse();
        }
      },
      onPanResponderTerminate: () => {
        // 中断時は現在位置でスナップ
        const halfway = (expandedH + collapsedH) / 2;
        const current = (sheetHeight as any).__getValue();
        if (current >= halfway) expand();
        else collapse();
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ===== 背景オーバーレイ（外側タップで閉じる） ===== */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        pointerEvents="auto"
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.sheetBackdrop, opacity: overlayOpacity },
          ]}
        />
      </Pressable>

      {/* ===== シート本体 ===== */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            height: sheetHeight,    // 高さで collapsed/expanded を表現
          },
        ]}
        // シート全体タップ → 最大化
        // （リストアイテムの Pressable と競合させないため、header 領域を主にタップ対象にしてあります）
        onStartShouldSetResponder={() => false}
      >
        {/* つまみ（ドラッグ操作 & タップで最大化） */}
        <Pressable
          onPress={expand}
          {...panResponder.panHandlers}
          style={styles.handleWrap}
        >
          <View style={[styles.handle, { backgroundColor: handleColor }]} />
        </Pressable>

        {/* ヘッダー（タップで最大化） */}
        <Pressable onPress={expand} style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{date}</Text>
          <Text style={[styles.count, { color: theme.textSecondary }]}>
            {items.length} events
          </Text>
        </Pressable>

        {/* リスト */}
        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View style={[styles.row, { height: rowHeight, borderBottomColor: theme.border }]}>
              {/* ここは既存の EventListItem を使ってもOK。最小構成にしています */}
              <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '600' }}>
                {item?.title ?? 'Untitled'}
              </Text>
              {item?.summary ? (
                <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {item.summary}
                </Text>
              ) : null}
            </View>
          )}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            items.length === 0
              ? [styles.empty, { backgroundColor: 'transparent' }]
              : { backgroundColor: 'transparent' }
          }
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,             // 下から生やす
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    opacity: 0.6,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 16,
    fontWeight: Platform.select({ ios: '700', android: '800' }),
    marginBottom: 4,
  },
  count: { fontSize: 12, opacity: 0.8 },
  row: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  empty: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
