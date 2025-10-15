// src/screens/calendar/DayEventsSheet.tsx
import React from 'react';
import { Animated, FlatList, Platform, Pressable, Text, View } from 'react-native';
import EventListItem from '../../components/EventListItem';
import { styles } from './calendarStyles';

/** ==== Dark theme palette (local overrides) ==== */
const APP_OVERLAY = 'rgba(0,0,0,0.55)';
const SHEET_BG    = '#0f172a';
const BORDER_TOP  = '#334155';
const HANDLE_BG   = '#475569';
const TEXT_PRIMARY   = '#e2e8f0';
const TEXT_SECONDARY = '#94a3b8';
const ACCENT_TEXT    = '#93c5fd';

type Props = {
  visible: boolean;
  sheetY: Animated.Value;
  height: number;
  date: string;
  items: any[];
  onClose: () => void;
  onEndReached: () => void;
  rowHeight: number;
};

export default function DayEventsSheet({
  visible,
  sheetY,
  height,
  date,
  items,
  onClose,
  onEndReached,
  rowHeight,
}: Props) {
  if (!visible) return null;

  return (
    <View style={styles.layerWrap} pointerEvents="box-none">
      {/* Overlay をダークに */}
      <Pressable
        style={[styles.layerOverlay, { backgroundColor: APP_OVERLAY }]}
        onPress={onClose}
      />

      <Animated.View
        style={[
          styles.sheet,
          {
            height,
            transform: [{ translateY: sheetY }],
            zIndex: 10001,
            backgroundColor: SHEET_BG,
            borderTopColor: BORDER_TOP,
            ...(Platform.OS === 'android' ? { elevation: 16 } : {}),
          },
        ]}
      >
        {/* つまみもダーク調整 */}
        <View style={styles.sheetHandleWrap}>
          <View style={[styles.sheetHandle, { backgroundColor: HANDLE_BG }]} />
        </View>

        {/* ヘッダー：罫線 & テキスト色 */}
        <View
          style={[
            styles.sheetHeader,
            { borderBottomColor: BORDER_TOP, borderBottomWidth: 1 },
          ]}
        >
          <Text style={[styles.sheetTitle, { color: TEXT_PRIMARY }]}>{date}</Text>
          <Text
            style={[styles.sheetClose, { color: ACCENT_TEXT }]}
            onPress={onClose}
          >
            Close
          </Text>
        </View>

        {/* リスト：空表示含めて文字色を上書き */}
        <FlatList
          data={items}
          keyExtractor={(it: any) => String(it.instance_id)}
          renderItem={({ item }) => (
            // EventListItem の内部がライト前提でも背景透過なら違和感が出ないよう薄い区切りを追加しない方針
            <EventListItem title={item.title} start={item.start_at} end={item.end_at} />
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: TEXT_SECONDARY }]}>No events</Text>
          }
          getItemLayout={(_, i) => ({ length: rowHeight, offset: rowHeight * i, index: i })}
          initialNumToRender={10}
          windowSize={5}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={80}
          removeClippedSubviews
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          contentContainerStyle={
            items.length === 0
              ? [styles.emptyContainer, { backgroundColor: 'transparent' }]
              : { backgroundColor: 'transparent' }
          }
        />
      </Animated.View>
    </View>
  );
}
