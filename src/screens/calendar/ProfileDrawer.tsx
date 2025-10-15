// src/screens/calendar/ProfileDrawer.tsx
import React from 'react';
import { Animated, Platform, Pressable, Text, View, StyleSheet } from 'react-native';
import { PROFILE_ICON_SIZE, HAIR_SAFE, ProfileMenuRow } from '../CalendarParts';
import { styles } from './calendarStyles';
import { useAppTheme } from '../../theme';

type Props = {
  open: boolean;
  width: number;
  translateX: Animated.Value;
  close: () => void;
  emoji: string;
};

export default function ProfileDrawer({ open, width, translateX, close, emoji }: Props) {
  const theme = useAppTheme();
  if (!open) return null;

  // ライト/ダークで濃さを変える
  const overlayBg = theme.mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)';

  // アバターの面は app 背景を薄く使う（境界はテーマの border）
  const avatarBg = theme.mode === 'dark' ? '#0b1220' : '#f8fafc';
  const avatarBorder = theme.border;

  return (
    <View style={styles.layerWrap} pointerEvents="box-none">
      <Pressable
        style={[styles.layerOverlay, { backgroundColor: overlayBg }]}
        onPress={close}
      />

      <Animated.View
        style={[
          styles.profileDrawer,
          {
            width,
            transform: [{ translateX }],
            zIndex: 10001,
            backgroundColor: theme.surface,
            borderLeftColor: theme.border, // 右側ドロワーなので左に境界線
            borderLeftWidth: StyleSheet.hairlineWidth,
            ...(Platform.OS === 'android' ? { elevation: 20 } : {}),
          },
        ]}
      >
        {/* ヘッダー */}
        <View
          style={[
            styles.profileHeader,
            { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <View
            style={{
              width: PROFILE_ICON_SIZE + 8,
              height: PROFILE_ICON_SIZE + 8,
              borderRadius: (PROFILE_ICON_SIZE + 8) / 2,
              backgroundColor: avatarBg,
              borderWidth: HAIR_SAFE,
              borderColor: avatarBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>{emoji}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: theme.textPrimary }]}>Your Name</Text>
            <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>you@example.com</Text>
          </View>

          <Text
            style={[styles.drawerClose, { color: theme.accent }]}
            onPress={close}
          >
            Close
          </Text>
        </View>

        {/* メニュー（本体） */}
        <View style={{ paddingVertical: 8 }}>
          <ProfileMenuRow icon="🔔" label="Notifications" />
          <ProfileMenuRow icon="⚙️" label="Settings" />
          <ProfileMenuRow icon="🎨" label="Appearance" />
          <ProfileMenuRow icon="❓" label="Help & Feedback" />
        </View>

        {/* フッター（区切り線） */}
        <View
          style={[
            styles.profileFooter,
            { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <ProfileMenuRow icon="🚪" label="Sign out" />
        </View>
      </Animated.View>
    </View>
  );
}
