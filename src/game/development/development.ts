import { z } from 'zod';

import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  type AttributeGroup,
  type AttributeKey,
  type ClubId,
  type GameDatabase,
  type Player,
  type PlayerAttributes,
  type PlayerId,
} from '@/data/schemas';
import { addDays, ageOn, parseIsoDate, toIsoDate } from '@/utils/date';
import { createRng, type Rng } from '@/utils/random';

import { POSITION_WEIGHTS } from '../ratings';
import { mixSeed, type Season } from '../season/season';
import { playerAbility } from '../transfers/valuation';
import { potentialOf } from './potential';

/**
 * Player development (Milestone 8b): once a month every player may gain or
 * lose attribute points.
 *
 * Attributes are whole numbers, so development is a CHANCE of +1 (or −1)
 * per attribute per month rather than fractional growth. The chance of +1:
 *
 *   BASE × age × gap-to-potential × playing time × training intensity
 *        × training focus (this attribute) × relevance (to his position)
 *
 * and of −1 grows with age, physical attributes first (from 30), then
 * technical (32), then mental (34). Deterministic: seeded by the world seed,
 * the month and the player.
 */

// --- Training -----------------------------------------------------------------

export const TRAINING_FOCUSES = ['balanced', 'attacking', 'defending', 'technical', 'physical'] as const;
export const TRAINING_INTENSITIES = ['light', 'normal', 'heavy'] as const;
export type TrainingFocus = (typeof TRAINING_FOCUSES)[number];
export type TrainingIntensity = (typeof TRAINING_INTENSITIES)[number];

export const TrainingSchema = z.strictObject({
  focus: z.enum(TRAINING_FOCUSES),
  intensity: z.enum(TRAINING_INTENSITIES),
});
export type Training = z.infer<typeof TrainingSchema>;

/** Also what every AI club does. */
export const DEFAULT_TRAINING: Training = { focus: 'balanced', intensity: 'normal' };

/** Attributes each focus works on (×1.6 growth); attributes in the opposite area grow ×0.7. */
const FOCUS_ATTRIBUTES: Record<Exclude<TrainingFocus, 'balanced'>, readonly AttributeKey[]> = {
  attacking: ['finishing', 'dribbling', 'firstTouch', 'crossing', 'composure', 'anticipation'],
  defending: ['tackling', 'marking', 'positioning', 'heading', 'strength', 'anticipation'],
  technical: ['passing', 'firstTouch', 'dribbling', 'vision', 'decisions', 'kicking'],
  physical: ['pace', 'acceleration', 'stamina', 'strength'],
};
const FOCUS_BOOST = 1.6;
const FOCUS_NEGLECT = 0.7;

export const INTENSITY_EFFECTS: Record<TrainingIntensity, { growth: number; injuryChance: number }> = {
  light: { growth: 0.75, injuryChance: 0.005 },
  normal: { growth: 1, injuryChance: 0.012 },
  heavy: { growth: 1.3, injuryChance: 0.035 },
};

function focusWeight(focus: TrainingFocus, key: AttributeKey): number {
  if (focus === 'balanced') return 1;
  return FOCUS_ATTRIBUTES[focus].includes(key) ? FOCUS_BOOST : FOCUS_NEGLECT;
}

// --- Rates ------------------------------------------------------------------------

/** Chance of +1 per attribute per month for a young, regular, fully-relevant attribute with room to grow. */
const BASE_GROWTH = 0.16;

/** How quickly players of an age still improve (1 = fastest). */
export function ageGrowth(age: number): number {
  if (age <= 18) return 1;
  if (age <= 20) return 0.85;
  if (age <= 22) return 0.65;
  if (age <= 24) return 0.4;
  if (age <= 27) return 0.2;
  return 0;
}

/** Monthly chance of −1 for an attribute group at an age. */
export function declineChance(group: AttributeGroup, age: number): number {
  switch (group) {
    case 'physical':
      return age < 30 ? 0 : 0.03 + 0.025 * (age - 30);
    case 'technical':
    case 'goalkeeping':
      return age < 32 ? 0 : 0.015 + 0.015 * (age - 32);
    case 'mental':
      return age < 34 ? 0 : 0.01 * (age - 33);
  }
}

/** 0.6 (never plays) … 1.2 (plays every minute). Playing matters, but young reserves still improve. */
export const playingTimeFactor = (share: number) => 0.6 + 0.6 * Math.max(0, Math.min(1, share));

/** How much an attribute matters for his position: 0.3 (not at all) … 1 (the most important). */
function relevance(player: Pick<Player, 'primaryPosition'>, key: AttributeKey, group: AttributeGroup): number {
  if (group === 'goalkeeping' && player.primaryPosition !== 'GK') return 0.1;
  const weights = POSITION_WEIGHTS[player.primaryPosition];
  const max = Math.max(...Object.values(weights).map((w) => w ?? 0));
  return 0.3 + 0.7 * ((weights[key] ?? 0) / max);
}

// --- One player, one month ------------------------------------------------------------

export type DevelopmentInput = {
  player: Player;
  attributes: PlayerAttributes;
  age: number;
  /** Share of his club's minutes he played this season, 0–1. */
  playingShare: number;
  training: Training;
  rng: Rng;
};

const GROUPS: readonly AttributeGroup[] = ['technical', 'mental', 'physical', 'goalkeeping'];

