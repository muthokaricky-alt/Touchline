import { previewDashboard } from '@/features/dashboard/dashboard.preview';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';

/**
 * Route file: stays thin. It decides *which* data the dashboard shows;
 * DashboardScreen decides *how* it looks. In Milestone 2+ this will read
 * from game state instead of preview data.
 */
export default function HomeRoute() {
  return <DashboardScreen summary={previewDashboard} />;
}
