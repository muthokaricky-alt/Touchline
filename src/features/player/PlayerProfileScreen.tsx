import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Card,
  FitPill,
  IconButton,
  ListRow,
  PageHeader,
  PositionBadge,
  RatingBadge,
  Screen,
  StatTile,
} from '@/components/ui';
import type { PlayerProfileView } from '@/game/squad/squad-selectors';
import { POSITION_NAMES } from '@/game/positions';
import { spacing } from '@/theme';
import { formatDate, formatWeeklyWage } from '@/utils/format';

import { ATTRIBUTE_GROUP_LABELS, ATTRIBUTE_LABELS, FOOT_LABELS } from './attribute-labels';

type PlayerProfileScreenProps = {
  profile: PlayerProfileView;
  onBack: () => void;
  /** Shown under the header, e.g. the transfer card for other clubs' players. */
  extra?: ReactNode;
};

export function PlayerProfileScreen({ profile, onBack, extra }: PlayerProfileScreenProps) {
  const number = profile.contract ? `#${profile.contract.squadNumber} · ` : '';
  return (
    <Screen bottomInset>
      <PageHeader
        leading={<IconButton icon="back" accessibilityLabel="Back" onPress={onBack} />}
        overline={`${number}${profile.club?.name ?? 'Free agent'}`}
        title={profile.fullName}
        trailing={<PositionBadge position={profile.primaryPosition} />}
      />

      <View style={styles.tiles}>
        <StatTile label="Age" value={String(profile.age)} detail={`b. ${profile.dateOfBirth.slice(0, 4)}`} />
        <StatTile label="Nation" value={profile.nationality} />
        <StatTile label="Height" value={`${profile.heightCm}`} detail="cm" />
        <StatTile label="Foot" value={FOOT_LABELS[profile.preferredFoot]} />
      </View>

      {extra}

      <View style={styles.columns}>
        <View style={styles.column}>
          <Card title="Positions" icon="tactics">
            <View>
              {profile.positionRatings.map((r, index) => (
                <ListRow
                  key={r.position}
                  divider={index > 0}
                  title={POSITION_NAMES[r.position]}
                  leading={<PositionBadge position={r.position} />}
                  trailing={
                    <View style={styles.inline}>
                      <FitPill fit={r.fit} />
                      <RatingBadge value={r.rating} label={`${POSITION_NAMES[r.position]} rating`} />
                    </View>
                  }
                />
              ))}
            </View>
          </Card>

          <Card title="Contract" icon="finances">
            {profile.contract ? (
              <View style={styles.tiles}>
                <StatTile label="Wage" value={formatWeeklyWage(profile.contract.weeklyWage)} />
                <StatTile label="Expires" value={formatDate(profile.contract.endDate)} detail={`Since ${formatDate(profile.contract.startDate)}`} />
              </View>
            ) : (
              <AppText color="textSecondary">Not under contract.</AppText>
            )}
          </Card>
        </View>

        <View style={styles.column}>
          {profile.attributeGroups.map((group) => (
            <Card key={group.group} title={ATTRIBUTE_GROUP_LABELS[group.group]}>
              <View style={styles.attributeGrid}>
                {group.attributes.map((attribute) => (
                  <View key={attribute.key} style={styles.attribute}>
                    <AppText style={styles.attributeLabel} numberOfLines={1}>
                      {ATTRIBUTE_LABELS[attribute.key]}
                    </AppText>
                    <RatingBadge value={attribute.value} label={ATTRIBUTE_LABELS[attribute.key]} />
                  </View>
                ))}
              </View>
            </Card>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, gap: spacing.lg, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Two attribute columns that collapse to one when the card is narrow.
  attributeGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm },
  attribute: { flexGrow: 1, flexBasis: 140, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  attributeLabel: { flex: 1 },
});
