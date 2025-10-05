// src/screens/calendar/LeftDrawer.tsx
import React from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { DrawerRow, EntityItem } from '../CalendarParts';
import { styles } from './calendarStyles';

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
      <Pressable style={styles.layerOverlay} onPress={closeDrawer} />
      <Animated.View
        style={[
          styles.drawer,
          {
            width,
            transform: [{ translateX }],
            zIndex: 10001,
            ...(Platform.OS === 'android' ? { elevation: 20 } : {}),
          },
        ]}
      >
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Select Source</Text>
          <Text style={styles.drawerClose} onPress={closeDrawer}>Close</Text>
        </View>

        <Text style={styles.sectionHeader}>Organizations</Text>
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
                    onPress={(g: EntityItem) => { setSelectedEntityId(g.id); closeDrawer(); }}
                    indent={24}
                    chevron={null}
                  />
                ))}
            </View>
          );
        })}

        <Text style={styles.sectionHeader}>Following</Text>
        {FOLLOWS.map((u) => (
          <DrawerRow
            key={u.id}
            item={u}
            active={selectedEntityId === u.id}
            onPress={(usr: EntityItem) => { setSelectedEntityId(usr.id); closeDrawer(); }}
            indent={0}
            chevron={null}
          />
        ))}
      </Animated.View>
    </View>
  );
}
