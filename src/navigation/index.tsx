// src/navigation/index.ts
// ルートスタック

import React from 'react';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import CalendarScreen from '../features/calendar/screens/CalendarScreen';
import EventModal from '../features/calendar/screens/EventModal';
import type { EventVisibility } from '../api/types';

/* =========================================================
 * EventModal に渡すパラメータ型
 *  - Strict: 既存のフル項目（編集/新規でそのまま使える）
 *  - Loose : まず日付や一部だけ渡してモーダル側で初期化したいケース
 *    （date / startDate / initialDate / selected / baseDate などを許容）
 * ========================================================= */

// 1) 既存のフル項目（従来互換）
export type EventModalParamsStrict = {
  event_id?: string;        // 編集時のみ
  calendar_id: string;      // 'CAL_LOCAL_DEFAULT' など
  title: string;
  summary?: string;
  start_date: string;       // YYYY-MM-DD
  end_date: string;         // YYYY-MM-DD
  start_time: string;       // HH:mm
  end_time: string;         // HH:mm
  tz: string;               // 'local' 等
  tags: string[];
  visibility: EventVisibility; // 'Hidden' など
};

// 2) ゆるい受け取り（最低限の日付や一部の初期値だけ）
export type EventModalParamsLoose = {
  // 日付の別名にも対応（どれかが来ればOK）
  date?: string;
  startDate?: string;
  initialDate?: string;
  selected?: string;
  baseDate?: string;

  // 事前に一部だけ埋めておきたいときのプリセット
  // （Strict のキーのいくつかを省略可で受け取れる）
  preset?: Partial<{
    event_id: string;
    calendar_id: string;
    title: string;
    summary: string;
    start_date: string;
    end_date: string;
    start_time: string;
    end_time: string;
    tz: string;
    tags: string[];
    visibility: EventVisibility;
  }>;
};

// 3) EventModal で受け取れる総合型（どちらでもOK / 省略も可）
export type EventModalParams = EventModalParamsStrict | EventModalParamsLoose;

// ===== ルートパラメータ
export type RootStackParamList = {
  Calendar: undefined;
  // 省略（undefined）でも開けるようにしておくと使い勝手が良い
  EventModal: EventModalParams | undefined;
  DebugJson: undefined; // 既存のまま残しておきます（必要なら画面を追加してください）
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ title: 'Calect' }}
      />
      <Stack.Screen
        name="EventModal"
        component={EventModal}
        options={{
          headerShown: false,
          presentation: 'transparentModal', // 下からせり上がるモーダル
          animation: 'slide_from_bottom',
        }}
      />
      {/*
        DebugJson 画面を使う場合は下を有効化して、対応するコンポーネントを import してください。
        <Stack.Screen name="DebugJson" component={DebugJsonScreen} />
      */}
    </Stack.Navigator>
  );
}

//（必要なら）各画面の Props 型
export type CalendarScreenProps = NativeStackScreenProps<RootStackParamList, 'Calendar'>;
export type EventModalScreenProps   = NativeStackScreenProps<RootStackParamList, 'EventModal'>;
