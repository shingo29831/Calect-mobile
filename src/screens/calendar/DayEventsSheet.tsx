// src/screens/calendar/DayEventsSheet.tsx
import React from 'react';
import { Animated, FlatList, Platform, Pressable, Text, View, StyleSheet } from 'react-native';
import EventListItem from '../../components/EventListItem';
import { styles } from './calendarStyles';
import { useAppTheme } from '../../theme';

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
  const theme = useAppTheme();

  if (!visible) return null;

  // オーバーレイはダーク時やや濃く、ライト時は少し薄め
  const overlayColor =
    theme.mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)';

  // ハンドル色はテーマごとに少しだけ差を出す
  const handleColor =
    theme.mode === 'dark' ? theme.lineColorSelected : theme.border;

  return (
    <View style={styles.layerWrap} pointerEvents="box-none">
      <Pressable
        style={[styles.layerOverlay, { backgroundColor: overlayColor }]}
        onPress={onClose}
      />

      <Animated.View
        style={[
          styles.sheet,
          {
            height,
            transform: [{ translateY: sheetY }],
            zIndex: 10001,
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            ...(Platform.OS === 'android' ? { elevation: 16 } : {}),
          },
        ]}
      >
        <View style={styles.sheetHandleWrap}>
          <View style={[styles.sheetHandle, { backgroundColor: handleColor }]} />
        </View>

        <View
          style={[
            styles.sheetHeader,
            { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>{date}</Text>
          <Text
            style={[styles.sheetClose, { color: theme.accent }]}
            onPress={onClose}
          >
            Close
          </Text>
        </View>

        <FlatList
          data={items}
          keyExtractor={(it: any) => String(it.instance_id)}
          renderItem={({ item }) => (
            <EventListItem title={item.title} start={item.start_at} end={item.end_at} />
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textSecondary }]}>No events</Text>
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
