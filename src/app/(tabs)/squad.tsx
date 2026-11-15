import { ComingSoonScreen } from '@/components/ComingSoonScreen';

export default function SquadRoute() {
  return (
    <ComingSoonScreen
      title="Squad"
      icon="squad"
      milestone="Milestone 3"
      description="Manage your players, pick your starting eleven and set your bench."
      planned={['Full squad list with key attributes', 'Player profiles', 'Starting eleven and substitutes', 'Position assignment']}
    />
  );
}
