import type { Side } from '@/engine/types';

/**
 * Dot colours for the 2D view from the clubs' colours (pure). The home side
 * wears its primary colour; the away side its primary unless that's too
 * close to the home colour (then its secondary, like a change kit). Shirt
 * numbers are dark or light, whichever reads better on the fill.
 */

export type ClubColours = { primary: string; secondary: string };
export type DotKit = { fill: string; text: string };

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};

/** Distance between two colours (0 … ~441). */
export function colourDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** Perceived brightness 0–1 (sRGB weights). */
const brightness = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

const kit = (fill: string): DotKit => ({ fill, text: brightness(fill) > 0.6 ? '#101820' : '#FFFFFF' });

/** Closer than this, two kits are hard to tell apart on the pitch. */
export const CLASH_DISTANCE = 120;

export function matchKits(home: ClubColours, away: ClubColours): Record<Side, DotKit> {
  const awayFill = colourDistance(home.primary, away.primary) < CLASH_DISTANCE ? away.secondary : away.primary;
  return { home: kit(home.primary), away: kit(awayFill) };
}
