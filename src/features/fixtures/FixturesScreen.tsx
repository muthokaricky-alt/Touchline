import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, ChoiceChips, Icon, PageHeader, Pill, Screen, SegmentedControl } from '@/components/ui';
import { formatMatchDate } from '@/utils/format';
import { spacing } from '@/theme';

import { LeagueTable } from './components/LeagueTable';
import { FixtureRow, MatchdayPager } from './components/MatchdayCard';
import type { CompetitionOption, CupView, LeaderRowView, LeagueView } from './season-view';

type LeagueTab = 'fixtures' | 'table' | 'stats';

const LEAGUE_TABS = [
  { value: 'fixtures', label: 'Fixtures' },
  { value: 'table', label: 'Table' },
  { value: 'stats', label: 'Stats' },
] as const satisfies readonly { value: LeagueTab; label: string }[];

type FixturesScreenProps = {
  seasonLabel: string;
  options: readonly CompetitionOption[];
  selected: string;
  onSelect: (competitionId: string) => void;
  view: LeagueView | CupView;
};

/** The season: pick a competition; leagues show fixtures / table / stats, the cup shows its rounds. */
export function FixturesScreen({ seasonLabel, options, selected, onSelect, view }: FixturesScreenProps) {
  return (
    <Screen>
      <PageHeader overline={`Season ${seasonLabel}`} title="Fixtures & tables" />
      <ChoiceChips
        options={options.map((o) => ({ value: o.id, label: o.label }))}
        value={selected}
        onChange={onSelect}
        accessibilityLabel="Competition"
      />
      {/* key: switching competition resets the inner tab and matchday state. */}
      {view.kind === 'league' ? <LeagueSection key={selected} view={view} /> : <CupSection view={view} />}
    </Screen>
  );
}

function LeagueSection({ view }: { view: LeagueView }) {
  // Local state (not a URL param) keeps the static web render and the browser in agreement.
  const [tab, setTab] = useState<LeagueTab>('fixtures');
  const [matchday, setMatchday] = useState(view.currentMatchday ?? view.totalMatchdays);
  const day = view.matchdays.find((d) => d.matchday === matchday) ?? view.matchdays[0];
  const status = view.currentMatchday === null ? 'Season complete' : `Next: matchday ${view.currentMatchday} of ${view.totalMatchdays}`;

  return (
    <>
      <AppText color="textSecondary">{status}</AppText>
      <SegmentedControl segments={LEAGUE_TABS} value={tab} onChange={setTab} accessibilityLabel="League view" />
      {tab === 'fixtures' ? (
        day ? (
          <MatchdayPager
            day={day}
            total={view.totalMatchdays}
            onPrevious={() => setMatchday((m) => Math.max(1, m - 1))}
            onNext={() => setMatchday((m) => Math.min(view.totalMatchdays, m + 1))}
          />
        ) : null
      ) : tab === 'table' ? (
        <LeagueTable title={view.competitionName} rows={view.table} />
      ) : (
        <View style={styles.columns}>
          <View style={styles.column}>
            <LeadersCard title="Top scorers" rows={view.topScorers} unit="goals" />
          </View>
          <View style={styles.column}>
            <LeadersCard title="Most assists" rows={view.topAssists} unit="assists" />
          </View>
        </View>
      )}
    </>
  );
}

function CupSection({ view }: { view: CupView }) {
  return (
    <>
      <Card highlighted>
        <View style={styles.cupHeader}>
          <Icon name="trophy" size={22} color="accent" />
          <View style={styles.flex}>
            <AppText variant="heading">{view.winnerName ? `${view.winnerName} won the cup` : view.competitionName}</AppText>
            <AppText color="textSecondary">{view.userStatus}</AppText>
          </View>
        </View>
      </Card>
      <View style={styles.columns}>
        {[...view.rounds].reverse().map((round) => (
          <View key={round.round} style={styles.column}>
            <Card title={`${round.name} · ${formatMatchDate(round.date)}`} headerAction={round.ties.every((t) => t.score) ? null : <Pill label="Upcoming" tone="accent" />}>
              <View>
                {round.ties.map((t) => (
                  <FixtureRow key={t.id} fixture={t} />
                ))}
              </View>
            </Card>
          </View>
        ))}
        <View style={styles.column}>
          <LeadersCard title="Cup top scorers" rows={view.topScorers} unit="goals" />
        </View>
      </View>
    </>
  );
}

function LeadersCard({ title, rows, unit }: { title: string; rows: readonly LeaderRowView[]; unit: string }) {
  return (
    <Card title={title} icon="trendUp">
      {rows.length === 0 ? (
        <AppText color="textSecondary">No {unit} yet.</AppText>
      ) : (
        rows.map((row, index) => (
          <View key={row.playerId} style={styles.leader} accessible accessibilityLabel={`${index + 1}, ${row.name}, ${row.clubShortName}, ${row.value} ${unit}`}>
            <AppText variant="bodyStrong" color="textSecondary" style={styles.rank}>
              {index + 1}
            </AppText>
            <View style={styles.leaderName}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {row.name}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {row.clubShortName} · {row.appearances} apps
              </AppText>
            </View>
            <AppText variant="heading">{row.value}</AppText>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  // Wrapping columns (no window measuring): one column on phones, two+ on wide screens.
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, minWidth: 0 },
  cupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  leader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rank: { width: 20, textAlign: 'right' },
  leaderName: { flex: 1, minWidth: 0 },
});
