// src/screens/calendar/DayEventsSheet.tsx
import React from 'react';
import { Animated, FlatList, Platform, Pressable, Text, View } from 'react-native';
import EventListItem from '../../components/EventListItem';
import { styles } from './calendarStyles';

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
      <Pressable style={styles.layerOverlay} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            height,
            transform: [{ translateY: sheetY }],
            zIndex: 10001,
            ...(Platform.OS === 'android' ? { elevation: 16 } : {}),
          },
        ]}
      >
        <View style={styles.sheetHandleWrap}>
          <View style={styles.sheetHandle} />
        </View>

        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{date}</Text>
          <Text style={styles.sheetClose} onPress={onClose}>Close</Text>
        </View>

        <FlatList
          data={items}
          keyExtractor={(it: any) => String(it.instance_id)}
          renderItem={({ item }) => (
            <EventListItem title={item.title} start={item.start_at} end={item.end_at} />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No events</Text>}
          getItemLayout={(_, i) => ({ length: rowHeight, offset: rowHeight * i, index: i })}
          initialNumToRender={10}
          windowSize={5}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={80}
          removeClippedSubviews
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
        />
      </Animated.View>
    </View>
  );
}
