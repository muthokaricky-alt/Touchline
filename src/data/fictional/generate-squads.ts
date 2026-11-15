import { ageOn, parseIsoDate, toIsoDate } from '@/utils/date';
import { clamp } from '@/utils/math';
import type { Rng } from '@/utils/random';

import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  type AttributeKey,
  type Club,
  type Contract,
  type Player,
  type PlayerAttributes,
  type Position,
  type PreferredFoot,
} from '../schemas';
import { FOREIGN_NATIONS, NAME_POOLS } from './names';

/**
 * Generates a full squad (identity + attributes + contract per player) for a
 * club. Pure apart from the `rng` it's given: same seed, same squads.
 *
 * This is test/starter data, not the Milestone 9 regen system, but it's the
 * natural starting point for it.
 */

// ---------------------------------------------------------------------------
// Squad shape
// ---------------------------------------------------------------------------

type SquadSlot = { position: Position; squadNumber: number };

/** 3 GK, 8 DEF, 7 MID, 4 ATT = 22 players with fixed, unique shirt numbers. */
export const SQUAD_TEMPLATE: readonly SquadSlot[] = [
  { position: 'GK', squadNumber: 1 },
  { position: 'GK', squadNumber: 13 },
  { position: 'GK', squadNumber: 31 },
  { position: 'RB', squadNumber: 2 },
  { position: 'RB', squadNumber: 22 },
  { position: 'LB', squadNumber: 3 },
  { position: 'LB', squadNumber: 23 },
  { position: 'CB', squadNumber: 4 },
  { position: 'CB', squadNumber: 5 },
  { position: 'CB', squadNumber: 6 },
  { position: 'CB', squadNumber: 15 },
  { position: 'DM', squadNumber: 16 },
  { position: 'CM', squadNumber: 8 },
  { position: 'CM', squadNumber: 14 },
  { position: 'CM', squadNumber: 18 },
  { position: 'RM', squadNumber: 17 },
  { position: 'LM', squadNumber: 12 },
  { position: 'AM', squadNumber: 10 },
  { position: 'RW', squadNumber: 7 },
  { position: 'LW', squadNumber: 11 },
  { position: 'ST', squadNumber: 9 },
  { position: 'ST', squadNumber: 19 },
];

/** Positions a player in a given primary position can plausibly also play. */
const NEIGHBOUR_POSITIONS: Record<Position, readonly Position[]> = {
  GK: [],
  RB: ['RWB', 'CB'],
  LB: ['LWB', 'CB'],
  CB: ['DM', 'RB', 'LB'],
  RWB: ['RB', 'RM'],
  LWB: ['LB', 'LM'],
  DM: ['CM', 'CB'],
  CM: ['DM', 'AM'],
  RM: ['RW', 'RWB', 'CM'],
  LM: ['LW', 'LWB', 'CM'],
  AM: ['CM', 'ST', 'RW', 'LW'],
  RW: ['RM', 'AM', 'ST'],
  LW: ['LM', 'AM', 'ST'],
  ST: ['AM', 'RW', 'LW'],
};

const LEFT_SIDED: ReadonlySet<Position> = new Set(['LB', 'LWB', 'LM', 'LW']);
const TALL_ROLES: ReadonlySet<Position> = new Set(['GK', 'CB']);

// ---------------------------------------------------------------------------
// Attribute profiles: offsets added to a player's overall level
// ---------------------------------------------------------------------------

type RoleProfile = Partial<Record<AttributeKey, number>>;

/** Outfield players are poor goalkeepers. */
const OUTFIELD: RoleProfile = { handling: -9, reflexes: -9, aerialReach: -9, oneOnOnes: -9, kicking: -6 };

