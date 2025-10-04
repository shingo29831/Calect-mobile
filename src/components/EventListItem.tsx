// components/EventListItem.tsx
import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
// ✅ タイムゾーン初期化済みの dayjs を使う
import dayjs from '../lib/dayjs';

type Props = { title: string; start: string; end: string }; // ISO(UTC)

const EventListItem = ({ title, start, end }: Props) => {
  const timeText = useMemo(() => {
    const s = dayjs(start);
    const e = dayjs(end);
    const sameDay = s.isSame(e, 'day');

    const fmtDate = (d: dayjs.Dayjs) => d.format('MM/DD');
    const fmtTime = (d: dayjs.Dayjs) => d.format('HH:mm');

    return sameDay
      ? `${fmtTime(s)} - ${fmtTime(e)}`
      : `${fmtDate(s)} ${fmtTime(s)} → ${fmtDate(e)} ${fmtTime(e)}`;
  }, [start, end]);

  return (
    <View style={styles.item}>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      <Text style={styles.time}>{timeText}</Text>
    </View>
  );
};

export default memo(EventListItem, (a, b) =>
  a.title === b.title && a.start === b.start && a.end === b.end
);

const styles = StyleSheet.create({
  item: {
    height: 64, // FlatList の ROW_HEIGHT と合わせる
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: { fontWeight: '600' },
  time: { color: '#666', fontSize: 12 },
});
