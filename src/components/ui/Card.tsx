import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { SectionHeader } from './SectionHeader';
import type { IconName } from './Icon';

type CardProps = {
  children: ReactNode;
  title?: string;
  icon?: IconName;
  /** Optional element on the right of the header, e.g. a "View all" link. */
  headerAction?: ReactNode;
  /** Highlighted cards get an accent border — use sparingly (one per screen). */
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The standard panel used across Touchline screens. */
export function Card({ children, title, icon, headerAction, highlighted, style }: CardProps) {
  return (
    <View style={[styles.card, highlighted && styles.highlighted, style]}>
      {title ? <SectionHeader title={title} icon={icon} action={headerAction} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  highlighted: {
    borderColor: colors.accent,
    borderWidth: 1,
  },
});
