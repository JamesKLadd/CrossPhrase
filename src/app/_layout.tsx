import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { startAnalytics } from '../analytics';
import { isStandaloneWebApp } from '../lib/build';
import { remoteConfig } from '../remote';
import { useMusic } from '../ui/feedback';
import { colors } from '../ui/theme';

export default function RootLayout() {
  useMusic();
  useEffect(() => {
    // The latest economy and difficulty settings, then play stats for this session.
    void remoteConfig.refresh();
    startAnalytics({ standalone: isStandaloneWebApp() });
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.paper }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}
      />
    </GestureHandlerRootView>
  );
}
