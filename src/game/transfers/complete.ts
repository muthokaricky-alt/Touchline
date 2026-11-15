import { z } from 'zod';

import {
  ClubIdSchema,
  IsoDateSchema,
  PlayerIdSchema,
  type ClubId,
  type Contract,
  type GameDatabase,
  type PlayerId,
  type Position,
} from '@/data/schemas';
import { parseIsoDate } from '@/utils/date';
import { formatDate } from '@/utils/format';

import { POSITION_GROUP } from '../positions';
import { playerAbility, wageDemand } from './valuation';
import { transferWindow } from './window';

/**
 * Completing a deal: the one place the WORLD changes. Returns a new database
 * object (immutable), so everything derived from the old one, like the AI
 * setup cache, is naturally refreshed.
 *
 * `transferProblems` re-checks everything, never trusting the UI: the window,
 * budgets, squad size. `completeTransfer` refuses a deal with problems.
 */

export const MAX_SQUAD = 30;
/** AI clubs sign a free agent when a sale takes them below this. */
export const MIN_AI_SQUAD = 22;

export const TransferRecordSchema = z.strictObject({
  date: IsoDateSchema,
  playerId: PlayerIdSchema,
  fromClubId: ClubIdSchema.nullable(),
  toClubId: ClubIdSchema,
  fee: z.int().min(0),
  weeklyWage: z.int().min(0),
  years: z.int().min(1).max(5),
});
export type TransferRecord = z.infer<typeof TransferRecordSchema>;

export type TransferDeal = {
  playerId: PlayerId;
  buyerId: ClubId;
  fee: number;
  weeklyWage: number;
  years: number;
  date: string;
  /**
   * Let a selling AI club sign a free-agent replacement (default true).
   * False when the USER sells: the game never signs players on your behalf.
   */
  replaceSeller?: boolean;
};

/** The user can't sell or release below this many players. */
export const MIN_USER_SQUAD = 16;

export function wageBill(db: GameDatabase, clubId: ClubId): number {
  return db.contracts.filter((c) => c.clubId === clubId).reduce((sum, c) => sum + c.weeklyWage, 0);
}

export function squadSize(db: GameDatabase, clubId: ClubId): number {
  return db.contracts.filter((c) => c.clubId === clubId).length;
}

export function transferProblems(db: GameDatabase, deal: TransferDeal): string[] {
  const problems: string[] = [];
  const player = db.players.find((p) => p.id === deal.playerId);
  const buyer = db.clubs.find((c) => c.id === deal.buyerId);
  if (!player) problems.push('Unknown player.');
  if (!buyer) problems.push('Unknown club.');
  if (!player || !buyer) return problems;

  const current = db.contracts.find((c) => c.playerId === deal.playerId);
  if (current?.clubId === deal.buyerId) problems.push('He already plays for you.');
  const window = transferWindow(deal.date);
  if (current && !window.open) problems.push(`The transfer window is closed (it opens on ${formatDate(window.opensNext)}).`);
  if (!current && deal.fee !== 0) problems.push('Free agents join without a fee.');
  if (!Number.isInteger(deal.fee) || deal.fee < 0) problems.push('Invalid fee.');
  if (!Number.isInteger(deal.years) || deal.years < 1 || deal.years > 5) problems.push('Contracts run for 1–5 years.');
  if (deal.fee > buyer.finances.transferBudget) problems.push('The fee is more than your transfer budget.');
  if (wageBill(db, buyer.id) + deal.weeklyWage > buyer.finances.weeklyWageBudget) problems.push('His wage would take you over your wage budget.');
  if (squadSize(db, buyer.id) >= MAX_SQUAD) problems.push(`Your squad is full (${MAX_SQUAD} players).`);
  return problems;
}

/** Contracts end on 30 June: signing in the 2026/27 season for 3 years runs to June 2029. */
export function contractEnd(date: string, years: number): string {
  const { year, month } = parseIsoDate(date);
  const seasonStartYear = month >= 7 ? year : year - 1;
  return `${seasonStartYear + years}-06-30`;
}

