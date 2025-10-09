// b/src/screens/calendar/WeekHeader.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  colWBase: number;
  colWLast: number;
  /** 週の開始曜日（0=Sun, 1=Mon ...）。未指定なら 1（Mon）。 */
  firstDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

// 安全なヘアライン幅（実機で 0 に潰れないように最低 0.5）
const HAIR_SAFE = Math.max(StyleSheet.hairlineWidth, 0.5);
const LINE_COLOR = '#e6e9ef';
const TEXT_COLOR = '#0f172a';

const BASE_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** firstDay に合わせてラベルをローテーション */
function rotateWeek(labels: string[], firstDay: number) {
  const fd = ((firstDay % 7) + 7) % 7;
  return [...labels.slice(fd), ...labels.slice(0, fd)];
}

export default function WeekHeader({ colWBase, colWLast, firstDay = 1 }: Props) {
  const labels = rotateWeek(BASE_LABELS, firstDay);

  return (
    <View style={styles.row}>
      {labels.map((label, i) => {
        const isLast = i === 6;
        const width = isLast ? colWLast : colWBase;
        return (
          <View key={label} style={[styles.cell, { width }]}>
            <Text allowFontScaling={false} style={styles.txt}>
              {label}
            </Text>

            {/* 右区切り線（最終列は描かない） */}
            {!isLast && (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  right: 0,
                  width: HAIR_SAFE,
                  backgroundColor: LINE_COLOR,
                }}
              />
            )}
          </View>
        );
      })}

      {/* 下線（absolute なので高さに影響しない） */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { top: undefined, bottom: 0, height: HAIR_SAFE, backgroundColor: LINE_COLOR },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    // 下線は absolute で描くため border は使わない
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  cell: {
    // 縦の余白は padding に統一（margin は使わない）
    paddingVertical: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txt: {
    fontSize: 11,
    fontWeight: '700',
    color: TEXT_COLOR,
    includeFontPadding: false, // Android の余白抑制
    textAlignVertical: 'center',
  },
});
