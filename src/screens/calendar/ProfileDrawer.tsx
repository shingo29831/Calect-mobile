// src/screens/calendar/ProfileDrawer.tsx
import React from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { PROFILE_ICON_SIZE, HAIR_SAFE, ProfileMenuRow } from '../CalendarParts';
import { styles } from './calendarStyles';

type Props = {
  open: boolean;
  width: number;
  translateX: Animated.Value;
  close: () => void;
  emoji: string;
};

export default function ProfileDrawer({ open, width, translateX, close, emoji }: Props) {
  if (!open) return null;

  return (
    <View style={styles.layerWrap} pointerEvents="box-none">
      <Pressable style={styles.layerOverlay} onPress={close} />
      <Animated.View
        style={[
          styles.profileDrawer,
          {
            width,
            transform: [{ translateX }],
            zIndex: 10001,
            ...(Platform.OS === 'android' ? { elevation: 20 } : {}),
          },
        ]}
      >
        <View style={styles.profileHeader}>
          <View style={{
            width: PROFILE_ICON_SIZE + 8,
            height: PROFILE_ICON_SIZE + 8,
            borderRadius: (PROFILE_ICON_SIZE + 8) / 2,
            backgroundColor: '#f1f5f9',
            borderWidth: HAIR_SAFE,
            borderColor: '#e5e7eb',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 18 }}>{emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>Your Name</Text>
            <Text style={styles.profileEmail}>you@example.com</Text>
          </View>
          <Text style={styles.drawerClose} onPress={close}>Close</Text>
        </View>

        <View style={{ paddingVertical: 8 }}>
          <ProfileMenuRow icon="🔔" label="Notifications" />
          <ProfileMenuRow icon="⚙️" label="Settings" />
          <ProfileMenuRow icon="🎨" label="Appearance" />
          <ProfileMenuRow icon="❓" label="Help & Feedback" />
        </View>

        <View style={styles.profileFooter}>
          <ProfileMenuRow icon="🚪" label="Sign out" />
        </View>
      </Animated.View>
    </View>
  );
}
