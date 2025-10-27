// src/features/calendar/components/ProfileDrawer.tsx
import React from 'react';
import { Animated, Platform, Pressable, Text, View, StyleSheet } from 'react-native';
import { PROFILE_ICON_SIZE, HAIR_SAFE, ProfileMenuRow } from './CalendarParts';
import { styles } from '../styles/calendarStyles';
import { useAppTheme } from '../../../theme';

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

  // バックドロップ（背景）の色はテーマに合わせて調整
  const overlayBg = theme.mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)';

  // アバター背景と枠線色
  const avatarBg = theme.mode === 'dark' ? '#0b1220' : '#f8fafc';
  const avatarBorder = theme.border;

  return (
    <View style={styles.layerWrap} pointerEvents="box-none">
      {/* クリック（タップ）で閉じるバックドロップ */}
      <Pressable
        style={[styles.layerOverlay, { backgroundColor: overlayBg }]}
        onPress={close}
      />

      {/* ドロワー本体（右側からスライドイン） */}
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

        {/* メニュー一覧 */}
        <View style={{ paddingVertical: 8 }}>
          <ProfileMenuRow icon="🔔" label="Notifications" />
          <ProfileMenuRow icon="⚙️" label="Settings" />
          <ProfileMenuRow icon="🎨" label="Appearance" />
          <ProfileMenuRow icon="❓" label="Help & Feedback" />
        </View>

        {/* フッター（サインアウトなど） */}
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
