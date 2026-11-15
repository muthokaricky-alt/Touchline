import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors, type ColorToken } from '@/theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

/**
 * Touchline's icon set. Each icon maps to an SF Symbol (iOS) and a Material
 * Symbol (Android + web). Add new icons here instead of passing raw names
 * around, so every platform always has an icon.
 */
const ICONS = {
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  squad: { ios: 'person.3.fill', android: 'groups', web: 'groups' },
  tactics: { ios: 'square.grid.3x3.fill', android: 'strategy', web: 'strategy' },
  fixtures: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  club: { ios: 'shield.fill', android: 'shield', web: 'shield' },
  match: { ios: 'soccerball', android: 'sports_soccer', web: 'sports_soccer' },
  inbox: { ios: 'envelope.fill', android: 'mail', web: 'mail' },
  table: { ios: 'list.number', android: 'leaderboard', web: 'leaderboard' },
  finances: { ios: 'banknote.fill', android: 'payments', web: 'payments' },
  transfers: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  medical: { ios: 'cross.case.fill', android: 'medical_services', web: 'medical_services' },
  trendUp: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
  construction: { ios: 'hammer.fill', android: 'construction', web: 'construction' },
} as const satisfies Record<string, SymbolName>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorToken;
  /** Overrides `color` — used by the tab bar, which supplies its own tint. */
  tintColor?: ColorValue;
};

export function Icon({ name, size = 20, color = 'textPrimary', tintColor }: IconProps) {
  return (
    <SymbolView
      name={ICONS[name]}
      size={size}
      tintColor={tintColor ?? colors[color]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
