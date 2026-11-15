import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, PageHeader, Pill, Screen, StatTile } from '@/components/ui';
import { spacing } from '@/theme';
import { formatCompactCurrency, formatWeeklyWage } from '@/utils/format';

export type ClubInfoView = {
  name: string;
  city: string;
  founded: number;
  reputation: number;
  leagueName: string;
  stadiumName: string;
  capacity: number;
  balance: number;
  transferBudget: number;
  weeklyWageBudget: number;
};

export type SaveView = {
  /** e.g. "Saved at 14:32", or null when nothing has been written this session. */
  lastSavedLabel: string | null;
  loadedFromSave: boolean;
  notice: string | null;
};

type ClubScreenProps = {
  club: ClubInfoView;
  save: SaveView;
  onStartNewGame: () => void;
  onDismissNotice: () => void;
};

/** Club facts and the career save. Transfers, staff and finances detail arrive in M7–M9. */
export function ClubScreen({ club, save, onStartNewGame, onDismissNotice }: ClubScreenProps) {
  return (
    <Screen>
      <PageHeader overline={club.leagueName} title={club.name} subtitle={`${club.city} · founded ${club.founded}`} />
      <View style={styles.columns}>
        <View style={styles.column}>
          <Card title="Club" icon="club">
            <View style={styles.tiles}>
              <StatTile label="Reputation" value={`${club.reputation}`} detail="of 20" />
              <StatTile label="Stadium" value={club.capacity.toLocaleString('en-GB')} detail={club.stadiumName} />
            </View>
            <View style={styles.tiles}>
              <StatTile label="Balance" value={formatCompactCurrency(club.balance)} />
              <StatTile label="Transfer budget" value={formatCompactCurrency(club.transferBudget)} />
            </View>
            <AppText variant="caption" color="textSecondary">
              Wage budget {formatWeeklyWage(club.weeklyWageBudget)}. Transfers and contracts arrive in Milestone 7.
            </AppText>
          </Card>
        </View>
        <View style={styles.column}>
          <SaveCard save={save} onStartNewGame={onStartNewGame} onDismissNotice={onDismissNotice} />
        </View>
      </View>
    </Screen>
  );
}

function SaveCard({ save, onStartNewGame, onDismissNotice }: Omit<ClubScreenProps, 'club'>) {
  // Two-step confirmation in the UI: React Native's Alert does nothing on web.
  const [confirming, setConfirming] = useState(false);

  return (
    <Card title="Career save" icon="fixtures" headerAction={<Pill label="Autosave on" tone="accent" />}>
      <AppText color="textSecondary">
        Your career saves automatically on this device after every change.
        {save.loadedFromSave ? ' It was loaded from your last session.' : ''}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {save.lastSavedLabel ?? 'No changes saved yet this session.'}
      </AppText>

      {save.notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <Icon name="warning" size={16} color="warning" />
          <AppText style={styles.flex}>{save.notice}</AppText>
          <Button label="OK" variant="secondary" onPress={onDismissNotice} />
        </View>
      ) : null}

      {confirming ? (
        <View style={styles.confirm}>
          <AppText variant="bodyStrong" color="danger">
            Start again? Your current career and season will be lost.
          </AppText>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Cancel" variant="secondary" onPress={() => setConfirming(false)} />
            </View>
            <View style={styles.flex}>
              <Button
                label="Yes, start over"
                variant="danger"
                onPress={() => {
                  setConfirming(false);
                  onStartNewGame();
                }}
              />
            </View>
          </View>
        </View>
      ) : (
        <Button label="Start new game" variant="secondary" icon="add" onPress={() => setConfirming(true)} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, gap: spacing.lg, minWidth: 0 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  confirm: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
