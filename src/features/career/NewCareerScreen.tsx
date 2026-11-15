import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ListRow, PageHeader, Pill, RatingBadge, Screen, TextField } from '@/components/ui';
import type { ClubId } from '@/data/schemas';
import type { LeagueChoicesView } from '@/game/career/career-view';
import { spacing } from '@/theme';

type NewCareerScreenProps = {
  leagues: readonly LeagueChoicesView[];
  /** Returns an error message, or null when the career started. */
  onStart: (name: string, clubId: ClubId) => string | null;
};

/** First launch / new game: the manager's name and the club to start at. */
export function NewCareerScreen({ leagues, onStart }: NewCareerScreenProps) {
  const [name, setName] = useState('');
  const [clubId, setClubId] = useState<ClubId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = leagues.flatMap((l) => l.clubs).find((c) => c.id === clubId) ?? null;
  const ready = name.trim().length > 0 && chosen !== null;

  return (
    <Screen bottomInset>
      <PageHeader overline="Touchline" title="New career" subtitle="Choose your name and the club you want to manage" />
      <Card title="Manager" icon="person">
        <TextField label="Your name" value={name} onChangeText={setName} placeholder="e.g. Alex Kamau" maxLength={30} />
      </Card>

      <Card title="Your choice" icon="club" highlighted={chosen !== null}>
        {chosen ? (
          <>
            <AppText variant="bodyStrong">{chosen.name}</AppText>
            <AppText color="textSecondary">The board expects: {chosen.expectation.toLowerCase()}.</AppText>
          </>
        ) : (
          <AppText color="textSecondary">Pick a club below. Bigger clubs have better squads, and higher expectations.</AppText>
        )}
        {error ? <AppText color="warning">{error}</AppText> : null}
        <Button label="Start career" icon="check" disabled={!ready} onPress={() => clubId && setError(onStart(name, clubId))} />
      </Card>

      <View style={styles.columns}>
        {leagues.map((league) => (
          <Card key={league.leagueName} title={league.leagueName} icon="table" style={styles.column}>
            <View>
              {league.clubs.map((club, index) => (
                <ListRow
                  key={club.id}
                  divider={index > 0}
                  title={club.name}
                  subtitle={club.expectation}
                  onPress={() => setClubId(club.id)}
                  accessibilityLabel={`${club.name}, squad rating ${club.squadRating}, board expects: ${club.expectation}${club.id === clubId ? ', selected' : ''}`}
                  trailing={
                    <View style={styles.trailing}>
                      {club.id === clubId ? <Pill label="Selected" tone="accent" /> : null}
                      <RatingBadge value={Math.round(club.squadRating)} label="Squad rating" />
                    </View>
                  }
                />
              ))}
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
