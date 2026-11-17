import { Stack, ThemeProvider } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useOfflineSupport } from '@/components/use-offline-support';
import { MusicPlayer } from '@/features/music/MusicPlayer';
import { useSaveHydration } from '@/persistence/use-hydration';
import { colors, navigationTheme, spacing } from '@/theme';

// Keep the native splash screen up until the autosave has loaded.
// Module scope, not awaited (per the expo-splash-screen docs).
SplashScreen.preventAutoHideAsync();

// The app is portrait; only the match screen unlocks rotation (full-screen 2D pitch), see
// features/match/use-match-view.ts. app.json allows both orientations so that's possible.
if (Platform.OS !== 'web') void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);

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
  // Website only: the service worker that makes it installable and playable offline.
  useOfflineSupport();

  useEffect(() => {
    if (hydrated) SplashScreen.hide();
  }, [hydrated]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="light" />
        {/* After the save has loaded: so never during the website's pre-rendering. */}
        {hydrated ? <MusicPlayer /> : null}
        {hydrated ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="player/[id]" />
            <Stack.Screen name="match" />
            <Stack.Screen name="transfers" />
            <Stack.Screen name="negotiate" />
            <Stack.Screen name="inbox" />
            <Stack.Screen name="training" />
            <Stack.Screen name="new-career" options={{ gestureEnabled: false }} />
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
