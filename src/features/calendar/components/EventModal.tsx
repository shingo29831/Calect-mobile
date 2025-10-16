import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation';
import dayjs from 'dayjs';
import { createEventLocal } from '../../../store/db';


export default function EventModal({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'EventModal'>){
const base = route.params?.date || dayjs().format('YYYY-MM-DD');
const [title, setTitle] = useState('New Event');
const [start, setStart] = useState(`${base}T09:00:00`);
const [end, setEnd] = useState(`${base}T10:00:00`);


return (
<View style={{ flex: 1, padding: 16, gap: 12 }}>
<Text style={{ fontWeight: '700', fontSize: 18 }}>Create Event</Text>


<Text style={{ fontSize: 12 }}>Title</Text>
<TextInput value={title} onChangeText={setTitle} style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />


<Text style={{ fontSize: 12, marginTop: 8 }}>Start (ISO)</Text>
<TextInput value={start} onChangeText={setStart} autoCapitalize='none' style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />


<Text style={{ fontSize: 12, marginTop: 8 }}>End (ISO)</Text>
<TextInput value={end} onChangeText={setEnd} autoCapitalize='none' style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />


<View style={{ marginTop: 12 }}>
<Button title="Create" onPress={() => {
if(!title.trim()) { Alert.alert('Title required'); return; }
if(dayjs(end).isBefore(dayjs(start))) { Alert.alert('End must be after Start'); return; }
createEventLocal({ title, start_at: start, end_at: end });
navigation.goBack();
}} />
</View>
</View>
);
}
