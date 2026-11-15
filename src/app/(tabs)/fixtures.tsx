import { ComingSoonScreen } from '@/components/ComingSoonScreen';

export default function FixturesRoute() {
  return (
    <ComingSoonScreen
      title="Fixtures"
      icon="fixtures"
      milestone="Milestone 6"
      description="Your season schedule, results and league standings."
      planned={['League fixtures and results', 'Full league table', 'Cup competitions', 'Promotion and relegation']}
    />
  );
}
