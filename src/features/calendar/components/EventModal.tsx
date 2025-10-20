// src/screens/.../EventModal.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation';
import dayjs from 'dayjs';
import { upsertEventOneShot } from '../../../store/serverDoc'; // ← 新API

export default function EventModal({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'EventModal'>) {
  // 画面起動日のベース（日付だけ）
  const base = route.params?.date || dayjs().format('YYYY-MM-DD');

  // 画面入力：タイトルと開始/終了は ISO 文字列のまま受ける
  const [title, setTitle] = useState('New Event');
  const [start, setStart] = useState(`${base}T09:00:00+09:00`);
  const [end, setEnd] = useState(`${base}T10:00:00+09:00`);

  // 保存処理（単発：FREQ=DAILY;COUNT=1）
  const handleCreate = async () => {
    try {
      if (!title.trim()) {
        Alert.alert('Title required', 'タイトルを入力してください。');
        return;
      }

      const startD = dayjs(start);
      const endD = dayjs(end);

      if (!startD.isValid() || !endD.isValid()) {
        Alert.alert('Invalid datetime', 'Start/End は ISO8601 形式で入力してください。');
        return;
      }
      if (endD.isBefore(startD)) {
        Alert.alert('End must be after Start', '終了は開始より後にしてください。');
        return;
      }

      // 新スキーマに合わせて分解：
      //  - date: YYYY-MM-DD（dtstart/until に使用）
      //  - start_at / end_at: HH:mm
      const date = startD.format('YYYY-MM-DD');
      const start_at = startD.format('HH:mm');
      const end_at = endD.format('HH:mm');

      // 既定のタイムゾーン（必要に応じて profile.default_tz へ差し替え可）
      const tz = 'Asia/Tokyo';

      await upsertEventOneShot({
        title,
        date,                 // ← YYYY-MM-DD（単発なので dtstart=until=同日）
        start_at,             // ← HH:mm
        end_at,               // ← HH:mm
        tz,                   // ← IANA TZ
        calendar_id: (route.params as any)?.calendarId, // あれば保存
        // tags, created_by, updated_by などは必要になったら渡す
      });

      navigation.goBack();
    } catch (e: any) {
      console.warn(e);
      Alert.alert('保存に失敗しました', String(e?.message ?? e));
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontWeight: '700', fontSize: 18 }}>Create Event</Text>

      <Text style={{ fontSize: 12 }}>Title</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Event title"
        style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }}
      />

      <Text style={{ fontSize: 12, marginTop: 8 }}>Start (ISO)</Text>
      <TextInput
        value={start}
        onChangeText={setStart}
        autoCapitalize="none"
        placeholder={`${base}T09:00:00+09:00`}
        style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }}
      />

      <Text style={{ fontSize: 12, marginTop: 8 }}>End (ISO)</Text>
      <TextInput
        value={end}
        onChangeText={setEnd}
        autoCapitalize="none"
        placeholder={`${base}T10:00:00+09:00`}
        style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }}
      />

      <View style={{ marginTop: 12 }}>
        <Button title="Create" onPress={handleCreate} />
      </View>
    </View>
  );
}
