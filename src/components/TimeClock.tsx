// src/components/TimeClock.tsx
import React, { memo } from 'react';
import { View, Text, Pressable } from 'react-native';

type TimeClockProps = {
  size?: number;            // 直径
  innerRatio?: number;      // 内周(0〜1) [0.55〜0.70推奨]
  value?: number | null;    // 選択中の時（0〜23）
  onSelect: (hour: number) => void;
  renderCenter?: React.ReactNode; // 中央描画（任意）
};

/**
 * 0〜23 の数字を円周上に並べた “時計ダイヤル”
 * - 0〜23 を外周上にPressableで並べる
 * - 画面回転や倍率に依存しないように単純な三角関数でXY配置
 */
const TimeClock: React.FC<TimeClockProps> = ({
  size = 300,
  innerRatio = 0.62,
  value = null,
  onSelect,
  renderCenter,
}) => {
  const radius = size / 2;
  const ringR = radius * innerRatio;
  const items = Array.from({ length: 24 }, (_, h) => h);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* 目盛り（時ボタン） */}
      <View
        style={{
          position: 'absolute',
          left: 0, right: 0, top: 0, bottom: 0,
        }}
      >
        {items.map((h) => {
          // 12時を上に、時計回り配置（角度0が上方向になるよう -90°）
          const angle = ((h / 24) * 360 - 90) * (Math.PI / 180);
          const x = radius + ringR * Math.cos(angle);
          const y = radius + ringR * Math.sin(angle);

          const selected = value === h;

          return (
            <Pressable
              key={h}
              onPress={() => onSelect(h)}
              style={{
                position: 'absolute',
                left: x - 22,
                top:  y - 22,
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? '#2563eb' : 'transparent',
              }}
            >
              <Text style={{ fontWeight: '700', color: selected ? '#fff' : '#111' }}>
                {h}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 中央表示（選択中の時刻など） */}
      <View
        style={{
          width: radius * 0.9,
          height: radius * 0.9,
          borderRadius: (radius * 0.9) / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {renderCenter ?? (
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#111' }}>
            {value ?? '--'}:00
          </Text>
        )}
      </View>
    </View>
  );
};

export default memo(TimeClock);
