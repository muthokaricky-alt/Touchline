import { SQUAD_TEMPLATE } from '@/data/fictional/generate-squads';
import type { ClubId, Contract, GameDatabase, PlayerId, Position } from '@/data/schemas';
import { parseIsoDate } from '@/utils/date';

import { aiSetup } from '../ai/opponent';
import type { NewMessage } from '../inbox/inbox';
import { starterIds } from '../lineup';
import { fullName } from '../squad/squad-selectors';
import { contractEnd, MIN_AI_SQUAD, signReplacement, squadSize } from './complete';
import { ageAt, playerAbility, wageDemand } from './valuation';

/**
 * Contract lifecycle at the season boundary, and the warnings before it.
 *
 * At the start of a season (1 July), contracts that ended on 30 June expire:
 *   - the USER's players leave as free agents (warned in January and April);
 *   - AI clubs renew first-team regulars and players under 30, release the
 *     rest, then refill to MIN_AI_SQUAD from free agents.
 * The released players join the free-agent pool, so every summer has a
 * living free-agent market.
 */

export type ExpiryOutcome = {
  db: GameDatabase;
  /** The user's players whose contracts ran out. */
  userLeavers: PlayerId[];
  aiRenewed: number;
  aiReleased: number;
  aiSigned: number;
};

const expired = (c: Contract, seasonStart: string) => c.endDate < seasonStart;

export function processExpiries(db: GameDatabase, userClubId: ClubId, seasonStart: string): ExpiryOutcome {
  const userLeavers: PlayerId[] = [];
  let aiRenewed = 0;
  let aiReleased = 0;
  const contracts: Contract[] = [];
  const players = new Map(db.players.map((p) => [p.id, p]));
  const attributes = new Map(db.attributes.map((a) => [a.playerId, a]));
  const keyPlayers = new Map<ClubId, Set<PlayerId>>();
  const isKey = (clubId: ClubId, playerId: PlayerId) => {
    if (!keyPlayers.has(clubId)) keyPlayers.set(clubId, new Set(starterIds(aiSetup(db, clubId).lineup)));
    return keyPlayers.get(clubId)!.has(playerId);
  };

  for (const c of db.contracts) {
    if (!expired(c, seasonStart)) {
      contracts.push(c);
      continue;
    }
    if (c.clubId === userClubId) {
      userLeavers.push(c.playerId);
      continue;
    }
    const player = players.get(c.playerId);
    const attrs = attributes.get(c.playerId);
    const age = player ? ageAt(player, seasonStart) : 99;
    if (player && attrs && (isKey(c.clubId, c.playerId) || age < 30)) {
      const club = db.clubs.find((x) => x.id === c.clubId)!;
      contracts.push({
        ...c,
        weeklyWage: wageDemand({ ability: playerAbility(player, attrs), clubReputation: club.reputation, currentWage: null }),
        startDate: seasonStart,
        endDate: contractEnd(seasonStart, age >= 30 ? 1 : 2),
      });
      aiRenewed++;
    } else {
      aiReleased++;
    }
  }

  let next: GameDatabase = { ...db, contracts };
  let aiSigned = 0;
  for (const club of db.clubs) {
    if (club.id === userClubId) continue;
    // Fill the positions the club is short of compared with the squad template.
    for (const position of missingPositions(next, club.id)) {
      if (squadSize(next, club.id) >= MIN_AI_SQUAD) break;
      const signed = signReplacement(next, club.id, position, seasonStart);
      if (!signed) continue;
      next = signed.db;
      aiSigned++;
    }
  }
  return { db: next, userLeavers, aiRenewed, aiReleased, aiSigned };
}

/** Positions where a club has fewer players than the squad template (one entry per missing player). */
export function missingPositions(db: GameDatabase, clubId: ClubId): Position[] {
  const have = new Map<Position, number>();
  const contracted = new Set(db.contracts.filter((c) => c.clubId === clubId).map((c) => c.playerId));
  for (const p of db.players) if (contracted.has(p.id)) have.set(p.primaryPosition, (have.get(p.primaryPosition) ?? 0) + 1);
  const missing: Position[] = [];
  for (const { position } of SQUAD_TEMPLATE) {
    const count = have.get(position) ?? 0;
    if (count > 0) have.set(position, count - 1);
    else missing.push(position);
  }
  return missing;
}

/**
 * Contract warnings when the calendar crosses 1 January or 1 April: the
 * user's players whose contracts end on the coming 30 June.
 */
export function contractWarnings(db: GameDatabase, userClubId: ClubId, previousDate: string, date: string): NewMessage[] {
  const { year } = parseIsoDate(date);
  const checkpoints = [`${year}-01-01`, `${year}-04-01`].filter((d) => previousDate < d && d <= date);
  if (checkpoints.length === 0) return [];
  const ending = db.contracts.filter((c) => c.clubId === userClubId && c.endDate === `${year}-06-30`);
  if (ending.length === 0) return [];
  const names = ending.map((c) => {
    const p = db.players.find((x) => x.id === c.playerId);
    return p ? fullName(p) : c.playerId;
  });
  return [
    {
      date,
      category: 'contract',
      from: 'Director of Football',
      title: `${ending.length} contract${ending.length === 1 ? '' : 's'} expiring in June`,
      body: `${names.join(', ')} will leave on a free transfer at the end of the season unless you offer a new contract.`,
    },
  ];
}