const GOALKEEPER: RoleProfile = {
  handling: 3, reflexes: 3, aerialReach: 2, oneOnOnes: 2, kicking: 1, positioning: 2, composure: 1,
  finishing: -8, dribbling: -6, crossing: -6, tackling: -6, marking: -6, heading: -4,
  firstTouch: -3, pace: -3, acceleration: -3,
};
const FULL_BACK: RoleProfile = {
  ...OUTFIELD, pace: 2, acceleration: 2, stamina: 2, crossing: 2, tackling: 2, marking: 1,
  finishing: -4, heading: -1,
};
const CENTRE_BACK: RoleProfile = {
  ...OUTFIELD, tackling: 3, marking: 3, heading: 3, strength: 3, positioning: 3,
  pace: -1, dribbling: -4, finishing: -5, crossing: -4, vision: -2,
};
const DEFENSIVE_MID: RoleProfile = {
  ...OUTFIELD, tackling: 3, positioning: 2, workRate: 2, stamina: 2, passing: 1, decisions: 1,
  finishing: -3, dribbling: -1,
};
const CENTRAL_MID: RoleProfile = {
  ...OUTFIELD, passing: 3, vision: 2, decisions: 2, stamina: 2, firstTouch: 1, workRate: 1,
  heading: -2, finishing: -1,
};
const WIDE: RoleProfile = {
  ...OUTFIELD, pace: 3, acceleration: 3, crossing: 3, dribbling: 2, stamina: 1,
  tackling: -3, marking: -3, heading: -3, strength: -2,
};
const ATTACKING_MID: RoleProfile = {
  ...OUTFIELD, vision: 3, passing: 2, dribbling: 3, firstTouch: 3, composure: 1,
  tackling: -4, marking: -4, strength: -2,
};
const STRIKER: RoleProfile = {
  ...OUTFIELD, finishing: 4, composure: 2, anticipation: 2, heading: 1, firstTouch: 1,
  tackling: -5, marking: -5, passing: -1,
};

const PROFILES: Record<Position, RoleProfile> = {
  GK: GOALKEEPER,
  RB: FULL_BACK, LB: FULL_BACK, RWB: FULL_BACK, LWB: FULL_BACK,
  CB: CENTRE_BACK,
  DM: DEFENSIVE_MID,
  CM: CENTRAL_MID,
  RM: WIDE, LM: WIDE, RW: WIDE, LW: WIDE,
  AM: ATTACKING_MID,
  ST: STRIKER,
};

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export type GeneratedSquad = {
  players: Player[];
  attributes: PlayerAttributes[];
  contracts: Contract[];
};

export type SquadGenerationOptions = {
  rng: Rng;
  club: Club;
  /** Game date the squad is generated for; ages and contracts are relative to it. */
  referenceDate: string;
  /** Number of the first player; IDs are sequential across the whole database. */
  firstPlayerNumber: number;
};

export function generateSquad({ rng, club, referenceDate, firstPlayerNumber }: SquadGenerationOptions): GeneratedSquad {
  const squad: GeneratedSquad = { players: [], attributes: [], contracts: [] };
  // Reputation 9 → level ~9, reputation 16 → level ~14.
  const clubLevel = 4 + Math.round(club.reputation * 0.6);

  SQUAD_TEMPLATE.forEach((slot, index) => {
    const serial = String(firstPlayerNumber + index).padStart(4, '0');
    const playerId = `plr_${serial}`;
    const age = slot.position === 'GK' ? rng.int(18, 36) : rng.int(17, 34);
    const youthPenalty = age < 20 ? 2 : 0;
    const level = clamp(clubLevel + rng.int(-3, 2) - youthPenalty, 3, 18);

    squad.players.push(generatePlayer(rng, playerId, slot.position, age, club, referenceDate));
    squad.attributes.push(generateAttributes(rng, playerId, slot.position, level));
    squad.contracts.push(generateContract(rng, `con_${serial}`, playerId, club, slot.squadNumber, level, referenceDate));
  });

  return squad;
}

