// src/features/calendar/components/DayEventsSheet.tsx
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
import { useAppTheme } from '../../../theme';

/**
 * 使い方メモ:
 * - `visible`: シート表示のON/OFF
 * - `height`: 画面から受け取る実高さ（折りたたみ/全開の基準）
 * - `date`: 対象日（表示用）
 * - `items`: 表示するイベント行
 * - `onClose`: バックドロップや下方向スワイプで閉じるときに呼ばれる
 * - `onEndReached`: 末尾付近までスクロールしたときに追加読み込み
 * - `rowHeight`: 1行あたりの高さ
 */
type Props = {
  visible: boolean;
  sheetY: Animated.Value; // （互換のため残す。内部では height を使用）
  height: number;
  date: string;
  items: any[];
  onClose: () => void;
  onEndReached: () => void;
  rowHeight: number;
};

const SNAP_RATIO_COLLAPSED = 0.45; // 折りたたみ時の高さ（画面の45%）
const DRAG_CLOSE_THRESHOLD_PX = 80; // 下方向ドラッグ距離でクローズ
const DRAG_CLOSE_VELOCITY = 1.0;    // 速度でクローズ判定する閾値

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

  // 折りたたみ <-> 全開 を1本の Animated.Value で管理
  const expandedH = height;
  const collapsedH = Math.max(200, height * SNAP_RATIO_COLLAPSED);
  const sheetHeight = useRef(new Animated.Value(collapsedH)).current;

  // バックドロップのフェード
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  // つまみ（ドラッグハンドル）の色はテーマから
  const handleColor = useMemo(() => theme.border, [theme.border]);

  // visible の変化に応じてフェード/高さを調整
  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
    if (!visible) {
      // 非表示にする時は高さを畳んだ状態へ戻す
      sheetHeight.setValue(collapsedH);
    }
  }, [visible, overlayOpacity, collapsedH, sheetHeight]);

  // 開閉アニメーション
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

  // ドラッグ操作
  const dragY = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        // 縦方向に一定以上動いたらパン開始
        return Math.abs(gesture.dy) > 4;
      },
      onPanResponderGrant: () => {
        dragY.current = 0;
      },
      onPanResponderMove: (_, gesture) => {
        dragY.current = gesture.dy;
        // 現在の高さからドラッグ量を反映し、範囲内にクランプ
        const next = Math.min(
          expandedH,
          Math.max(collapsedH, (sheetHeight as any).__getValue() - gesture.dy)
        );
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const { dy, vy } = gesture;
        // 一定距離 or 速度で下方向なら閉じる
        if (dy > DRAG_CLOSE_THRESHOLD_PX || vy > DRAG_CLOSE_VELOCITY) {
          onClose();
          return;
        }
        // 途中位置の場合は中間値で開く/閉じるを決める
        const halfway = (expandedH + collapsedH) / 2;
        const current = (sheetHeight as any).__getValue();
        if (current >= halfway || dy < 0) {
          expand();
        } else {
          collapse();
        }
      },
      onPanResponderTerminate: () => {
        // ジェスチャ中断時も中間値でスナップ
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
      {/* ===== バックドロップ（タップで閉じる） ===== */}
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
            height: sheetHeight, // 折りたたみ/全開をこの値で切り替え
          },
        ]}
        // 内側の Pressable と競合させない
        onStartShouldSetResponder={() => false}
      >
        {/* つまみ領域（ドラッグで開閉 / タップで展開） */}
        <Pressable
          onPress={expand}
          {...panResponder.panHandlers}
          style={styles.handleWrap}
        >
          <View style={[styles.handle, { backgroundColor: handleColor }]} />
        </Pressable>

        {/* ヘッダー（タイトル＋件数） */}
        <Pressable onPress={expand} style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{date}</Text>
          <Text style={[styles.count, { color: theme.textSecondary }]}>
            {items.length} events
          </Text>
        </Pressable>

        {/* リスト本体 */}
        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View style={[styles.row, { height: rowHeight, borderBottomColor: theme.border }]}>
              {/* NOTE: 必要になったら専用の <EventListItem /> へ差し替え */}
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
    bottom: 0, // 画面下からスライドイン
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

export {};
