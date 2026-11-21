import { FOREIGN_NATIONS_BY_COUNTRY, generateYouthIntake } from '@/data/fictional';
import type { Club, ClubId, GameDatabase, Player, PlayerAttributes, PlayerId } from '@/data/schemas';
import { ageOn } from '@/utils/date';
import { createRng } from '@/utils/random';

import { assignPotential, potentialOf } from '../development/potential';
import { mixSeed } from '../season/season';
import { FIRST_PROSPECT_YEAR, generatedProspects, isProspectId, prospectYear } from './prospects';
import { addContract, MAX_SQUAD, squadSize } from '../transfers/complete';
import { playerAbility, wageDemand } from '../transfers/valuation';

/**
 * World renewal (Milestone 9a): every summer old players retire, weak
 * unwanted free agents leave football, and each club's academy produces a
 * youth intake.
 *
 * Intakes are REGENERATED, never saved: they depend only on (world seed,
 * year, club), so `worldFor(base, seed, startYear)` rebuilds every intake up
 * to a season exactly. The save stores only what changed (contracts,
 * attributes, who retired). Nothing here may depend on anything else, or
 * reloading would produce different players.
 */

/** The first summer with an intake: the rollover into 2027/28. */
export const FIRST_INTAKE_YEAR = 2027;
/** AI clubs keep this many of each intake (the best prospects)… */
export const AI_KEEPS = 2;
/** …while their squad is below this. */
const AI_YOUTH_ROOM = 26;
const YOUTH_CONTRACT_YEARS = 3;

/**
 * Id number of the k-th youngster of a club's intake. Base-world ids are
 * 1…~3200, so these can't collide. The first 100 clubs (England's 40 and the
 * first 60 abroad) keep the original scheme; clubs beyond use a range of
 * their own (clubIndex · 10 would run into the next year's ids).
 */
export function intakePlayerNumber(year: number, clubIndex: number, k: number): number {
  if (clubIndex >= 100) return 1_000_000 + (year - 2000) * 10_000 + clubIndex * 10 + k;
  return 100_000 + (year - 2000) * 1000 + clubIndex * 10 + k;
}

/** The random stream of a club's intake: unchanged for the first 100 clubs, a separate range beyond (no overlap with other years). */
const intakeSeedSalt = (year: number, clubIndex: number) => (clubIndex >= 100 ? 10_000_000 + year * 1000 + clubIndex : year * 100 + clubIndex);

export type ClubIntake = { clubId: ClubId; players: Player[]; attributes: PlayerAttributes[] };

const intakeCache = new Map<string, ClubIntake[]>();

/** Every club's intake for the summer of `year` (with potential). Deterministic; cached. */
export function generatedIntake(clubs: readonly Club[], seed: number, year: number): ClubIntake[] {
  const key = `${seed}:${year}`;
  const cached = intakeCache.get(key);
  if (cached) return cached;
  const date = `${year}-07-01`;
  const intakes = clubs.map((club, clubIndex) => {
    const rng = createRng(mixSeed(seed, intakeSeedSalt(year, clubIndex)));
    const generated = generateYouthIntake({
      rng,
      club,
      // 2–4 a year: about what an academy turns into professionals (3–5 grew the world every year).
      count: rng.int(2, 4),
      referenceDate: date,
      playerNumber: (k) => intakePlayerNumber(year, clubIndex, k),
      foreignNations: FOREIGN_NATIONS_BY_COUNTRY[club.country],
    });
    const withPotential = assignPotential(generated, seed, date);
    return { clubId: club.id, players: withPotential.players, attributes: withPotential.attributes };
  });
  intakeCache.set(key, intakes);
  return intakes;
}

const worldCache = new WeakMap<GameDatabase, Map<number, GameDatabase>>();

/**
 * The world as generated for a season: the base world plus every intake up
 * to `startYear` (no contracts, nobody retired). Saves are stored as changes
 * against this. Cached per base object and year.
 */
export function worldFor(base: GameDatabase, seed: number, startYear: number): GameDatabase {
  let perBase = worldCache.get(base);
  if (!perBase) {
    perBase = new Map();
    worldCache.set(base, perBase);
  }
  const cached = perBase.get(startYear);
  if (cached) return cached;
  const players = [...base.players];
  const attributes = [...base.attributes];
  for (let year = FIRST_INTAKE_YEAR; year <= startYear; year++) {
    for (const intake of generatedIntake(base.clubs, seed, year)) {
      players.push(...intake.players);
      attributes.push(...intake.attributes);
    }
  }
  for (let year = FIRST_PROSPECT_YEAR; year <= startYear; year++) {
    for (const pool of generatedProspects(base.clubs, seed, year)) {
      players.push(...pool.players);
      attributes.push(...pool.attributes);
    }
  }
  const world = { ...base, players, attributes };
  perBase.set(startYear, world);
  return world;
}

// --- Retirement ------------------------------------------------------------------------

/** Chance a player retires this summer: rises steeply from 33; weaker players go sooner. */
export function retirementChance(age: number, ability: number): number {
  const byAge = age < 33 ? 0 : age === 33 ? 0.08 : age === 34 ? 0.2 : age === 35 ? 0.4 : age === 36 ? 0.6 : age === 37 ? 0.8 : 0.95;
  const quality = ability < 9 ? 1.4 : ability >= 15 ? 0.6 : 1;
  return Math.min(0.98, byAge * quality);
}

