import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  ChoiceChips,
  Icon,
  IconButton,
  ListRow,
  PageHeader,
  Pill,
  Screen,
} from '@/components/ui';
import type { ClubId } from '@/data/schemas';
import type { MatchVenue } from '@/game/match/friendly';
import { spacing } from '@/theme';

export type OpponentOption = { id: ClubId; name: string; reputation: number };

const VENUE_OPTIONS = [
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
] as const satisfies readonly { value: MatchVenue; label: string }[];

type MatchSetupScreenProps = {
  clubName: string;
  opponents: readonly OpponentOption[];
  opponentId: ClubId | null;
  venue: MatchVenue;
  /** e.g. "4-4-2 · Counter-attack · avg rating 14.3" */
  teamSummary: string;
  /** How the AI will line up against you, e.g. "4-3-3 · High press". */
  opponentPreview: string | null;
  /** Errors that stop kick-off (empty slots etc.). Empty = ready. */
  blockingIssues: readonly string[];
  onOpponentChange: (id: ClubId) => void;
  onVenueChange: (venue: MatchVenue) => void;
  onKickOff: () => void;
  onEditTeam: () => void;
  onBack: () => void;
  /** Shown when a league fixture is waiting. */
  onBackToLeague?: () => void;
};

/** Choose opponent and venue, check your team, kick off. */
export function MatchSetupScreen({
  clubName,
  opponents,
  opponentId,
  venue,
  teamSummary,
  opponentPreview,
  blockingIssues,
  onOpponentChange,
  onVenueChange,
  onKickOff,
  onEditTeam,
  onBack,
  onBackToLeague,
}: MatchSetupScreenProps) {
  const ready = blockingIssues.length === 0 && opponentId !== null;

  return (
    <Screen bottomInset>
      <PageHeader
        overline="Friendly"
        title="Match day"
        subtitle="Results aren't recorded until league fixtures arrive."
        leading={<IconButton icon="back" accessibilityLabel="Back" onPress={onBack} />}
      />

      <View style={styles.columns}>
        <View style={styles.column}>
          <Card title="Your team" icon="squad" highlighted={!ready && blockingIssues.length > 0}>
            <AppText variant="heading">{clubName}</AppText>
            <AppText color="textSecondary">{teamSummary}</AppText>
            {blockingIssues.map((issue) => (
              <View key={issue} style={styles.issue}>
                <Icon name="error" size={16} color="danger" />
                <AppText style={styles.flex}>{issue}</AppText>
              </View>
            ))}
            <Button label="Edit team & tactics" icon="tactics" variant="secondary" onPress={onEditTeam} />
          </Card>

          <Card title="Venue" icon="club">
            <ChoiceChips options={VENUE_OPTIONS} value={venue} onChange={onVenueChange} accessibilityLabel="Venue" />
          </Card>

          <Button label="Kick off" icon="match" onPress={onKickOff} disabled={!ready} />
          {!ready && blockingIssues.length > 0 ? (
            <AppText variant="caption" color="danger" align="center">
              Fix your lineup before kick-off.
            </AppText>
          ) : null}
          {onBackToLeague ? (
            <Button label="Back to league fixture" variant="secondary" icon="fixtures" onPress={onBackToLeague} />
          ) : null}
        </View>

        <View style={styles.column}>
          <Card title="Opponent" icon="match">
            {opponentPreview ? (
              <AppText color="textSecondary">Expected setup: {opponentPreview}</AppText>
            ) : null}
            <View>
              {opponents.map((club, index) => {
                const selected = club.id === opponentId;
                return (
                  <ListRow
                    key={club.id}
                    divider={index > 0}
                    title={club.name}
                    subtitle={`Reputation ${club.reputation}`}
                    onPress={() => onOpponentChange(club.id)}
                    accessibilityLabel={`${club.name}, reputation ${club.reputation}${selected ? ', selected' : ''}`}
                    trailing={selected ? <Pill label="Selected" tone="accent" /> : null}
                  />
                );
              })}
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, gap: spacing.lg, minWidth: 0 },
  issue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
