import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, FormGuide, Pill } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { formatOrdinal } from '@/utils/format';

import type { DashboardSummary } from '../dashboard.types';

type NextMatchCardProps = {
  club: DashboardSummary['club'];
  clubForm: DashboardSummary['form'];
  match: NonNullable<DashboardSummary['nextMatch']>;
  onViewFixtures: () => void;
  onPlayMatch: () => void;
};

export function NextMatchCard({ club, clubForm, match, onViewFixtures, onPlayMatch }: NextMatchCardProps) {
  const isHome = match.venue === 'home';
  const home = isHome ? { name: club.name, form: clubForm } : { name: match.opponentName, form: match.opponentForm };
  const away = isHome ? { name: match.opponentName, form: match.opponentForm } : { name: club.name, form: clubForm };

  return (
    <Card title="Next match" icon="match" highlighted>
      <View style={styles.metaRow}>
        <Pill label={match.competition} tone="neutral" />
        <AppText variant="caption" color="textSecondary">
          {match.date} · {match.kickOff}
        </AppText>
      </View>

      <View style={styles.teams}>
        <TeamColumn name={home.name} form={home.form} label="Home" />
        <View style={styles.vs}>
          <AppText variant="overline" color="textSecondary">
            vs
          </AppText>
        </View>
        <TeamColumn name={away.name} form={away.form} label="Away" />
      </View>

      <AppText variant="caption" color="textSecondary" align="center">
        {match.opponentPosition === null
          ? 'Opening day of the season'
          : `${match.opponentName} are ${formatOrdinal(match.opponentPosition)} in the table`}
      </AppText>

      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button label="View fixtures" variant="secondary" icon="fixtures" onPress={onViewFixtures} />
        </View>
        <View style={styles.flex}>
          <Button
            label="Play match"
            icon="match"
            onPress={onPlayMatch}
            accessibilityHint="Opens match day to play a friendly"
          />
        </View>
      </View>
    </Card>
  );
}

function TeamColumn({ name, form, label }: { name: string; form: DashboardSummary['form']; label: string }) {
  return (
    <View style={styles.team}>
      <AppText variant="overline" color="textMuted">
        {label}
      </AppText>
      <AppText variant="heading" align="center" numberOfLines={2}>
        {name}
      </AppText>
      <FormGuide results={form} />
    </View>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  teams: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  team: { flex: 1, alignItems: 'center', gap: spacing.sm },
  vs: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
