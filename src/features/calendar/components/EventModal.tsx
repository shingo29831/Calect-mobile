// // src/features/calendar/screens/EventModal.tsx
// import React, { useState } from 'react';
// import { View, Text, TextInput, Button, Alert } from 'react-native';
// import type { NativeStackScreenProps } from '@react-navigation/native-stack';
// import type { RootStackParamList } from '../../../navigation';
// import dayjs from '../../../lib/dayjs';
// import { createEventLocal } from '../../../store/db';

// export default function EventModal({
//   route,
//   navigation,
// }: NativeStackScreenProps<RootStackParamList, 'EventModal'>) {
//   // 基準日（YYYY-MM-DD）
//   const base = route.params?.date || dayjs().format('YYYY-MM-DD');

//   const [title, setTitle] = useState('New Event');
//   const [startDate, setStartDate] = useState<string>(base); // YYYY-MM-DD
//   const [endDate, setEndDate] = useState<string>(base);     // YYYY-MM-DD

//   // 入力妥当性
//   const isISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && dayjs(s, 'YYYY-MM-DD', true).isValid();

//   const handleCreate = async () => {
//     const t = title.trim();
//     if (!t) {
//       Alert.alert('Title required', 'タイトルを入力してください');
//       return;
//     }
//     if (!isISODate(startDate)) {
//       Alert.alert('Invalid date', '開始日は YYYY-MM-DD で入力してください');
//       return;
//     }
//     if (!isISODate(endDate)) {
//       Alert.alert('Invalid date', '終了日は YYYY-MM-DD で入力してください');
//       return;
//     }
//     if (dayjs(endDate).isBefore(dayjs(startDate))) {
//       Alert.alert('Date range error', '終了日は開始日以降にしてください');
//       return;
//     }

//     try {
//       // ★ 時刻は不要。dtstart/dtend（日付のみ）で作成
//       //   必要最低限: title / dtstart / dtend
//       //   （カレンダーIDやタグ等が必要なら store 側のAPIに合わせて渡してください）
//       await createEventLocal({
//         title: t,
//         dtstart: startDate, // "YYYY-MM-DD"
//         dtend: endDate,     // "YYYY-MM-DD"
//       } as any);

//       navigation.goBack();
//     } catch (e: any) {
//       Alert.alert('Create failed', String(e?.message ?? e ?? 'unknown error'));
//     }
//   };

//   return (
//     <View style={{ flex: 1, padding: 16, gap: 12 }}>
//       <Text style={{ fontWeight: '700', fontSize: 18 }}>Create Event</Text>

//       {/* タイトル */}
//       <Text style={{ fontSize: 12 }}>Title</Text>
//       <TextInput
//         value={title}
//         onChangeText={setTitle}
//         placeholder="例: ミーティング"
//         autoCapitalize="sentences"
//         style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }}
//       />

//       {/* 開始日 */}
//       <Text style={{ fontSize: 12, marginTop: 8 }}>Start date (YYYY-MM-DD)</Text>
//       <TextInput
//         value={startDate}
//         onChangeText={setStartDate}
//         autoCapitalize="none"
//         placeholder="2025-10-26"
//         style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }}
//       />

//       {/* 終了日 */}
//       <Text style={{ fontSize: 12, marginTop: 8 }}>End date (YYYY-MM-DD)</Text>
//       <TextInput
//         value={endDate}
//         onChangeText={setEndDate}
//         autoCapitalize="none"
//         placeholder="2025-10-26"
//         style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }}
//       />

//       {/* 送信 */}
//       <View style={{ marginTop: 12 }}>
//         <Button title="Create" onPress={handleCreate} />
//       </View>
//     </View>
//   );
// }