/** One month of development. Returns the same object if nothing changed. */
export function developPlayer({ player, attributes, age, playingShare, training, rng }: DevelopmentInput): PlayerAttributes {
  const gap = potentialOf(player, attributes) - playerAbility(player, attributes);
  const growthBase =
    BASE_GROWTH * ageGrowth(age) * Math.min(1, Math.max(0, gap) / 2) * playingTimeFactor(playingShare) * INTENSITY_EFFECTS[training.intensity].growth;

  let changed = false;
  const next = { ...attributes } as PlayerAttributes;
  for (const group of GROUPS) {
    const values = { ...attributes[group] } as Record<AttributeKey, number>;
    const decline = declineChance(group, age) * (training.focus === 'physical' && group === 'physical' ? 0.6 : 1);
    for (const key of ATTRIBUTE_KEYS[group] as readonly AttributeKey[]) {
      // Always draw twice per attribute, so one attribute's outcome never shifts another's random numbers.
      const growRoll = rng.next();
      const declineRoll = rng.next();
      const current = values[key];
      if (growRoll < growthBase * focusWeight(training.focus, key) * relevance(player, key, group) && current < ATTRIBUTE_MAX) {
        values[key] = current + 1;
        changed = true;
      } else if (declineRoll < decline && current > ATTRIBUTE_MIN) {
        values[key] = current - 1;
        changed = true;
      }
    }
    (next as Record<AttributeGroup, unknown>)[group] = values;
  }
  return changed ? next : attributes;
}

// --- The whole world, one month ----------------------------------------------------------

/** Every 1st of the month after `from`, up to and including `to`. */
export function monthsCrossed(from: string, to: string): string[] {
  const out: string[] = [];
  const start = parseIsoDate(from);
  let year = start.year;
  let month = start.month + 1;
  for (;;) {
    if (month > 12) {
      month = 1;
      year++;
    }
    const first = toIsoDate({ year, month, day: 1 });
    if (first > to) return out;
    out.push(first);
    month++;
  }
}

/** Share of his club's minutes each player played this season (all competitions). */
export function playingShares(season: Season): Map<PlayerId, number> {
  const clubMatches = new Map<ClubId, number>();
  for (const f of season.fixtures) {
    if (!f.result) continue;
    clubMatches.set(f.homeId, (clubMatches.get(f.homeId) ?? 0) + 1);
    clubMatches.set(f.awayId, (clubMatches.get(f.awayId) ?? 0) + 1);
  }
  const minutes = new Map<PlayerId, { clubId: ClubId; minutes: number }>();
  for (const line of season.playerStats) {
    const m = minutes.get(line.playerId);
    minutes.set(line.playerId, { clubId: line.clubId, minutes: (m?.minutes ?? 0) + line.minutes });
  }
  const shares = new Map<PlayerId, number>();
  for (const [id, { clubId, minutes: played }] of minutes) {
    const matches = clubMatches.get(clubId) ?? 0;
    if (matches > 0) shares.set(id, Math.min(1, played / (matches * 90)));
  }
  return shares;
}

/** Share assumed before a club has played (pre-season): an average squad player. */
const PRESEASON_SHARE = 0.5;

export type AttributeChange = { playerId: PlayerId; clubId: ClubId | null; abilityBefore: number; abilityAfter: number };

/**
 * One month's development for every player. `trainingFor` gives a club's
 * training (the user's choice; DEFAULT_TRAINING for AI clubs). Returns the
 * same database object if no attribute changed.
 */
export function developWorld(
  db: GameDatabase,
  month: string,
  season: Season,
  trainingFor: (clubId: ClubId | null) => Training,
  seed: number,
): { db: GameDatabase; changes: AttributeChange[] } {
  const players = new Map(db.players.map((p) => [p.id, p]));
  const clubOf = new Map(db.contracts.map((c) => [c.playerId, c.clubId]));
  const shares = playingShares(season);
  const anyPlayed = season.fixtures.some((f) => f.result);
  const monthSeed = mixSeed(seed, Number(month.replace(/-/g, '')));
  const changes: AttributeChange[] = [];

  const attributes = db.attributes.map((attrs) => {
    const player = players.get(attrs.playerId);
    if (!player) return attrs;
    const clubId = clubOf.get(player.id) ?? null;
    const next = developPlayer({
      player,
      attributes: attrs,
      age: ageOn(player.dateOfBirth, month),
      // Free agents don't play; at a club, this season's share (an average guess pre-season).
      playingShare: clubId === null ? 0 : anyPlayed ? (shares.get(player.id) ?? 0) : PRESEASON_SHARE,
      training: trainingFor(clubId),
      rng: createRng(mixSeed(monthSeed, Number(player.id.slice(4)))),
    });
    if (next !== attrs) {
      changes.push({ playerId: player.id, clubId, abilityBefore: playerAbility(player, attrs), abilityAfter: playerAbility(player, next) });
    }
    return next;
  });
  return changes.length ? { db: { ...db, attributes }, changes } : { db, changes };
}

/** Day after which a training knock heals: 3–21 days from `date`. */
export function trainingInjuryReturn(rng: Rng, date: string): { days: number; returns: string } {
  const days = rng.int(3, 21);
  return { days, returns: addDays(date, days) };
}