function generatePlayer(
  rng: Rng,
  id: string,
  position: Position,
  age: number,
  club: Club,
  referenceDate: string,
): Player {
  const nationality = rng.chance(0.7) ? club.country : rng.pick(FOREIGN_NATIONS);
  const names = NAME_POOLS[nationality] ?? NAME_POOLS.ENG;

  return {
    id,
    firstName: rng.pick(names.firstNames),
    lastName: rng.pick(names.lastNames),
    dateOfBirth: dateOfBirthForAge(rng, age, referenceDate),
    nationality,
    heightCm: TALL_ROLES.has(position)
      ? rng.int(183, 197)
      : position === 'ST'
        ? rng.int(175, 193)
        : rng.int(167, 188),
    preferredFoot: pickFoot(rng, position),
    primaryPosition: position,
    secondaryPositions: pickSecondaryPositions(rng, position),
  };
}

function generateAttributes(rng: Rng, playerId: string, position: Position, level: number): PlayerAttributes {
  const profile = PROFILES[position];
  const valueFor = (key: AttributeKey) =>
    clamp(level + (profile[key] ?? 0) + rng.int(-2, 2), ATTRIBUTE_MIN, ATTRIBUTE_MAX);

  return {
    playerId,
    technical: buildGroup(ATTRIBUTE_KEYS.technical, valueFor),
    mental: buildGroup(ATTRIBUTE_KEYS.mental, valueFor),
    physical: buildGroup(ATTRIBUTE_KEYS.physical, valueFor),
    goalkeeping: buildGroup(ATTRIBUTE_KEYS.goalkeeping, valueFor),
  };
}

function generateContract(
  rng: Rng,
  id: string,
  playerId: string,
  club: Club,
  squadNumber: number,
  level: number,
  referenceDate: string,
): Contract {
  const { year } = parseIsoDate(referenceDate);
  // Placeholder wage model until Milestone 7: grows with ability and club stature.
  const weeklyWage = Math.round((level * level * 45 + club.reputation * 250) / 100) * 100;

  return {
    id,
    playerId,
    clubId: club.id,
    squadNumber,
    weeklyWage,
    startDate: toIsoDate({ year: year - rng.int(0, 3), month: 7, day: 1 }),
    endDate: toIsoDate({ year: year + rng.int(1, 4), month: 6, day: 30 }),
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Builds `{ key: value }` for each key. The one place we assemble a typed record from a key list. */
function buildGroup<K extends string>(keys: readonly K[], valueFor: (key: K) => number): Record<K, number> {
  const group = {} as Record<K, number>;
  for (const key of keys) group[key] = valueFor(key);
  return group;
}

/** A random birthday such that the player is exactly `age` on `referenceDate`. */
function dateOfBirthForAge(rng: Rng, age: number, referenceDate: string): string {
  const ref = parseIsoDate(referenceDate);
  const month = rng.int(1, 12);
  const day = rng.int(1, 28); // 28 keeps every month valid
  const birthdayPassed = month < ref.month || (month === ref.month && day <= ref.day);
  const dateOfBirth = toIsoDate({ year: ref.year - age - (birthdayPassed ? 0 : 1), month, day });

  if (ageOn(dateOfBirth, referenceDate) !== age) {
    throw new Error(`dateOfBirthForAge produced the wrong age for ${dateOfBirth}`); // programming error guard
  }
  return dateOfBirth;
}

function pickFoot(rng: Rng, position: Position): PreferredFoot {
  const roll = rng.next();
  if (LEFT_SIDED.has(position)) return roll < 0.75 ? 'left' : roll < 0.85 ? 'both' : 'right';
  return roll < 0.85 ? 'right' : roll < 0.92 ? 'both' : 'left';
}

function pickSecondaryPositions(rng: Rng, position: Position): Position[] {
  const available = [...NEIGHBOUR_POSITIONS[position]];
  const count = rng.int(0, Math.min(2, available.length));
  const chosen: Position[] = [];
  for (let i = 0; i < count; i++) {
    const [taken] = available.splice(rng.int(0, available.length - 1), 1);
    chosen.push(taken);
  }
  return chosen;
}
