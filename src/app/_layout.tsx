import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors, navigationTheme } from '@/theme';

/**
 * Root layout: app-wide providers and the top-level stack.
 * The tab navigator lives in the (tabs) group. Full-screen flows sit on top
 * of the tabs as stack screens (player profile; later match day, new career);
 * pickers are modals.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="player/[id]" />
          <Stack.Screen name="select-player" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
