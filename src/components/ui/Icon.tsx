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
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  remove: { ios: 'minus.circle.fill', android: 'do_not_disturb_on', web: 'do_not_disturb_on' },
  autoPick: { ios: 'wand.and.stars', android: 'auto_awesome', web: 'auto_awesome' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  error: { ios: 'exclamationmark.octagon.fill', android: 'error', web: 'error' },
  person: { ios: 'person.fill', android: 'person', web: 'person' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  assistant: { ios: 'bubble.left.and.text.bubble.right.fill', android: 'forum', web: 'forum' },
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
