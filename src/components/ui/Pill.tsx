import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText } from './AppText';

type PillProps = {
  label: string;
  tone?: 'accent' | 'neutral' | 'warning' | 'danger';
};

const TONES = {
  accent: { background: colors.accentMuted, text: 'accent' },
  neutral: { background: colors.surfaceRaised, text: 'textSecondary' },
  warning: { background: 'rgba(245, 196, 81, 0.14)', text: 'warning' },
  danger: { background: 'rgba(242, 109, 109, 0.14)', text: 'danger' },
} as const;

/** Small status label, e.g. competition name or "Coming soon". */
export function Pill({ label, tone = 'neutral' }: PillProps) {
  const { background, text } = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <AppText variant="overline" color={text} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
});
