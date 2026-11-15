import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, IconButton, PageHeader, Pill, Screen } from '@/components/ui';
import { spacing } from '@/theme';
import { formatMatchDate } from '@/utils/format';

type FixtureSetupScreenProps = {
  competitionName: string;
  /** "Matchday 3 of 38" or a cup round such as "Quarter-finals". */
  roundLabel: string;
  /** Cup ties can't end level: a note about penalties is shown. */
  isCup: boolean;
  date: string;
  homeName: string;
  awayName: string;
  userIsHome: boolean;
  teamSummary: string;
  opponentPreview: string | null;
  blockingIssues: readonly string[];
  onKickOff: () => void;
  onEditTeam: () => void;
  onPlayFriendly: () => void;
  onBack: () => void;
};

/** Pre-match for the user's next competitive fixture: opponent and venue are fixed by the schedule. */
export function FixtureSetupScreen({
  competitionName,
  roundLabel,
  isCup,
  date,
  homeName,
  awayName,
  userIsHome,
  teamSummary,
  opponentPreview,
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
        subtitle={isCup ? `${formatMatchDate(date, true)} · level at full time goes to penalties` : formatMatchDate(date, true)}
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
        {opponentPreview ? (
          <AppText variant="caption" color="textSecondary" align="center">
            Opponent expected to play {opponentPreview}
          </AppText>
        ) : null}
      </Card>

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
});
