// src/screens/calendar/LeftDrawer.tsx
import React from 'react';
import { Animated, Platform, Pressable, Text, View, StyleSheet } from 'react-native';
import { DrawerRow, EntityItem } from '../CalendarParts';
import { styles } from './calendarStyles';
import { useAppTheme } from '../../theme';

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
  const theme = useAppTheme();
  if (!open) return null;

  // オーバーレイはライト時やや薄め、ダーク時は少し濃く
  const overlayBg = theme.mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)';

  return (
    <View style={styles.layerWrap} pointerEvents="box-none">
      <Pressable
        style={[styles.layerOverlay, { backgroundColor: overlayBg }]}
        onPress={closeDrawer}
      />
      <Animated.View
        style={[
          styles.drawer,
          {
            width,
            transform: [{ translateX }],
            zIndex: 10001,
            backgroundColor: theme.surface,
            borderRightColor: theme.border,
            borderRightWidth: StyleSheet.hairlineWidth,
            ...(Platform.OS === 'android' ? { elevation: 20 } : {}),
          },
        ]}
      >
        {/* Header */}
        <View
          style={[
            styles.drawerHeader,
            { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <Text style={[styles.drawerTitle, { color: theme.textPrimary }]}>Select Source</Text>
          <Text
            style={[styles.drawerClose, { color: theme.accent }]}
            onPress={closeDrawer}
          >
            Close
          </Text>
        </View>

        {/* Organizations */}
        <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>Organizations</Text>
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
        <Text style={[styles.sectionHeader, { color: theme.textSecondary, marginTop: 8 }]}>
          Following
        </Text>
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
