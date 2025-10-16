import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Platform } from "react-native";

import RootNavigator from "../navigation";     // 竊・逶ｸ蟇ｾ繝代せ豕ｨ諢・
import { bootstrapApp } from "./bootstrap";    // 襍ｷ蜍募・逅・・縺薙％縺ｫ髮・ｴ・

const queryClient = new QueryClient();

// DevTools 謗･邯夲ｼ磯幕逋ｺ譎ゅ・縺ｿ・・
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { connectToDevTools } = require("react-devtools-core");
  const host = Platform.OS === "android" ? "10.0.2.2" : "localhost";
  connectToDevTools({ host, port: 8097 });
}

export default function AppRoot() {
  useEffect(() => {
    bootstrapApp().catch((e) => {
      if (__DEV__) console.warn("[AppRoot] bootstrap failed:", e);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </QueryClientProvider>
  );
}
