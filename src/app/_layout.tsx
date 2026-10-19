import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useMusic } from '../ui/feedback';
import { colors } from '../ui/theme';

export default function RootLayout() {
  useMusic();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.paper }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}
      />
    </GestureHandlerRootView>
  );
}
