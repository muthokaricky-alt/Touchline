import type { Tactics } from '@/game/tactics/tactics';

import type { ChanceType } from './types';

/**
 * Translates tactical instructions (Milestone 4) into numbers the engine uses.
 *
 * "logit" values are added inside a logistic function, so +0.2 means
 * "somewhat more likely" whatever the starting probability, and effects from
 * different instructions simply add up. Multipliers scale a quantity directly.
 *
 * Effects are deliberately modest: they stack (an all-out style combines
 * five of them), and they apply to both teams. These numbers are game design,
 * tuned against __tests__/calibration.test.ts. After changing any of them,
 * re-run those tests.
 */
export type TacticalEffects = {
  /** logit: share of possession. */
  possession: number;
  /** logit: chance of creating a shot in a minute with the ball. */
  chanceCreation: number;
  /** logit added to the OPPONENT's chance creation (how open we leave ourselves). */
  exposure: number;
  /** multiplier on our xG (patient play → better chances). */
  shotQuality: number;
  /** multiplier on how often we foul. */
  foulRate: number;
  /** multiplier on how fast our players tire. */
  energyDrain: number;
  /** multiplier on the weight of each chance type we create. */
  chanceMix: Record<ChanceType, number>;
  /**
   * multiplier on xG of through balls / long balls AGAINST us. A high line
   * concedes better chances in behind; a deep line fewer.
   */
  spaceBehind: number;
};

const NEUTRAL_MIX: Record<ChanceType, number> = {
  'through-ball': 1,
  cross: 1,
  'long-ball': 1,
  'long-shot': 1,
  'set-piece': 1,
};

export function tacticalEffects(t: Tactics): TacticalEffects {
  const e: TacticalEffects = {
    possession: 0,
    chanceCreation: 0,
    exposure: 0,
    shotQuality: 1,
    foulRate: 1,
    energyDrain: 1,
    chanceMix: { ...NEUTRAL_MIX },
    spaceBehind: 1,
  };

  switch (t.mentality) {
    case 'very-defensive':
      e.chanceCreation -= 0.22;
      e.exposure -= 0.2;
      e.possession -= 0.1;
      e.chanceMix['long-shot'] *= 0.8;
      break;
    case 'defensive':
      e.chanceCreation -= 0.1;
      e.exposure -= 0.1;
      e.possession -= 0.05;
      break;
    case 'balanced':
      break;
    case 'attacking':
      e.chanceCreation += 0.1;
      e.exposure += 0.08;
      e.possession += 0.03;
      break;
    case 'very-attacking':
      e.chanceCreation += 0.2;
      e.exposure += 0.18;
      e.possession += 0.05;
      e.chanceMix['long-shot'] *= 1.2;
      break;
  }

  switch (t.passing) {
    // Possession is a trade-off, not a free win: patient build-up keeps the
    // ball but creates fewer attempts per minute on it (calibration showed
    // short + slow winning 61% vs 48% before this was balanced).
    case 'short':
      e.possession += 0.18;
      e.chanceCreation -= 0.15;
      e.shotQuality *= 1.04;
      e.chanceMix['long-ball'] *= 0.5;
      e.chanceMix['through-ball'] *= 1.15;
      break;
    case 'mixed':
      break;
    case 'direct':
      e.possession -= 0.12;
      e.chanceCreation += 0.09;
      e.shotQuality *= 0.97;
      e.chanceMix['long-ball'] *= 2.2;
      e.chanceMix['through-ball'] *= 0.9;
      break;
  }

  switch (t.tempo) {
    case 'slow':
      e.possession += 0.1;
      e.chanceCreation -= 0.1;
      e.shotQuality *= 1.03;
      e.energyDrain *= 0.92;
      break;
    case 'normal':
      break;
    case 'fast':
      e.possession -= 0.06;
      e.chanceCreation += 0.07;
      e.shotQuality *= 0.96;
      e.energyDrain *= 1.12;
      break;
  }

  switch (t.width) {
    case 'narrow':
      e.chanceMix.cross *= 0.6;
      e.chanceMix['through-ball'] *= 1.15;
      e.exposure -= 0.02;
      break;
    case 'normal':
      break;
    case 'wide':
      e.chanceMix.cross *= 1.6;
      e.chanceMix['through-ball'] *= 0.9;
      e.exposure += 0.02;
      break;
  }

  switch (t.defensiveLine) {
    case 'deep':
      e.exposure -= 0.07;
      e.possession -= 0.05;
      e.spaceBehind *= 0.85;
      break;
    case 'standard':
      break;
    case 'high':
      e.exposure += 0.05;
      e.possession += 0.05;
      e.spaceBehind *= 1.2;
      break;
  }

  switch (t.pressing) {
    case 'low':
      e.possession -= 0.08;
      e.foulRate *= 0.8;
      e.energyDrain *= 0.85;
      e.exposure -= 0.02;
      break;
    case 'medium':
      break;
    case 'high':
      e.possession += 0.08;
      e.foulRate *= 1.3;
      e.energyDrain *= 1.25;
      e.exposure += 0.02;
      break;
  }

  return e;
}