function freeSquadNumber(db: GameDatabase, clubId: ClubId): number {
  const used = new Set(db.contracts.filter((c) => c.clubId === clubId).map((c) => c.squadNumber));
  for (let n = 2; n <= 99; n++) if (!used.has(n)) return n;
  return 99; // unreachable with MAX_SQUAD 30
}

function newContract(db: GameDatabase, playerId: PlayerId, clubId: ClubId, weeklyWage: number, years: number, date: string): Contract {
  return {
    id: `con_${playerId.replace(/^plr_/, '')}_${date.replace(/-/g, '')}`,
    playerId,
    clubId,
    squadNumber: freeSquadNumber(db, clubId),
    weeklyWage,
    startDate: date,
    endDate: contractEnd(date, years),
  };
}

/**
 * Gives an unattached player a contract at `clubId` (youth intake, Milestone 9).
 * No fee and no budget checks: academy players are cheap and the club made
 * the decision. Next free squad number.
 */
export function addContract(db: GameDatabase, playerId: PlayerId, clubId: ClubId, weeklyWage: number, years: number, date: string): GameDatabase {
  if (db.contracts.some((c) => c.playerId === playerId)) throw new RangeError(`${playerId} already has a contract`);
  return { ...db, contracts: [...db.contracts, newContract(db, playerId, clubId, weeklyWage, years, date)] };
}

function withFinances(db: GameDatabase, clubId: ClubId, change: { balance: number; transferBudget: number }): GameDatabase {
  return {
    ...db,
    clubs: db.clubs.map((c) =>
      c.id === clubId
        ? {
            ...c,
            finances: {
              ...c.finances,
              balance: c.finances.balance + change.balance,
              transferBudget: Math.max(0, c.finances.transferBudget + change.transferBudget),
            },
          }
        : c,
    ),
  };
}

export type TransferOutcome = { db: GameDatabase; records: TransferRecord[] };

export function completeTransfer(db: GameDatabase, deal: TransferDeal): TransferOutcome {
  const problems = transferProblems(db, deal);
  if (problems.length) throw new RangeError(problems.join(' '));

  const old = db.contracts.find((c) => c.playerId === deal.playerId) ?? null;
  const sellerId = old?.clubId ?? null;

  let next: GameDatabase = { ...db, contracts: db.contracts.filter((c) => c.playerId !== deal.playerId) };
  next = { ...next, contracts: [...next.contracts, newContract(next, deal.playerId, deal.buyerId, deal.weeklyWage, deal.years, deal.date)] };
  next = withFinances(next, deal.buyerId, { balance: -deal.fee, transferBudget: -deal.fee });
  // Selling clubs keep half of a fee to spend again.
  if (sellerId) next = withFinances(next, sellerId, { balance: deal.fee, transferBudget: Math.round(deal.fee / 2) });

  const records: TransferRecord[] = [
    { date: deal.date, playerId: deal.playerId, fromClubId: sellerId, toClubId: deal.buyerId, fee: deal.fee, weeklyWage: deal.weeklyWage, years: deal.years },
  ];

  if (sellerId && deal.replaceSeller !== false && squadSize(next, sellerId) < MIN_AI_SQUAD) {
    const position = db.players.find((p) => p.id === deal.playerId)!.primaryPosition;
    const replacement = signReplacement(next, sellerId, position, deal.date);
    if (replacement) {
      next = replacement.db;
      records.push(replacement.record);
    }
  }
  return { db: next, records };
}

// --- Releases and renewals ----------------------------------------------------

/** Compensation to release a player: half the wages left on his contract. */
export function releaseCost(contract: Pick<Contract, 'weeklyWage' | 'endDate'>, date: string): number {
  const end = parseIsoDate(contract.endDate);
  const now = parseIsoDate(date);
  const weeksLeft = Math.max(0, ((end.year - now.year) * 12 + (end.month - now.month)) * (52 / 12) + (end.day - now.day) / 7);
  return Math.round((0.5 * contract.weeklyWage * weeksLeft) / 1000) * 1000;
}

