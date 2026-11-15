import { StyleSheet, View } from 'react-native';

import { AppText, Pill } from '@/components/ui';
import type { Score } from '@/engine/types';
import { colors, radii, spacing } from '@/theme';

type ScoreboardProps = {
  homeName: string;
  awayName: string;
  score: Score;
  clock: string;
  status: string;
  live: boolean;
};

/** Team names, big score, clock and status. Announces score changes to screen readers. */
export function Scoreboard({ homeName, awayName, score, clock, status, live }: ScoreboardProps) {
  return (
    <View
      style={styles.board}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${homeName} ${score.home}, ${awayName} ${score.away}. ${status}, ${clock}`}>
      <View style={styles.meta}>
        <Pill label={status} tone={live ? 'accent' : 'neutral'} />
        <AppText variant="bodyStrong" color="textSecondary">
          {clock}
        </AppText>
      </View>
      <View style={styles.row}>
        <AppText variant="heading" align="center" numberOfLines={2} style={styles.team}>
          {homeName}
        </AppText>
        <AppText variant="display" style={styles.score}>
          {score.home} – {score.away}
        </AppText>
        <AppText variant="heading" align="center" numberOfLines={2} style={styles.team}>
          {awayName}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    gap: spacing.md,
  },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  team: { flex: 1 },
  score: { fontVariant: ['tabular-nums'] },
});
