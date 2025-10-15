// src/screens/calendar/LeftDrawer.tsx
import React from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { DrawerRow, EntityItem } from '../CalendarParts';
import { styles } from './calendarStyles';

/** ==== Dark theme palette (local overrides) ==== */
const OVERLAY_BG       = 'rgba(0,0,0,0.55)';
const DRAWER_BG        = '#0f172a';   // 面
const DRAWER_BORDER    = '#334155';   // 罫線・境界
const TEXT_PRIMARY     = '#e2e8f0';
const TEXT_MUTED       = '#94a3b8';
const ACCENT_TEXT      = '#93c5fd';

type Props = {
  open: boolean;
  width: number;
  translateX: Animated.Value;
  selectedEntityId: string;
  setSelectedEntityId: (id: string) => void;
  expandedOrgId: string | null;
  setExpandedOrgId: (id: string | null) => void;
  closeDrawer: () => void;
  ORGS: EntityItem[];
  GROUPS_BY_ORG: Record<string, EntityItem[]>;
  FOLLOWS: EntityItem[];
};

export default function LeftDrawer({
  open,
  width,
  translateX,
  selectedEntityId,
  setSelectedEntityId,
  expandedOrgId,
  setExpandedOrgId,
  closeDrawer,
  ORGS,
  GROUPS_BY_ORG,
  FOLLOWS,
}: Props) {
  if (!open) return null;
  return (
    <View style={styles.layerWrap} pointerEvents="box-none">
      {/* ダークなオーバーレイ */}
      <Pressable style={[styles.layerOverlay, { backgroundColor: OVERLAY_BG }]} onPress={closeDrawer} />
      <Animated.View
        style={[
          styles.drawer,
          {
            width,
            transform: [{ translateX }],
            zIndex: 10001,
            backgroundColor: DRAWER_BG,
            borderRightColor: DRAWER_BORDER,
            borderRightWidth: 1,
            ...(Platform.OS === 'android' ? { elevation: 20 } : {}),
          },
        ]}
      >
        {/* ヘッダー */}
        <View
          style={[
            styles.drawerHeader,
            { borderBottomColor: DRAWER_BORDER, borderBottomWidth: 1 },
          ]}
        >
          <Text style={[styles.drawerTitle, { color: TEXT_PRIMARY }]}>Select Source</Text>
          <Text style={[styles.drawerClose, { color: ACCENT_TEXT }]} onPress={closeDrawer}>
            Close
          </Text>
        </View>

        {/* Organizations */}
        <Text style={[styles.sectionHeader, { color: TEXT_MUTED }]}>Organizations</Text>
        {ORGS.map((org) => {
          const isExpanded = expandedOrgId === org.id;
          const groups = GROUPS_BY_ORG[org.id] ?? [];
          return (
            <View key={org.id}>
              <DrawerRow
                item={org}
                active={selectedEntityId === org.id}
                onPress={(o: EntityItem) => {
                  if (isExpanded) {
                    setSelectedEntityId(o.id);
                    closeDrawer();
                  } else {
                    setExpandedOrgId(o.id);
                    setSelectedEntityId(o.id);
                  }
                }}
                indent={0}
                chevron={groups.length > 0 ? (isExpanded ? 'down' : 'right') : null}
              />
              {isExpanded &&
                groups.map((grp) => (
                  <DrawerRow
                    key={grp.id}
                    item={grp}
                    active={selectedEntityId === grp.id}
                    onPress={(g: EntityItem) => {
                      setSelectedEntityId(g.id);
                      closeDrawer();
                    }}
                    indent={24}
                    chevron={null}
                  />
                ))}
            </View>
          );
        })}

        {/* Following */}
        <Text style={[styles.sectionHeader, { color: TEXT_MUTED, marginTop: 8 }]}>Following</Text>
        {FOLLOWS.map((u) => (
          <DrawerRow
            key={u.id}
            item={u}
            active={selectedEntityId === u.id}
            onPress={(usr: EntityItem) => {
              setSelectedEntityId(usr.id);
              closeDrawer();
            }}
            indent={0}
            chevron={null}
          />
        ))}
      </Animated.View>
    </View>
  );
}
