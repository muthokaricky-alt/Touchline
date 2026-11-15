import { z } from 'zod';

import { DEFAULT_TACTICS, tacticsEqual, type Tactics } from './tactics';

/**
 * Playing styles: named presets that set every instruction at once.
 * A style isn't stored separately. It's *derived* by checking whether the
 * current instructions match a preset, so the two can never disagree:
 * change one instruction and the style becomes "Custom" automatically.
 */

export const PLAYING_STYLE_IDS = ['balanced', 'possession', 'counter', 'high-press', 'low-block', 'wing-play'] as const;
export const PlayingStyleIdSchema = z.enum(PLAYING_STYLE_IDS);
export type PlayingStyleId = z.infer<typeof PlayingStyleIdSchema>;

export type PlayingStyle = {
  id: PlayingStyleId;
  name: string;
  summary: string;
  tactics: Tactics;
};

export const PLAYING_STYLES: Record<PlayingStyleId, PlayingStyle> = {
  balanced: {
    id: 'balanced',
    name: 'Balanced',
    summary: 'No extremes. A sensible starting point for any squad.',
    tactics: DEFAULT_TACTICS,
  },
  possession: {
    id: 'possession',
    name: 'Possession',
    summary: 'Keep the ball with short, patient passing and push the team up.',
    tactics: { mentality: 'balanced', passing: 'short', tempo: 'slow', width: 'normal', defensiveLine: 'high', pressing: 'medium' },
  },
  counter: {
    id: 'counter',
    name: 'Counter-attack',
    summary: 'Sit deep, let them come, then break quickly with direct balls.',
    tactics: { mentality: 'defensive', passing: 'direct', tempo: 'fast', width: 'normal', defensiveLine: 'deep', pressing: 'low' },
  },
  'high-press': {
    id: 'high-press',
    name: 'High press',
    summary: 'Win the ball back near their goal. Demanding on stamina.',
    tactics: { mentality: 'attacking', passing: 'mixed', tempo: 'fast', width: 'normal', defensiveLine: 'high', pressing: 'high' },
  },
  'low-block': {
    id: 'low-block',
    name: 'Low block',
    summary: 'Compact and deep. Protect a lead or frustrate a stronger side.',
    tactics: { mentality: 'very-defensive', passing: 'mixed', tempo: 'slow', width: 'narrow', defensiveLine: 'deep', pressing: 'low' },
  },
  'wing-play': {
    id: 'wing-play',
    name: 'Wing play',
    summary: 'Stretch the pitch and deliver crosses from wide areas.',
    tactics: { mentality: 'attacking', passing: 'mixed', tempo: 'normal', width: 'wide', defensiveLine: 'standard', pressing: 'medium' },
  },
};

export const PLAYING_STYLE_LIST: readonly PlayingStyle[] = PLAYING_STYLE_IDS.map((id) => PLAYING_STYLES[id]);

/** The style whose instructions exactly match, or null for a custom setup. */
export function matchPlayingStyle(tactics: Tactics): PlayingStyle | null {
  return PLAYING_STYLE_LIST.find((style) => tacticsEqual(style.tactics, tactics)) ?? null;
}
