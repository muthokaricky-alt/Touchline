import { StyleSheet, View } from 'react-native';

import { AppText, Card, Pill } from '@/components/ui';
import { colors, radii, spacing, type ColorToken } from '@/theme';
import { formatMatchDate } from '@/utils/format';

import type { FixtureRowView, MatchdayView } from '../season-view';

const OUTCOME_COLOR: Record<'W' | 'D' | 'L', ColorToken> = { W: 'win', D: 'draw', L: 'loss' };

export function MatchdayCard({ day }: { day: MatchdayView }) {
  return (
    <Card
      title={`Matchday ${day.matchday} · ${formatMatchDate(day.date)}`}
      headerAction={day.isCurrent ? <Pill label="Next" tone="accent" /> : null}
      highlighted={day.isCurrent}>
      <View>
        {day.fixtures.map((f) => (
          <FixtureRow key={f.id} fixture={f} />
        ))}
      </View>
    </Card>
  );
}

function FixtureRow({ fixture }: { fixture: FixtureRowView }) {
  const label = fixture.score
    ? `${fixture.homeName} ${fixture.score.home}, ${fixture.awayName} ${fixture.score.away}`
    : `${fixture.homeName} versus ${fixture.awayName}, not played yet`;
  return (
    <View style={[styles.row, fixture.involvesUser && styles.userRow]} accessible accessibilityLabel={label}>
      <AppText variant={fixture.involvesUser ? 'bodyStrong' : 'body'} numberOfLines={1} align="right" style={styles.team}>
        {fixture.homeName}
      </AppText>
      <View style={[styles.score, fixture.userOutcome && { borderColor: colors[OUTCOME_COLOR[fixture.userOutcome]] }]}>
        <AppText variant="bodyStrong" color={fixture.score ? 'textPrimary' : 'textMuted'}>
          {fixture.score ? `${fixture.score.home} – ${fixture.score.away}` : 'v'}
        </AppText>
      </View>
      <AppText variant={fixture.involvesUser ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.team}>
        {fixture.awayName}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  userRow: { backgroundColor: colors.accentMuted, borderRadius: radii.sm },
  team: { flex: 1, minWidth: 0 },
  score: {
    minWidth: 64,
    alignItems: 'center',
    paddingVertical: spacing.xxs,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceRaised,
  },
});
