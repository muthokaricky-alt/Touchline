import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, PageHeader, Pill, Screen, StatTile } from '@/components/ui';
import { spacing } from '@/theme';
import { formatCompactCurrency, formatWeeklyWage } from '@/utils/format';

import { MusicCard, type MusicCardProps } from '@/features/music/MusicCard';

import { SaveSlotsCard } from './SaveSlotsCard';

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

export type ClubTransfersView = {
  /** e.g. "Summer window open · closes 31 Aug" */
  windowLabel: string;
  windowOpen: boolean;
  wageBill: number;
  wageBudget: number;
  squadSize: number;
  maxSquad: number;
  /** The user's own deals, newest first. */
  history: readonly { key: string; title: string; detail: string; incoming: boolean }[];
};

export type CareerView = {
  managerName: string;
  reputation: number;
  /** Past seasons, newest first. */
  seasons: readonly { key: string; title: string; detail: string }[];
};

type ClubScreenProps = {
  club: ClubInfoView;
  career: CareerView | null;
  slots: ComponentProps<typeof SaveSlotsCard>;
  transfers: ClubTransfersView;
  save: SaveView;
  music: MusicCardProps;
  onOpenMarket: () => void;
  onStartNewGame: () => void;
  onDismissNotice: () => void;
};

/** Club facts, transfers and the career save. Staff and detailed finances arrive later. */
/** How many deals the Transfers card shows until the list is expanded. */
const COLLAPSED_DEALS = 3;

export function ClubScreen({ club, career, slots, transfers, save, music, onOpenMarket, onStartNewGame, onDismissNotice }: ClubScreenProps) {
  const [showAllDeals, setShowAllDeals] = useState(false);
  const canCollapse = transfers.history.length > COLLAPSED_DEALS;
  const visibleDeals = showAllDeals || !canCollapse ? transfers.history : transfers.history.slice(0, COLLAPSED_DEALS);
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
              Wage bill {formatWeeklyWage(transfers.wageBill)} of {formatWeeklyWage(transfers.wageBudget)} · squad {transfers.squadSize}/
              {transfers.maxSquad}
            </AppText>
          </Card>

          <Card title="Transfers" icon="transfers" highlighted={transfers.windowOpen}>
            <View style={styles.notice}>
              <Icon name={transfers.windowOpen ? 'transfers' : 'warning'} size={16} color={transfers.windowOpen ? 'accent' : 'warning'} />
              <AppText style={styles.flex}>{transfers.windowLabel}</AppText>
            </View>
            <Button label="Transfer market" icon="transfers" onPress={onOpenMarket} />
            {transfers.history.length === 0 ? (
              <AppText variant="caption" color="textSecondary">
                No deals yet.
              </AppText>
            ) : (
              <View>
                {visibleDeals.map((h) => (
                  <View key={h.key} style={styles.history} accessible accessibilityLabel={`${h.incoming ? 'Signed' : 'Sold'}: ${h.title}, ${h.detail}`}>
                    <Icon name={h.incoming ? 'add' : 'remove'} size={16} color={h.incoming ? 'accent' : 'danger'} />
                    <View style={styles.flex}>
                      <AppText variant="bodyStrong" numberOfLines={1}>
                        {h.title}
                      </AppText>
                      <AppText variant="caption" color="textSecondary">
                        {h.detail}
                      </AppText>
                    </View>
                  </View>
                ))}
                {canCollapse ? (
                  <Pressable
                    onPress={() => setShowAllDeals((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showAllDeals ? 'Show fewer deals' : `Show all ${transfers.history.length} deals`}
                    accessibilityState={{ expanded: showAllDeals }}
                    style={styles.toggle}
                  >
                    <AppText variant="bodyStrong" color="accent" style={styles.flex}>
                      {showAllDeals ? 'Show fewer deals' : `Show all ${transfers.history.length} deals`}
                    </AppText>
                    <View style={{ transform: [{ rotate: showAllDeals ? '-90deg' : '90deg' }] }}>
                      <Icon name="chevronRight" size={16} color="accent" />
                    </View>
                  </Pressable>
                ) : null}
              </View>
            )}
          </Card>
        </View>
        <View style={styles.column}>
          {career ? (
            <Card title="Your career" icon="person" headerAction={<Pill label={`Reputation ${career.reputation}`} />}>
              <AppText variant="bodyStrong">{career.managerName}</AppText>
              {career.seasons.length === 0 ? (
                <AppText variant="caption" color="textSecondary">
                  Your first season. Completed seasons appear here.
                </AppText>
              ) : (
                <View>
                  {career.seasons.map((s) => (
                    <View key={s.key} style={styles.history}>
                      <View style={styles.flex}>
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {s.title}
                        </AppText>
                        <AppText variant="caption" color="textSecondary">
                          {s.detail}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          ) : null}
          <SaveCard save={save} onStartNewGame={onStartNewGame} onDismissNotice={onDismissNotice} />
          <SaveSlotsCard {...slots} />
          <MusicCard {...music} />
        </View>
      </View>
    </Screen>
  );
}

function SaveCard({ save, onStartNewGame, onDismissNotice }: Pick<ClubScreenProps, 'save' | 'onStartNewGame' | 'onDismissNotice'>) {
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
  history: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  confirm: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
