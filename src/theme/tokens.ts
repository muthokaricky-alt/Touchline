/**
 * Touchline design tokens.
 *
 * Every colour, spacing value, radius and font size used by the UI should
 * come from here. Components never hardcode hex values, which keeps the
 * look consistent and makes future re-theming a one-file change.
 */

export const colors = {
  // Surfaces
  background: '#101820',
  surface: '#1D2A35',
  surfaceRaised: '#243442',
  surfacePressed: '#2A3C4B',
  border: '#2C3D4B',
  borderStrong: '#3A4F61',

  // Brand
  accent: '#B7F36B',
  accentMuted: 'rgba(183, 243, 107, 0.14)',
  onAccent: '#101820',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#8B9BAA',
  textMuted: '#5F7182',

  // Semantic
  win: '#B7F36B',
  draw: '#8B9BAA',
  loss: '#F26D6D',
  warning: '#F5C451',
  danger: '#F26D6D',
  info: '#6BB7F3',
  /** Tinted backgrounds behind semantic text (pills, badges). */
  warningMuted: 'rgba(245, 196, 81, 0.14)',
  dangerMuted: 'rgba(242, 109, 109, 0.14)',
  infoMuted: 'rgba(107, 183, 243, 0.14)',

  // Pitch (team selection)
  pitch: '#13261F',
  pitchLine: 'rgba(255, 255, 255, 0.14)',
} as const;

export type ColorToken = keyof typeof colors;

/** 4-point spacing scale. Use these instead of raw numbers for padding/margins/gaps. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** Small uppercase labels above sections and stats. */
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1 },
  /** Big numbers in stat tiles (position, points, balance). */
  stat: { fontSize: 24, lineHeight: 28, fontWeight: '800' },
} as const;

export type TypographyVariant = keyof typeof typography;

export const layout = {
  /** Content stops growing past this width on tablets / desktop web. */
  maxContentWidth: 1040,
  /** Minimum touch target size (accessibility guideline). */
  minTouchTarget: 44,
} as const;
