import { stadiumCapacity } from '@/data/fictional/clubs';
import { isCup, type ClubId, type GameDatabase } from '@/data/schemas';
import type { NewMessage } from '@/game/inbox/inbox';
import { cupWinner } from '@/game/season/cup';
import type { Season } from '@/game/season/season';
import { leagueForSeason } from '@/game/season/season-flow';
import { computeTable } from '@/game/season/table';

/**
 * What a season's results do to a club's standing. Winning builds a club up: a title or a
 * Continental Cup win raises its reputation (which lifts sponsorship, ticket prices and the
 * board's expectations), and its stadium grows to match. A badly underperforming big club
 * slips a little. Stadiums never shrink. Pure: returns a new database.
 */

/** Reputation gained for winning the top division. */
export const TITLE_REPUTATION = 1;
/** Reputation gained for winning the Continental Cup. */
export const CONTINENTAL_REPUTATION = 1;
/** The most a club can gain in one season. */
export const MAX_GAIN = 2;
/** Reputation lost for finishing in the bottom three of the top division when the club is above that league's median. */
export const SLIP_REPUTATION = 1;
export const MAX_REPUTATION = 20;

export type GrowthChange = {
  reasons: string[];
  reputationBefore: number;
  reputationAfter: number;
  capacityBefore: number;
  capacityAfter: number;
};

export type ClubGrowth = { db: GameDatabase; changes: Map<ClubId, GrowthChange> };

export function clubGrowth(db: GameDatabase, season: Season): ClubGrowth {
  const delta = new Map<ClubId, { amount: number; reasons: string[] }>();
  const bump = (id: ClubId, amount: number, reason: string) => {
    const entry = delta.get(id) ?? { amount: 0, reasons: [] };
    entry.amount += amount;
    entry.reasons.push(reason);
    delta.set(id, entry);
  };

  for (const membership of season.leagues) {
    const league = leagueForSeason(db, season, membership.competitionId);
    if (league.tier !== 1) continue;
    const table = computeTable(season.fixtures, league);
    if (table.length === 0 || table.some((row) => row.played === 0)) continue;
    bump(table[0].clubId, TITLE_REPUTATION, `won the ${league.name}`);
    const reps = league.clubIds.map((id) => db.clubs.find((c) => c.id === id)?.reputation ?? 0).sort((a, b) => a - b);
    const median = reps[Math.floor(reps.length / 2)];
    for (const row of table.slice(-3)) {
      const rep = db.clubs.find((c) => c.id === row.clubId)?.reputation ?? 0;
      if (table.length > 6 && rep > median) bump(row.clubId, -SLIP_REPUTATION, `finished in the bottom three of the ${league.name}`);
    }
  }

  for (const cup of season.cups) {
    const competition = db.competitions.find((c) => c.id === cup.competitionId);
    if (!competition || !isCup(competition) || competition.country !== 'INT') continue;
    const winner = cupWinner(season, cup.competitionId);
    if (winner) bump(winner, CONTINENTAL_REPUTATION, `won the ${competition.name}`);
  }

  const changes = new Map<ClubId, GrowthChange>();
  const clubs = db.clubs.map((club) => {
    const entry = delta.get(club.id);
    if (!entry) return club;
    const amount = Math.max(-SLIP_REPUTATION, Math.min(MAX_GAIN, entry.amount));
    const reputation = Math.max(1, Math.min(MAX_REPUTATION, club.reputation + amount));
    if (reputation === club.reputation) return club;
    const capacity = reputation > club.reputation ? Math.max(club.stadium.capacity, stadiumCapacity(club.name, reputation)) : club.stadium.capacity;
    changes.set(club.id, {
      reasons: entry.reasons,
      reputationBefore: club.reputation,
      reputationAfter: reputation,
      capacityBefore: club.stadium.capacity,
      capacityAfter: capacity,
    });
    return { ...club, reputation, stadium: { ...club.stadium, capacity } };
  });

  return { db: { ...db, clubs }, changes };
}

const number = (n: number) => n.toLocaleString('en-GB');

/** The chairman's note when the user's club moves up (or down) in standing. */
export function growthMessage(change: GrowthChange | undefined, clubName: string, seasonLabel: string, date: string): NewMessage | null {
  if (!change) return null;
  const up = change.reputationAfter > change.reputationBefore;
  const reasons = change.reasons.join(' and ');
  const stadium =
    change.capacityAfter > change.capacityBefore
      ? ` The stadium is being extended from ${number(change.capacityBefore)} to ${number(change.capacityAfter)} seats.`
      : '';
  return {
    date,
    category: 'transfer',
    from: 'Chairman',
    title: up ? `${clubName} are growing` : `${clubName}'s standing has slipped`,
    body: up
      ? `After ${seasonLabel}, in which we ${reasons}, ${clubName}'s reputation has risen from ${change.reputationBefore} to ${change.reputationAfter}. Sponsors and supporters are noticing, and the board's expectations will rise with it.${stadium}`
      : `After ${seasonLabel}, in which we ${reasons}, ${clubName}'s reputation has fallen from ${change.reputationBefore} to ${change.reputationAfter}. The board expects better.`,
  };
}
