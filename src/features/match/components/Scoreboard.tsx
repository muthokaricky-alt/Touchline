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
  /** Each team's dot colour on the 2D pitch, shown beside its name. */
  kitColours?: { home: string; away: string };
  /** Scorers so far, e.g. "Óscar Vidal 30', 35'". */
  scorers?: { home: readonly string[]; away: readonly string[] };
};

/** Team names, big score, clock and status. Announces score changes to screen readers. */
export function Scoreboard({ homeName, awayName, score, clock, status, live, kitColours, scorers }: ScoreboardProps) {
  const scorerText = (lines: readonly string[] = []) => lines.join('\n');
  return (
    <View
      style={styles.board}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${homeName} ${score.home}, ${awayName} ${score.away}. ${status}, ${clock}.${
        scorers && (scorers.home.length || scorers.away.length) ? ` Scorers: ${[...scorers.home, ...scorers.away].join('; ')}.` : ''
      }`}>
      <View style={styles.meta}>
        <Pill label={status} tone={live ? 'accent' : 'neutral'} />
        <AppText variant="bodyStrong" color="textSecondary">
          {clock}
        </AppText>
      </View>
      <View style={styles.row}>
        <TeamName name={homeName} colour={kitColours?.home} />
        <AppText variant="display" style={styles.score}>
          {score.home} – {score.away}
        </AppText>
        <TeamName name={awayName} colour={kitColours?.away} />
      </View>
      {scorers && (scorers.home.length > 0 || scorers.away.length > 0) ? (
        <View style={styles.row}>
          <AppText variant="caption" color="textSecondary" align="center" style={styles.team}>
            {scorerText(scorers.home)}
          </AppText>
          <View style={styles.scoreGap} />
          <AppText variant="caption" color="textSecondary" align="center" style={styles.team}>
            {scorerText(scorers.away)}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/** A team name with its kit colour (the dots on the 2D pitch) in front. */
function TeamName({ name, colour }: { name: string; colour?: string }) {
  return (
    <View style={styles.team}>
      <View style={styles.teamLine}>
        {colour ? <View style={[styles.kit, { backgroundColor: colour }]} /> : null}
        <AppText variant="heading" align="center" numberOfLines={2} style={styles.teamName}>
          {name}
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
  teamLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  teamName: { flexShrink: 1 },
  kit: { width: 10, height: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong },
  score: { fontVariant: ['tabular-nums'] },
  // Same width as the score above, so each scorer list sits under its team.
  scoreGap: { width: 86 },
});
