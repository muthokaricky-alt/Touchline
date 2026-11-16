import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, FormGuide, Icon, IconButton, PageHeader, Pill, Screen } from '@/components/ui';
import type { ComparisonSide } from '@/game/match/comparison';
import { spacing } from '@/theme';
import { formatMatchDate, formatOrdinal } from '@/utils/format';

import { StatsPanel } from './components/StatsPanel';

type FixtureSetupScreenProps = {
  competitionName: string;
  /** "Matchday 3 of 38" or a cup round such as "Quarter-finals". */
  roundLabel: string;
  isCup: boolean;
  /** How penalties can decide it: a level match, a level aggregate (second legs), or not at all. */
  penalties: 'match' | 'aggregate' | null;
  /** Second legs: the first leg's result, its home side first. */
  firstLeg: { homeName: string; awayName: string; score: { home: number; away: number } } | null;
  date: string;
  homeName: string;
  awayName: string;
  userIsHome: boolean;
  teamSummary: string;
  opponentPreview: string | null;
  /** Both teams side by side (null while it can't be worked out). */
  comparison: { user: ComparisonSide; opponent: ComparisonSide } | null;
  blockingIssues: readonly string[];
  onKickOff: () => void;
  onEditTeam: () => void;
  onPlayFriendly: () => void;
  onBack: () => void;
};

const PENALTY_NOTES = {
  match: 'level at full time goes to penalties',
  aggregate: 'level on aggregate goes to penalties',
} as const;

/** Pre-match for the user's next competitive fixture: opponent and venue are fixed by the schedule. */
export function FixtureSetupScreen({
  competitionName,
  roundLabel,
  isCup,
  penalties,
  firstLeg,
  date,
  homeName,
  awayName,
  userIsHome,
  teamSummary,
  opponentPreview,
  comparison,
  blockingIssues,
  onKickOff,
  onEditTeam,
  onPlayFriendly,
  onBack,
}: FixtureSetupScreenProps) {
  const ready = blockingIssues.length === 0;

  return (
    <Screen bottomInset>
      <PageHeader
        overline={`${competitionName} · ${roundLabel}`}
        title={isCup ? 'Cup tie' : 'Match day'}
        subtitle={[formatMatchDate(date, true), penalties ? PENALTY_NOTES[penalties] : null].filter(Boolean).join(' · ')}
        leading={<IconButton icon="back" accessibilityLabel="Back" onPress={onBack} />}
      />

      <Card highlighted>
        <View style={styles.teams}>
          <TeamName name={homeName} label="Home" isUser={userIsHome} />
          <AppText variant="overline" color="textSecondary">
            vs
          </AppText>
          <TeamName name={awayName} label="Away" isUser={!userIsHome} />
        </View>
        {firstLeg ? (
          <AppText variant="bodyStrong" align="center">
            First leg: {firstLeg.homeName} {firstLeg.score.home}–{firstLeg.score.away} {firstLeg.awayName}
          </AppText>
        ) : null}
        {opponentPreview ? (
          <AppText variant="caption" color="textSecondary" align="center">
            Opponent expected to play {opponentPreview}
          </AppText>
        ) : null}
      </Card>

      {comparison ? (
        <Comparison
          home={userIsHome ? comparison.user : comparison.opponent}
          away={userIsHome ? comparison.opponent : comparison.user}
        />
      ) : null}

      <Card title="Your team" icon="squad" highlighted={!ready}>
        <AppText color="textSecondary">{teamSummary}</AppText>
        {blockingIssues.map((issue) => (
          <View key={issue} style={styles.issue}>
            <Icon name="error" size={16} color="danger" />
            <AppText style={styles.flex}>{issue}</AppText>
          </View>
        ))}
        <Button label="Edit team & tactics" icon="tactics" variant="secondary" onPress={onEditTeam} />
      </Card>

      <Button label="Kick off" icon="match" onPress={onKickOff} disabled={!ready} />
      {!ready ? (
        <AppText variant="caption" color="danger" align="center">
          Fix your lineup before kick-off.
        </AppText>
      ) : null}
      <Button label="Play a friendly instead" variant="secondary" onPress={onPlayFriendly} />
    </Screen>
  );
}

/** The two teams side by side, home on the left (like the scoreboard). */
function Comparison({ home, away }: { home: ComparisonSide; away: ComparisonSide }) {
  const rating = (s: ComparisonSide) => (s.averageRating === null ? '–' : s.averageRating.toFixed(1));
  const position = (s: ComparisonSide) => (s.position === null ? '–' : `${formatOrdinal(s.position)}${s.otherLeagueName ? ` (${s.otherLeagueName})` : ''}`);
  const total = (home.averageRating ?? 0) + (away.averageRating ?? 0);
  return (
    <Card title="How they compare" icon="table">
      <StatsPanel
        rows={[{ label: 'Average rating of the XI', home: rating(home), away: rating(away), homeShare: total > 0 ? (home.averageRating ?? 0) / total : 0.5 }]}
      />
      <View style={styles.compareRow} accessible accessibilityLabel={`League position: home ${position(home)}, away ${position(away)}`}>
        <AppText variant="bodyStrong" style={styles.compareSide}>
          {position(home)}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          League position
        </AppText>
        <AppText variant="bodyStrong" align="right" style={styles.compareSide}>
          {position(away)}
        </AppText>
      </View>
      {home.form.length > 0 || away.form.length > 0 ? (
        <View style={styles.compareRow}>
          <View style={styles.compareSide}>
            <FormGuide results={home.form} />
          </View>
          <AppText variant="caption" color="textSecondary">
            Form
          </AppText>
          <View style={[styles.compareSide, styles.alignEnd]}>
            <FormGuide results={away.form} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function TeamName({ name, label, isUser }: { name: string; label: string; isUser: boolean }) {
  return (
    <View style={styles.team}>
      <AppText variant="overline" color="textMuted">
        {label}
      </AppText>
      <AppText variant="heading" align="center" numberOfLines={2}>
        {name}
      </AppText>
      {isUser ? <Pill label="You" tone="accent" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  teams: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  team: { flex: 1, alignItems: 'center', gap: spacing.xs },
  issue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compareSide: { flex: 1 },
  alignEnd: { alignItems: 'flex-end' },
});
