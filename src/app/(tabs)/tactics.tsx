import { ComingSoonScreen } from '@/components/ComingSoonScreen';

export default function TacticsRoute() {
  return (
    <ComingSoonScreen
      title="Tactics"
      icon="tactics"
      milestone="Milestone 4"
      description="Shape how your team plays, with and without the ball."
      planned={['Formations', 'Team mentality', 'Passing instructions', 'Defensive line and pressing', 'Playing style']}
    />
  );
}
