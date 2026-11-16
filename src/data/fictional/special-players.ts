import type { Player, PlayerAttributes } from '../schemas';

/*
 * Hand-made players who aren't generated. They're added to the world after
 * everything else and use no random numbers, so every generated player stays
 * exactly as before (old saves still match their world).
 *
 * They start without a contract (a free agent). The game layer decides where
 * they go: Rick Kyalo joins whichever club the user picks for a new career
 * (store `startCareer`).
 */

/** Fixed id, well clear of generated ids (~1–3,200) and youth intakes (100,000+). */
export const RICK_KYALO_ID = 'plr_9000';

export const RICK_KYALO: Player = {
  id: RICK_KYALO_ID,
  firstName: 'Rick',
  lastName: 'Kyalo',
  // 24 at the start of the first season (1 July 2026).
  dateOfBirth: '2002-03-14',
  nationality: 'KEN',
  heightCm: 183,
  preferredFoot: 'right',
  primaryPosition: 'ST',
  secondaryPositions: ['AM'],
};

const MAX = 20;

/**
 * Every outfield attribute at the maximum. Goalkeeping stays at an ordinary
 * outfielder's level on purpose: with 20s there too, auto pick would rate him
 * the best keeper at most clubs (even after the unfamiliar-position penalty)
 * and put him in goal instead of up front.
 */
export const RICK_KYALO_ATTRIBUTES: PlayerAttributes = {
  playerId: RICK_KYALO_ID,
  technical: { finishing: MAX, passing: MAX, crossing: MAX, dribbling: MAX, firstTouch: MAX, tackling: MAX, marking: MAX, heading: MAX },
  mental: { vision: MAX, positioning: MAX, decisions: MAX, workRate: MAX, composure: MAX, anticipation: MAX },
  physical: { pace: MAX, acceleration: MAX, stamina: MAX, strength: MAX },
  goalkeeping: { handling: 4, reflexes: 4, aerialReach: 4, oneOnOnes: 4, kicking: 6 },
};
