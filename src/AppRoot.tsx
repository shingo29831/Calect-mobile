import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RootNavigator from './navigation';
import { Platform } from 'react-native';


const qc = new QueryClient();

// index.tsx or App.tsx (最上部付近)
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { connectToDevTools } = require('react-devtools-core');

  // エミュレータ/実機に合わせてホストを選択
  const host =
    Platform?.OS === 'android'
      ? // Androidエミュレータなら 10.0.2.2、実機はPCのLAN IPに差し替え
        '10.0.2.2'
      : 'localhost';

  connectToDevTools({
    host,
    port: 8097, // React DevTools のデフォルト
  });
}


export default function AppRoot(){
return (
    
<QueryClientProvider client={qc}>
<NavigationContainer>
<RootNavigator />
</NavigationContainer>
</QueryClientProvider>
);
}