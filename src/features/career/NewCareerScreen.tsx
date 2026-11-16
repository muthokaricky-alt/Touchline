import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ChoiceChips, ListRow, PageHeader, Pill, RatingBadge, Screen, TextField } from '@/components/ui';
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
  // One country at a time (130 clubs in one list is too long); England first.
  const countries = [...new Map(leagues.map((l) => [l.country, l.countryName])).entries()].map(([value, label]) => ({ value, label }));
  const [country, setCountry] = useState<string>(countries[0]?.value ?? '');
  const shown = leagues.filter((l) => l.country === country);
  const chosen = leagues.flatMap((l) => l.clubs).find((c) => c.id === clubId) ?? null;
  const chosenLeague = leagues.find((l) => l.clubs.some((c) => c.id === clubId));
  const ready = name.trim().length > 0 && chosen !== null;

  // The choice and the button stay at the bottom, so picking a club far down the list never means scrolling back up.
  const footer = (
    <View style={styles.footer} accessibilityLiveRegion="polite">
      <View style={styles.flex}>
        {chosen ? (
          <>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {chosen.name}
              {chosenLeague ? ` · ${chosenLeague.leagueName}` : ''}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              The board expects: {chosen.expectation.toLowerCase()}
            </AppText>
          </>
        ) : (
          <AppText variant="caption" color="textSecondary">
            {name.trim() ? 'Pick a club. Bigger clubs have better squads, and higher expectations.' : 'Enter your name and pick a club.'}
          </AppText>
        )}
        {error ? (
          <AppText variant="caption" color="warning">
            {error}
          </AppText>
        ) : null}
      </View>
      <Button label="Start career" icon="check" disabled={!ready} onPress={() => clubId && setError(onStart(name, clubId))} />
    </View>
  );

  return (
    <Screen bottomInset footer={footer}>
      <PageHeader overline="Touchline" title="New career" subtitle="Choose your name and the club you want to manage" />
      <Card title="Manager" icon="person">
        <TextField label="Your name" value={name} onChangeText={setName} placeholder="e.g. Alex Kamau" maxLength={30} />
      </Card>

      <ChoiceChips options={countries} value={country} onChange={setCountry} accessibilityLabel="Country" />

      <View style={styles.columns}>
        {shown.map((league) => (
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
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
});