/**
 * Chance an unattached player gives up on football this summer: most
 * released academy players and journeymen nobody signs. Keeps the free-agent
 * pool from growing forever (the ten-summer test measures it).
 */
export function quitChance(ability: number, age: number): number {
  if (age >= 30 && ability < 12) return 0.5;
  if (ability < 10) return age < 19 ? 0.5 : 0.7;
  // Decent players nobody here signed: some move abroad or to lower leagues each year.
  return 0.2;
}

export type Leaver = { playerId: PlayerId; clubId: ClubId | null; reason: 'retired' | 'quit' };

/** Retirements and drop-outs for the summer of `year`, removed from the world (players, attributes, contracts). */
export function retirePlayers(db: GameDatabase, seed: number, year: number): { db: GameDatabase; leavers: Leaver[] } {
  const date = `${year}-07-01`;
  const clubOf = new Map(db.contracts.map((c) => [c.playerId, c.clubId]));
  const attributes = new Map(db.attributes.map((a) => [a.playerId, a]));
  const yearSeed = mixSeed(seed, year + 900_000);
  const leavers: Leaver[] = [];
  for (const player of db.players) {
    const attrs = attributes.get(player.id);
    if (!attrs) continue;
    const roll = createRng(mixSeed(yearSeed, Number(player.id.slice(4)))).next();
    const age = ageOn(player.dateOfBirth, date);
    const ability = playerAbility(player, attrs);
    const clubId = clubOf.get(player.id) ?? null;
    // An unsigned youth prospect stays for their summer's season, then gives up on football (no dice: they are the user's to find).
    if (clubId === null && isProspectId(player.id)) {
      if (prospectYear(player.id) < year) leavers.push({ playerId: player.id, clubId, reason: 'quit' });
      continue;
    }
    if (roll < retirementChance(age, ability)) leavers.push({ playerId: player.id, clubId, reason: 'retired' });
    else if (clubId === null && roll < quitChance(ability, age)) leavers.push({ playerId: player.id, clubId, reason: 'quit' });
  }
  const gone = new Set(leavers.map((l) => l.playerId));
  return {
    db: {
      ...db,
      players: db.players.filter((p) => !gone.has(p.id)),
      attributes: db.attributes.filter((a) => !gone.has(a.playerId)),
      contracts: db.contracts.filter((c) => !gone.has(c.playerId)),
    },
    leavers,
  };
}

// --- Youth intake ----------------------------------------------------------------------------

/** What an academy graduate earns: well below a first-team player of the same rating. */
export function youthWage(ability: number, clubReputation: number): number {
  return Math.round((wageDemand({ ability, clubReputation, currentWage: null }) * 0.4) / 100) * 100;
}

export type IntakeOutcome = {
  db: GameDatabase;
  /** The user's new academy players (signed). */
  userSigned: PlayerId[];
  /** User's youngsters who didn't fit in a full squad (now free agents). */
  userReleased: PlayerId[];
};

/**
 * Adds the summer's intake to the world. The user's club signs every
 * youngster it has room for (the user decides later whom to keep); AI clubs
 * keep their best AI_KEEPS by potential. Everyone else is a free agent.
 */
export function admitIntake(db: GameDatabase, seed: number, year: number, userClubId: ClubId): IntakeOutcome {
  const date = `${year}-07-01`;
  const intakes = generatedIntake(db.clubs, seed, year);
  const existing = new Set(db.players.map((p) => p.id));
  let world: GameDatabase = {
    ...db,
    players: [...db.players, ...intakes.flatMap((i) => i.players.filter((p) => !existing.has(p.id)))],
    attributes: [...db.attributes, ...intakes.flatMap((i) => i.attributes.filter((a) => !existing.has(a.playerId)))],
  };
  // This summer's country prospects join with no contract (and stay hidden until scouted).
  if (year >= FIRST_PROSPECT_YEAR) {
    const pools = generatedProspects(world.clubs, seed, year);
    world = {
      ...world,
      players: [...world.players, ...pools.flatMap((pool) => pool.players.filter((p) => !existing.has(p.id)))],
      attributes: [...world.attributes, ...pools.flatMap((pool) => pool.attributes.filter((a) => !existing.has(a.playerId)))],
    };
  }
  const userSigned: PlayerId[] = [];
  const userReleased: PlayerId[] = [];

  for (const intake of intakes) {
    const club = world.clubs.find((c) => c.id === intake.clubId);
    if (!club) continue;
    const attrs = new Map(intake.attributes.map((a) => [a.playerId, a]));
    const byPotential = intake.players
      .filter((p) => !existing.has(p.id))
      .sort((a, b) => potentialOf(b, attrs.get(b.id)!) - potentialOf(a, attrs.get(a.id)!) || a.id.localeCompare(b.id));
    const isUser = club.id === userClubId;
    const wanted = isUser ? byPotential : byPotential.slice(0, AI_KEEPS);
    for (const player of wanted) {
      if (squadSize(world, club.id) >= (isUser ? MAX_SQUAD : AI_YOUTH_ROOM)) {
        if (isUser) userReleased.push(player.id);
        continue;
      }
      const ability = playerAbility(player, attrs.get(player.id)!);
      world = addContract(world, player.id, club.id, youthWage(ability, club.reputation), YOUTH_CONTRACT_YEARS, date);
      if (isUser) userSigned.push(player.id);
    }
  }
  return { db: world, userSigned, userReleased };
}
