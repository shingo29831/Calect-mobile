// src/features/calendar/components/DayEventsSheet.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  onPressEdit?: (row: any) => void;
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
  onPressEdit,
}: Props) {
  const theme = useAppTheme();

  // 折りたたみ <-> 全開
  const expandedH = height;
  const collapsedH = Math.max(200, height * SNAP_RATIO_COLLAPSED);
  const sheetHeight = useRef(new Animated.Value(collapsedH)).current;

  // バックドロップのフェード
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  // つまみ（ドラッグハンドル）の色
  const handleColor = useMemo(() => theme.border, [theme.border]);

  // 「編集」ボタン表示中の行インデックス（未選択は -1）
  const [activeIndex, setActiveIndex] = useState(-1);

  // visible の変化に応じてフェード/高さを調整
  useEffect(() => {
    Animated.timing(overlayOpacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
    if (!visible) {
      // 非表示にする時は高さを畳んだ状態へ戻す & 編集ボタンも閉じる
      sheetHeight.setValue(collapsedH);
      setActiveIndex(-1);
    }
  }, [visible, overlayOpacity, collapsedH, sheetHeight]);

  // データが変わったら編集ボタンを閉じる
  useEffect(() => {
    setActiveIndex(-1);
  }, [date, items?.length]);

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
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_, gesture) => {
        const next = Math.min(
          expandedH,
          Math.max(collapsedH, (sheetHeight as any).__getValue() - gesture.dy)
        );
        sheetHeight.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const { dy, vy } = gesture;
        if (dy > DRAG_CLOSE_THRESHOLD_PX || vy > DRAG_CLOSE_VELOCITY) {
          onClose();
          return;
        }
        const halfway = (expandedH + collapsedH) / 2;
        const current = (sheetHeight as any).__getValue();
        if (current >= halfway || dy < 0) expand();
        else collapse();
      },
      onPanResponderTerminate: () => {
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
            height: sheetHeight,
          },
        ]}
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
          renderItem={({ item, index }) => {
            const isActive = index === activeIndex;
            return (
              <Pressable
                onPress={() => setActiveIndex(isActive ? -1 : index)}
                style={[
                  styles.row,
                  {
                    height: rowHeight,
                    borderBottomColor: theme.border,
                  },
                ]}
              >
                {/* 左：タイトル/サマリー（縦積み） */}
                <View style={styles.rowLeft}>
                  <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '600' }}>
                    {item?.title ?? 'Untitled'}
                  </Text>
                  {item?.summary ? (
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                      {item.summary}
                    </Text>
                  ) : null}
                </View>

                {/* 右：編集ボタン（行タップでだけ表示） */}
                {isActive && (
                  <Pressable
                    onPress={() => onPressEdit?.(item)}
                    hitSlop={10}
                    style={[
                      styles.editBtn,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.appBg,
                      },
                    ]}
                    accessibilityLabel="このイベントを編集"
                  >
                    <Text style={{ color: theme.textPrimary, fontWeight: '800' }}>編集</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            items.length === 0
              ? [styles.empty, { backgroundColor: 'transparent' }]
              : { backgroundColor: 'transparent' }
          }
          onScrollBeginDrag={() => setActiveIndex(-1)}
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
    bottom: 0,
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
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'center',
  },
  empty: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export {};
