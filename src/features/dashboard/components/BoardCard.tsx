import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ListRow, Pill, ProgressBar, StatTile } from '@/components/ui';
import type { ClubId } from '@/data/schemas';
import type { BoardView, JobOfferView } from '@/game/career/career-view';
import { spacing } from '@/theme';

/** The board's expectation, its confidence in the manager, and his reputation. */
export function BoardCard({ board }: { board: BoardView }) {
  return (
    <Card title="Board" icon="club" headerAction={<Pill label={board.mood.label} tone={board.mood.tone} />}>
      <View style={styles.tiles}>
        <View style={styles.target}>
          <AppText variant="overline" color="textSecondary">
            Target
          </AppText>
          <AppText variant="bodyStrong">{board.expectation}</AppText>
        </View>
        <StatTile label="Reputation" value={String(board.reputation)} detail="of 100" />
      </View>
      <View style={styles.meter}>
        <View style={styles.labels}>
          <AppText variant="caption" color="textSecondary">
            Board confidence
          </AppText>
          <AppText variant="caption">{board.confidence}%</AppText>
        </View>
        <ProgressBar progress={board.confidence / 100} accessibilityLabel={`Board confidence ${board.confidence} percent`} />
      </View>
    </Card>
  );
}

/** Job offers as rows with a "Take the job" button each. */
export function JobOfferList({ offers, onAccept, acceptLabel = 'Take the job' }: { offers: readonly JobOfferView[]; onAccept: (clubId: ClubId) => void; acceptLabel?: string }) {
  return (
    <View>
      {offers.map((offer, index) => (
        <ListRow
          key={offer.clubId}
          divider={index > 0}
          title={offer.name}
          subtitle={`${offer.leagueName} · board expects: ${offer.expectation.toLowerCase()}`}
          trailing={<Button label={acceptLabel} variant="secondary" onPress={() => onAccept(offer.clubId)} />}
        />
      ))}
    </View>
  );
}

/** After a mid-season sacking: replaces the next-match card until he picks a club. */
export function SackedCard({ offers, onAccept }: { offers: readonly JobOfferView[]; onAccept: (clubId: ClubId) => void }) {
  return (
    <Card title="You have been sacked" icon="warning" highlighted>
      <AppText color="textSecondary">
        The board has lost confidence in you. {offers.length === 1 ? 'One club wants' : `${offers.length} clubs want`} you as their manager. Choose your next job
        to carry on.
      </AppText>
      <JobOfferList offers={offers} onAccept={onAccept} />
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  target: { flex: 2, gap: spacing.xxs },
  meter: { gap: spacing.xs },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
});
