import { useState } from 'react';

import { AppText, Button, Card, Pill } from '@/components/ui';
import { REPORT_DAYS, type ScoutingStatusView } from '@/game/scouting/scouting';
import { formatDate } from '@/utils/format';

type ScoutingCardProps = {
  status: ScoutingStatusView;
  /** Returns an error message, or null when a scout was sent. */
  onScout: () => string | null;
  onCancel: () => void;
};

/** On other clubs' players' profiles: what's known about him, and "Scout player". */
export function ScoutingCard({ status, onScout, onCancel }: ScoutingCardProps) {
  const [error, setError] = useState<string | null>(null);
  const tone = status.knowledge === 2 ? 'accent' : status.knowledge === 1 ? 'neutral' : 'warning';

  return (
    <Card title="Scouting" icon="person" headerAction={<Pill label={status.label} tone={tone} />}>
      {status.due ? (
        <>
          <AppText color="textSecondary">A scout is watching him. Report due {formatDate(status.due)}.</AppText>
          <Button label="Call the scout back" variant="secondary" onPress={onCancel} />
        </>
      ) : status.knowledge === 2 ? (
        <AppText color="textSecondary">You have a full report: his potential above is exact.</AppText>
      ) : (
        <>
          <AppText color="textSecondary">
            {status.knowledge === 0
              ? 'Nobody has watched him: his potential is only a rough guess.'
              : 'Scouted: his potential is known to within a point. Another report makes it exact.'}{' '}
            A report takes {REPORT_DAYS} days.
          </AppText>
          {status.problem ? (
            <AppText variant="caption" color="warning">
              {status.problem}
            </AppText>
          ) : null}
          <Button label="Scout player" icon="person" disabled={status.problem !== null} onPress={() => setError(onScout())} />
        </>
      )}
      {error ? <AppText color="danger">{error}</AppText> : null}
    </Card>
  );
}