/** Terminates a contract: the club pays `releaseCost`, the player becomes a free agent. */
export function releasePlayer(db: GameDatabase, playerId: PlayerId, date: string): { db: GameDatabase; cost: number } {
  const contract = db.contracts.find((c) => c.playerId === playerId);
  if (!contract) throw new RangeError('He has no contract to release.');
  if (squadSize(db, contract.clubId) <= MIN_USER_SQUAD) throw new RangeError(`You need at least ${MIN_USER_SQUAD} players.`);
  const cost = releaseCost(contract, date);
  const next = { ...db, contracts: db.contracts.filter((c) => c.playerId !== playerId) };
  return { db: withFinances(next, contract.clubId, { balance: -cost, transferBudget: 0 }), cost };
}

/** Replaces a player's contract terms at his current club (renewal). Squad number is kept. */
/** Contract lengths (up to `maxYears`) that would end after the current contract: a renewal never shortens a deal. */
export function renewalYears(contract: Contract, date: string, maxYears: number): number[] {
  return Array.from({ length: maxYears }, (_, i) => i + 1).filter((years) => contractEnd(date, years) > contract.endDate);
}

export function renewContract(db: GameDatabase, playerId: PlayerId, weeklyWage: number, years: number, date: string): GameDatabase {
  const contract = db.contracts.find((c) => c.playerId === playerId);
  if (!contract) throw new RangeError('He has no contract to renew.');
  if (!Number.isInteger(years) || years < 1 || years > 5) throw new RangeError('Contracts run for 1–5 years.');
  if (!renewalYears(contract, date, 5).includes(years)) {
    throw new RangeError(`A new contract must run beyond his current one (until ${formatDate(contract.endDate)}).`);
  }
  const club = db.clubs.find((c) => c.id === contract.clubId);
  const otherWages = wageBill(db, contract.clubId) - contract.weeklyWage;
  if (club && otherWages + weeklyWage > club.finances.weeklyWageBudget) throw new RangeError('His new wage would take you over your wage budget.');
  return {
    ...db,
    contracts: db.contracts.map((c) =>
      c.playerId === playerId ? { ...c, weeklyWage, startDate: date, endDate: contractEnd(date, years) } : c,
    ),
  };
}

/**
 * An AI club signs the best free agent for `position` (or, failing that,
 * the same line), on a 2-year deal.
 */
export function signReplacement(db: GameDatabase, clubId: ClubId, position: Position, date: string): { db: GameDatabase; record: TransferRecord } | null {
  const club = db.clubs.find((c) => c.id === clubId);
  if (!club) return null;
  const contracted = new Set(db.contracts.map((c) => c.playerId));
  const free = db.players.filter((p) => !contracted.has(p.id));
  const abilityOf = (id: PlayerId) => {
    const attrs = db.attributes.find((a) => a.playerId === id)!;
    return playerAbility(db.players.find((p) => p.id === id)!, attrs);
  };
  const best = (candidates: typeof free) =>
    [...candidates].sort((a, b) => abilityOf(b.id) - abilityOf(a.id) || (a.id < b.id ? -1 : 1))[0];
  const pick =
    best(free.filter((p) => p.primaryPosition === position)) ??
    best(free.filter((p) => POSITION_GROUP[p.primaryPosition] === POSITION_GROUP[position]));
  if (!pick) return null;

  const weeklyWage = wageDemand({ ability: abilityOf(pick.id), clubReputation: club.reputation, currentWage: null });
  const contract = newContract(db, pick.id, clubId, weeklyWage, 2, date);
  return {
    db: { ...db, contracts: [...db.contracts, contract] },
    record: { date, playerId: pick.id, fromClubId: null, toClubId: clubId, fee: 0, weeklyWage, years: 2 },
  };
}
