import { DarkTheme, type Theme } from 'expo-router';

import { colors } from './tokens';

/**
 * Theme passed to the navigation container so headers, tab bars and screen
 * backgrounds use Touchline colours (prevents white flashes between screens).
 */
export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.accent,
  },
};
