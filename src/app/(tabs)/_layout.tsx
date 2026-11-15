import { Tabs } from 'expo-router/js-tabs';

import { Icon, type IconName } from '@/components/ui';
import { colors, typography } from '@/theme';

/**
 * Bottom tab navigation. Uses the JavaScript tab bar (not native tabs) so it
 * looks identical on Android, iOS and web and follows the Touchline theme.
 */
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'squad', title: 'Squad', icon: 'squad' },
  { name: 'tactics', title: 'Tactics', icon: 'tactics' },
  { name: 'fixtures', title: 'Fixtures', icon: 'fixtures' },
  { name: 'club', title: 'Club', icon: 'club' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: typography.overline.fontSize, lineHeight: typography.overline.lineHeight, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => <Icon name={tab.icon} size={size} tintColor={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
