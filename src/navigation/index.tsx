import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CalendarScreen from '../features/calendar/screens/CalendarScreen';
import EventModal from '../features/calendar/components/EventModal';


export type RootStackParamList = {
Calendar: undefined;
EventModal: { date?: string; start?: string; end?: string } | undefined;
DebugJson: undefined;
};


const Stack = createNativeStackNavigator<RootStackParamList>();


export default function RootNavigator(){
return (
<Stack.Navigator>
    <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calect' }} />
    <Stack.Screen name="EventModal" component={EventModal} options={{ presentation: 'modal', title: 'Create Event' }} />
</Stack.Navigator>
);
}
