// src/components/CalendarIcon.tsx
import React from 'react';
import { Image, View, Text } from 'react-native';
import { HAIR_SAFE } from '../screens/CalendarParts';
import { getCalendarIconPath } from '../store/appData';

type Props = {
  calendarId?: string | null;
  size?: number;        // px
  fallbackEmoji?: string; // アイコン未設定時の絵文字
};

export default function CalendarIcon({ calendarId, size = 18, fallbackEmoji = '📅' }: Props) {
  const uri = getCalendarIconPath(calendarId);
  const radius = Math.floor(size / 2);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: HAIR_SAFE,
          borderColor: '#e5e7eb',
        }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: '#f3f4f6',
        borderWidth: HAIR_SAFE,
        borderColor: '#e5e7eb',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: Math.max(10, size * 0.65), lineHeight: size * 0.9 }}>{fallbackEmoji}</Text>
    </View>
  );
}
