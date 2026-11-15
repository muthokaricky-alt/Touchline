import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/theme';

type ScreenProps = {
  children: ReactNode;
  /** Set false for screens that manage their own scrolling (e.g. long lists). */
  scroll?: boolean;
};

/**
 * Base wrapper for every top-level screen: safe-area padding, background
 * colour, and a centred max-width column so wide web/tablet layouts stay tidy.
 * Bottom inset is handled by the tab bar, so only the top edge is padded here.
 */
export function Screen({ children, scroll = true }: ScreenProps) {
  const content = <View style={styles.column}>{children}</View>;
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        <View style={styles.scrollContent}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  column: { width: '100%', maxWidth: layout.maxContentWidth, gap: spacing.lg },
});
