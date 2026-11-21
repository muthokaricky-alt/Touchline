import { useEffect, useState } from 'react';

import { AppText, Button, Card, ChoiceChips } from '@/components/ui';
import type { Position } from '@/data/schemas';
import { WEEKS_TO_LEARN, WEEKS_TO_PRIMARY, type RetrainingView } from '@/game/squad/retraining';
import { formatDate } from '@/utils/format';

export type RetrainingCardProps = {
  view: RetrainingView;
  /** Returns an error message, or null when the lesson started. */
  onStart: (position: Position) => string | null;
  onCancel: () => void;
};

/** Player profile (own players): teach him a position, or see the lesson under way. */
export function RetrainingCard({ view, onStart, onCancel }: RetrainingCardProps) {
  const [position, setPosition] = useState<Position | null>(view.options[0]?.position ?? null);
  const [error, setError] = useState<string | null>(null);

  // The list changes when a lesson starts or finishes: keep the choice valid.
  useEffect(() => {
    if (!view.options.some((o) => o.position === position)) setPosition(view.options[0]?.position ?? null);
  }, [view.options, position]);

  const chosen = view.options.find((o) => o.position === position);

  return (
    <Card title="Position training" icon="squad">
      {view.active ? (
        <>
          <AppText>
            {view.active.kind === 'primary' ? 'Retraining as' : 'Learning to play as'} a {view.active.label.toLowerCase()}. Done {formatDate(view.active.due)}.
          </AppText>
          <Button label="Stop training" onPress={onCancel} />
        </>
      ) : view.problem ? (
        <AppText color="textSecondary">{view.problem}</AppText>
      ) : view.options.length === 0 ? (
        <AppText color="textSecondary">No position here suits him well enough to learn.</AppText>
      ) : (
        <>
          <AppText color="textSecondary">
            A position he already covers becomes his main one in {WEEKS_TO_PRIMARY} weeks (he keeps the old one). A new position takes {WEEKS_TO_LEARN} weeks to learn.
          </AppText>
          <ChoiceChips
            options={view.options.map((o) => ({ value: o.position, label: `${o.label} · ${o.rating}` }))}
            value={position ?? view.options[0].position}
            onChange={setPosition}
            accessibilityLabel="Position to train"
          />
          <Button
            label={chosen ? `${chosen.kind === 'primary' ? 'Retrain' : 'Teach'} · ${chosen.weeks} weeks` : 'Start'}
            disabled={!chosen}
            onPress={() => chosen && setError(onStart(chosen.position))}
          />
          {error ? <AppText color="danger">{error}</AppText> : null}
        </>
      )}
    </Card>
  );
}
