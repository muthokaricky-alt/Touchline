import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText } from './AppText';

type PillProps = {
  label: string;
  tone?: PillTone;
};

const TONES = {
  accent: { background: colors.accentMuted, text: 'accent' },
  neutral: { background: colors.surfaceRaised, text: 'textSecondary' },
  warning: { background: colors.warningMuted, text: 'warning' },
  danger: { background: colors.dangerMuted, text: 'danger' },
  info: { background: colors.infoMuted, text: 'info' },
} as const;

export type PillTone = keyof typeof TONES;

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
