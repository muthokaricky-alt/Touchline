import { ComingSoonScreen } from '@/components/ComingSoonScreen';

export default function ClubRoute() {
  return (
    <ComingSoonScreen
      title="Club"
      icon="club"
      milestone="Milestones 7–9"
      description="Run the club beyond the pitch: transfers, finances, staff and your career."
      planned={['Transfer market and contracts', 'Finances and budgets', 'Training and youth academy', 'Manager reputation and job offers', 'Save slots']}
    />
  );
}
