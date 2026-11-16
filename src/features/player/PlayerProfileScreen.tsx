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
  ProgressBar,
  RatingBadge,
  Screen,
  StatTile,
} from '@/components/ui';
import { moraleLabel } from '@/game/condition/condition';
import type { DisciplineView } from '@/game/discipline/suspensions';
import type { PlayerProfileView } from '@/game/squad/squad-selectors';
import { POSITION_NAMES } from '@/game/positions';
import { spacing } from '@/theme';
import { formatDate, formatWeeklyWage } from '@/utils/format';

import { ATTRIBUTE_GROUP_LABELS, ATTRIBUTE_LABELS, FOOT_LABELS } from './attribute-labels';

type PlayerProfileScreenProps = {
  profile: PlayerProfileView;
  /** Suspensions and bookings this season. */
  discipline?: DisciplineView;
  onBack: () => void;
  /** Shown under the header, e.g. the transfer card for other clubs' players. */
  extra?: ReactNode;
};

export function PlayerProfileScreen({ profile, discipline, onBack, extra }: PlayerProfileScreenProps) {
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
          <Card title="Condition" icon="medical">
            {profile.condition.injury ? (
              <AppText color="danger">
                Injured ({profile.condition.injury.name}), back on {formatDate(profile.condition.injury.returns)}
              </AppText>
            ) : null}
            <Meter label="Fitness" value={profile.condition.fitness} detail={`${profile.condition.fitness}%`} />
            <Meter label="Morale" value={profile.condition.morale} detail={moraleLabel(profile.condition.morale)} />
            {discipline?.bans.map((line) => (
              <AppText key={line} color="danger">
                {line}
              </AppText>
            ))}
            {discipline?.leagueYellows ? <YellowCardLine yellows={discipline.leagueYellows} /> : null}
          </Card>

          <Card title="Development" icon="trendUp">
            <View style={styles.tiles}>
              <StatTile label="Rating" value={String(profile.development.rating)} detail={profile.primaryPosition} />
              <StatTile label="Potential" value={profile.development.potential} detail="estimate" />
            </View>
          </Card>

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

function Meter({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <View style={styles.meter}>
      <View style={styles.meterLabels}>
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
        <AppText variant="caption">{detail}</AppText>
      </View>
      <ProgressBar progress={value / 100} accessibilityLabel={`${label}: ${detail}`} />
    </View>
  );
}

/** "4 league yellow cards this season · 1 more by matchday 19 is a 1-match ban". */
function YellowCardLine({ yellows }: { yellows: NonNullable<DisciplineView['leagueYellows']> }) {
  const { count, next } = yellows;
  const cards = `${count} league yellow card${count === 1 ? '' : 's'} this season`;
  const outlook =
    next && count > 0 ? ` · ${next.untilBan} more by matchday ${next.byMatchday} is a ${next.matches}-match ban` : '';
  return (
    <AppText variant="caption" color={next?.untilBan === 1 ? 'warning' : 'textSecondary'}>
      {cards}
      {outlook}
    </AppText>
  );
}

const styles = StyleSheet.create({
  meter: { gap: spacing.xs },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 340, gap: spacing.lg, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Two attribute columns that collapse to one when the card is narrow.
  attributeGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm },
  attribute: { flexGrow: 1, flexBasis: 140, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  attributeLabel: { flex: 1 },
});
