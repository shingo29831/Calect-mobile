// src/screens/calendar/ProfileDrawer.tsx
import React from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { PROFILE_ICON_SIZE, HAIR_SAFE, ProfileMenuRow } from '../CalendarParts';
import { styles } from './calendarStyles';

/** ==== Dark theme palette (local overrides) ==== */
const OVERLAY_BG    = 'rgba(0,0,0,0.55)';
const PANEL_BG      = '#0f172a';   // ドロワー面
const BORDER        = '#334155';   // 罫線
const AVATAR_BG     = '#0b1220';
const AVATAR_BORDER = '#1f2937';
const TEXT_PRIMARY  = '#e2e8f0';
const TEXT_MUTED    = '#94a3b8';
const ACCENT_TEXT   = '#93c5fd';

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
      {/* ダークオーバーレイ */}
      <Pressable style={[styles.layerOverlay, { backgroundColor: OVERLAY_BG }]} onPress={close} />

      <Animated.View
        style={[
          styles.profileDrawer,
          {
            width,
            transform: [{ translateX }],
            zIndex: 10001,
            backgroundColor: PANEL_BG,
            borderLeftColor: BORDER,     // 右側ドロワーなので左に境界線
            borderLeftWidth: 1,
            ...(Platform.OS === 'android' ? { elevation: 20 } : {}),
          },
        ]}
      >
        {/* ヘッダー */}
        <View
          style={[
            styles.profileHeader,
            { borderBottomColor: BORDER, borderBottomWidth: 1 },
          ]}
        >
          <View
            style={{
              width: PROFILE_ICON_SIZE + 8,
              height: PROFILE_ICON_SIZE + 8,
              borderRadius: (PROFILE_ICON_SIZE + 8) / 2,
              backgroundColor: AVATAR_BG,
              borderWidth: HAIR_SAFE,
              borderColor: AVATAR_BORDER,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>{emoji}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: TEXT_PRIMARY }]}>Your Name</Text>
            <Text style={[styles.profileEmail, { color: TEXT_MUTED }]}>you@example.com</Text>
          </View>

          <Text style={[styles.drawerClose, { color: ACCENT_TEXT }]} onPress={close}>
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
        <View style={[styles.profileFooter, { borderTopColor: BORDER, borderTopWidth: 1 }]}>
          <ProfileMenuRow icon="🚪" label="Sign out" />
        </View>
      </Animated.View>
    </View>
  );
}
