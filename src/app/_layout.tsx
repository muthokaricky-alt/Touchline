import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useSaveHydration } from '@/persistence/use-hydration';
import { colors, navigationTheme, spacing } from '@/theme';

// Keep the native splash screen up until the autosave has loaded.
// Module scope, not awaited (per the expo-splash-screen docs).
SplashScreen.preventAutoHideAsync();

/**
 * Root layout: app-wide providers and the top-level stack.
 * The tab navigator lives in the (tabs) group. Full-screen flows sit on top
 * of the tabs as stack screens (player profile, match day); pickers are modals.
 *
 * Nothing else renders until the autosave has loaded (see useSaveHydration),
 * so no screen ever shows a "new game" for a moment before the save appears.
 */
export default function RootLayout() {
  const hydrated = useSaveHydration();

  useEffect(() => {
    if (hydrated) SplashScreen.hide();
  }, [hydrated]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="light" />
        {hydrated ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="player/[id]" />
            <Stack.Screen name="match" />
            <Stack.Screen name="select-player" options={{ presentation: 'modal' }} />
          </Stack>
        ) : (
          <LoadingCareer />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Shown on web while the save loads (native shows the splash screen over it). */
function LoadingCareer() {
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="Loading your career">
      <ActivityIndicator color={colors.accent} />
      <AppText color="textSecondary">Loading your career…</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.background },
});
