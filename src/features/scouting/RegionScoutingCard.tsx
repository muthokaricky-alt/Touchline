import { useState } from 'react';

import { AppText, Button, Card, ChoiceChips, ListRow } from '@/components/ui';
import type { PlayerId } from '@/data/schemas';
import { REGION_GROUP_LABELS, REGION_REPORT_DAYS, WONDERKID_MAX_AGE, type ProspectView, type RegionAssignmentView } from '@/game/scouting/region-scouting';
import { REGION_GROUPS, type RegionGroup } from '@/game/scouting/scouting';
import { formatDate } from '@/utils/format';

export type RegionScoutingProps = {
  nations: readonly { value: string; label: string }[];
  /** Scouts currently out in a country. */
  trips: readonly RegionAssignmentView[];
  /** Prospects found by earlier trips, newest first. */
  shortlist: readonly ProspectView[];
  /** Returns an error message, or null when a scout was sent. */
  onSend: (nation: string, group: RegionGroup) => string | null;
  onCancel: (nation: string, group: RegionGroup) => void;
  onPlayerPress: (playerId: PlayerId) => void;
};

const GROUP_OPTIONS = REGION_GROUPS.map((value) => ({ value, label: REGION_GROUP_LABELS[value] }));

/** Transfers screen: send a scout to a country to find young talent, and the shortlist he brings back. */
export function RegionScoutingCard({ nations, trips, shortlist, onSend, onCancel, onPlayerPress }: RegionScoutingProps) {
  const [nation, setNation] = useState<string>(nations[0]?.value ?? '');
  const [group, setGroup] = useState<RegionGroup>('all');
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Card title="Scouting trips" icon="person">
        <AppText color="textSecondary">
          Send a scout to a country to look for players aged {WONDERKID_MAX_AGE} or under. He is gone {REGION_REPORT_DAYS} days and brings back up to three.
        </AppText>
        <ChoiceChips options={nations} value={nation} onChange={setNation} accessibilityLabel="Country" />
        <ChoiceChips options={GROUP_OPTIONS} value={group} onChange={setGroup} accessibilityLabel="Position to look at" />
        <Button label="Send scout" icon="person" disabled={nation === ''} onPress={() => setError(onSend(nation, group))} />
        {error ? <AppText color="danger">{error}</AppText> : null}
        {trips.map((trip, index) => (
          <ListRow
            key={`${trip.nation}-${trip.group}`}
            title={trip.label}
            subtitle={`Back ${formatDate(trip.due)}`}
            trailing={
              <AppText variant="caption" color="textSecondary">
                Call back
              </AppText>
            }
            divider={index > 0}
            onPress={() => onCancel(trip.nation, trip.group)}
            accessibilityHint="Calls the scout back without a report"
          />
        ))}
      </Card>

      <Card title={`Shortlist · ${shortlist.length}`} icon="squad">
        {shortlist.length === 0 ? (
          <AppText color="textSecondary">Nobody yet. Players your scouts find will appear here.</AppText>
        ) : (
          shortlist.map((p, index) => (
            <ListRow
              key={p.id}
              title={p.name}
              subtitle={`${p.position} · ${p.age} · ${p.clubName}`}
              trailing={
                <AppText variant="caption" color="textSecondary">
                  {p.rating} → {p.potential}
                </AppText>
              }
              divider={index > 0}
              onPress={() => onPlayerPress(p.id)}
            />
          ))
        )}
      </Card>
    </>
  );
}
