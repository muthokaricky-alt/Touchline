import { StyleSheet, View } from 'react-native';

import { AppText, Card, IconButton, Pill } from '@/components/ui';
import { colors, radii, spacing, type ColorToken } from '@/theme';
import { formatMatchDate } from '@/utils/format';

import type { FixtureRowView, MatchdayView } from '../season-view';

const OUTCOME_COLOR: Record<'W' | 'D' | 'L', ColorToken> = { W: 'win', D: 'draw', L: 'loss' };

type MatchdayPagerProps = {
  day: MatchdayView;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
};

/** One matchday at a time with previous/next: 38 cards in a row would be a very long scroll. */
export function MatchdayPager({ day, total, onPrevious, onNext }: MatchdayPagerProps) {
  return (
    <Card highlighted={day.isCurrent}>
      <View style={styles.pagerHeader}>
        <IconButton icon="chevronLeft" accessibilityLabel="Previous matchday" onPress={onPrevious} disabled={day.matchday <= 1} />
        <View style={styles.pagerTitle}>
          <AppText variant="heading" align="center">
            Matchday {day.matchday} of {total}
          </AppText>
          <View style={styles.pagerMeta}>
            <AppText variant="caption" color="textSecondary">
              {formatMatchDate(day.date, true)}
            </AppText>
            {day.isCurrent ? <Pill label="Next" tone="accent" /> : null}
          </View>
        </View>
        <IconButton icon="chevronRight" accessibilityLabel="Next matchday" onPress={onNext} disabled={day.matchday >= total} />
      </View>
      <View>
        {day.fixtures.map((f) => (
          <FixtureRow key={f.id} fixture={f} />
        ))}
      </View>
    </Card>
  );
}

export function FixtureRow({ fixture }: { fixture: FixtureRowView }) {
  const penalties = fixture.penalties ? `, ${fixture.penalties.home}–${fixture.penalties.away} on penalties` : '';
  const aggregate = fixture.aggregate ? `, ${fixture.aggregate.home}–${fixture.aggregate.away} on aggregate` : '';
  const firstLeg = fixture.firstLeg ? `; ${fixture.homeName} ${fixture.firstLeg.home}, ${fixture.awayName} ${fixture.firstLeg.away} in the first leg` : '';
  const label = fixture.score
    ? `${fixture.homeName} ${fixture.score.home}, ${fixture.awayName} ${fixture.score.away}${aggregate}${penalties}`
    : `${fixture.homeName} versus ${fixture.awayName}, not played yet${firstLeg}`;
  return (
    <View style={[styles.row, fixture.involvesUser && styles.userRow]} accessible accessibilityLabel={label}>
      <AppText variant={fixture.involvesUser ? 'bodyStrong' : 'body'} numberOfLines={1} align="right" style={styles.team}>
        {fixture.homeName}
      </AppText>
      <View style={[styles.score, fixture.userOutcome && { borderColor: colors[OUTCOME_COLOR[fixture.userOutcome]] }]}>
        <AppText variant="bodyStrong" color={fixture.score ? 'textPrimary' : 'textMuted'}>
          {fixture.score ? `${fixture.score.home} – ${fixture.score.away}` : 'v'}
        </AppText>
        {fixture.firstLeg ? (
          <AppText variant="caption" color="textSecondary">
            1st leg {fixture.firstLeg.home}–{fixture.firstLeg.away}
          </AppText>
        ) : null}
        {fixture.aggregate ? (
          <AppText variant="caption" color="textSecondary">
            agg {fixture.aggregate.home}–{fixture.aggregate.away}
          </AppText>
        ) : null}
        {fixture.penalties ? (
          <AppText variant="caption" color="textSecondary">
            {fixture.penalties.home}–{fixture.penalties.away} pens
          </AppText>
        ) : null}
      </View>
      <AppText variant={fixture.involvesUser ? 'bodyStrong' : 'body'} numberOfLines={1} style={styles.team}>
        {fixture.awayName}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pagerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pagerTitle: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  pagerMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
