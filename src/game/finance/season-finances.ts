import { ALL_FICTIONAL_CLUBS, BACKGROUND_CLUBS, FOREIGN_LEAGUE_CLUBS } from '@/data/fictional/clubs';
import { isCup, type ClubId, type GameDatabase } from '@/data/schemas';
import type { NewMessage } from '@/game/inbox/inbox';
import { cupFixtures, cupTotalRounds, cupWinner, seasonCup } from '@/game/season/cup';
import { GROUP_MATCHDAYS, twoLegStage } from '@/game/season/continental';
import type { Season } from '@/game/season/season';
import { leagueForSeason } from '@/game/season/season-flow';
import { computeTable } from '@/game/season/table';

/**
 * End-of-season money. When a season closes every club earns league prize
 * money, cup prize money, gate income and sponsorship. The board keeps most
 * of it for running costs (the game has no wage bill yet) and adds the rest
 * to the balance and the transfer budget. Pure: returns a new database.
 *
 * Every number below is a tuning knob.
 */

/** League prize for a champion of the baseline country (Kenya), top division. */
export const LEAGUE_PRIZE_WINNER = 10_000_000;
/** Cup prize for the winner of the baseline country's cup. */
export const CUP_PRIZE_WINNER = 1_000_000;
/** Last place earns this share of the champion's prize; shares fall in a straight line. */
export const LAST_PLACE_SHARE = 0.05;
/** Earliest cup exit earns this share of the winner's prize. */
export const CUP_EXIT_SHARE = 0.04;
/** Each division below the top pays this fraction of the one above. */
export const TIER_FACTOR = 0.25;
/** How strongly real-world wealth gaps between countries show up in the game (0 = every country pays the same). */
export const WEALTH_EXPONENT = 0.1;
/** Share of the season's earnings that reaches the balance and transfer budget. */
export const BOARD_SHARE = 0.4;
/** A club's transfer budget can't grow past this multiple of its starting budget. */
export const BUDGET_CAP_MULTIPLE = 4;
/** Share of the stadium that fills on an average matchday. */
export const ATTENDANCE = 0.6;
/** Ticket price in euros per point of reputation. */
export const TICKET_PRICE_PER_REPUTATION = 1.2;
/** Sponsorship per season is reputation² times this. */
export const SPONSORSHIP_PER_REPUTATION_SQUARED = 25_000;

/** Continental Cup money, in the style of the Champions League: a fee for taking part, a bonus per group win and draw, then a bonus for each knockout stage reached. */
export const CONTINENTAL_PARTICIPATION = 1_000_000;
export const CONTINENTAL_GROUP_WIN = 300_000;
export const CONTINENTAL_GROUP_DRAW = 100_000;
/** Paid on reaching the Round of 16, quarter-finals, semi-finals and final. */
export const CONTINENTAL_STAGE_BONUS = [1_000_000, 1_500_000, 2_500_000, 3_000_000] as const;
export const CONTINENTAL_WINNER_BONUS = 4_000_000;
/** The four richest leagues: their clubs get the plain amounts. */
export const CONTINENTAL_BIG_LEAGUES: readonly string[] = ['ENG', 'ESP', 'GER', 'ITA'];
/** Clubs from every other country get this multiple, so the less prestigious leagues earn more from the competition. */
export const CONTINENTAL_UNDERDOG_MULTIPLIER = 1.5;

/** Approximate champion payout in the real league (euros); Kenya is the baseline. */
export const COUNTRY_WEALTH: Readonly<Record<string, number>> = {
  ENG: 215_000_000,
  ESP: 157_000_000,
  GER: 83_000_000,
  ITA: 82_000_000,
  POR: 35_000_000,
  FRA: 30_000_000,
  NED: 15_000_000,
  NGA: 680_000,
  GHA: 260_000,
  TZA: 240_000,
  KEN: 100_000,
  UGA: 50_000,
};
const BASELINE_COUNTRY = 'KEN';

/** How much more (or less) than Kenya a country's prizes are worth, after compression. */
export function wealthFactor(country: string): number {
  const real = COUNTRY_WEALTH[country];
  if (!real) return 1;
  return (real / COUNTRY_WEALTH[BASELINE_COUNTRY]) ** WEALTH_EXPONENT;
}

/** Share of the champion's prize for a finishing position: 100% for 1st, falling in a line to LAST_PLACE_SHARE. */
export function positionShare(position: number, clubCount: number): number {
  if (clubCount <= 1) return 1;
  return 1 - (1 - LAST_PLACE_SHARE) * ((position - 1) / (clubCount - 1));
}

export type FinanceLine = {
  leagueName: string;
  position: number;
  leaguePrize: number;
  cupName: string | null;
  cupResult: string | null;
  cupPrize: number;
  continentalResult: string | null;
  continentalPrize: number;
  matchday: number;
  sponsorship: number;
  /** Everything the club earned. */
  total: number;
  /** What reached the balance and transfer budget. */
  toBudget: number;
};

export type SeasonFinances = { db: GameDatabase; lines: Map<ClubId, FinanceLine> };

const STARTING_BUDGET = new Map<string, number>(
  [...ALL_FICTIONAL_CLUBS, ...FOREIGN_LEAGUE_CLUBS, ...BACKGROUND_CLUBS].map((c) => [c.id, c.finances.transferBudget]),
);

export function seasonFinances(db: GameDatabase, season: Season): SeasonFinances {
  const clubs = new Map(db.clubs.map((c) => [c.id, c]));
  const lines = new Map<ClubId, FinanceLine>();
  const draft = new Map<ClubId, Pick<FinanceLine, 'leagueName' | 'position' | 'leaguePrize' | 'cupName' | 'cupResult' | 'cupPrize' | 'continentalResult' | 'continentalPrize'>>();

  // League prizes: by finishing position, scaled by the country's wealth and the division.
  for (const membership of season.leagues) {
    const league = leagueForSeason(db, season, membership.competitionId);
    const table = computeTable(season.fixtures, league);
    const prize = LEAGUE_PRIZE_WINNER * wealthFactor(league.country) * TIER_FACTOR ** (league.tier - 1);
    for (const row of table) {
      draft.set(row.clubId, {
        leagueName: league.name,
        position: row.position,
        leaguePrize: Math.round(prize * positionShare(row.position, table.length)),
        cupName: null,
        cupResult: null,
        cupPrize: 0,
        continentalResult: null,
        continentalPrize: 0,
      });
    }
  }

  // Cup prizes: national cups only, by how far the club got.
  for (const cup of season.cups) {
    const competition = db.competitions.find((c) => c.id === cup.competitionId);
    if (!competition || !isCup(competition)) continue;
    if (competition.country === 'INT') {
      addContinental(season, cup.competitionId, draft, (id) => clubs.get(id)?.country ?? '');
      continue;
    }
    const fixtures = cupFixtures(season, cup.competitionId).filter((f) => f.result);
    if (fixtures.length === 0) continue;
    const total = cupTotalRounds(season, cup.competitionId);
    const winner = cupWinner(season, cup.competitionId);
    const prize = CUP_PRIZE_WINNER * Math.sqrt(wealthFactor(competition.country));
    const reached = new Map<ClubId, number>();
    for (const f of fixtures) {
      for (const id of [f.homeId, f.awayId]) reached.set(id, Math.max(reached.get(id) ?? 0, f.matchday));
    }
    for (const [clubId, round] of reached) {
      const won = clubId === winner;
      const share = won ? 1 : CUP_EXIT_SHARE + (1 - CUP_EXIT_SHARE) * ((round - 1) / Math.max(1, total));
      const entry = draft.get(clubId);
      if (!entry) continue;
      entry.cupName = competition.name;
      entry.cupResult = won ? 'Winners' : round >= total ? 'Runners-up' : `Out in round ${round}`;
      entry.cupPrize = Math.round(prize * share);
    }
  }

  // Gate income: home matches played this season.
  const homeGames = new Map<ClubId, number>();
  for (const f of season.fixtures) {
    if (f.result) homeGames.set(f.homeId, (homeGames.get(f.homeId) ?? 0) + 1);
  }

  const updated = db.clubs.map((club) => {
    const entry = draft.get(club.id);
    if (!entry) return club;
    const matchday = Math.round((homeGames.get(club.id) ?? 0) * club.stadium.capacity * ATTENDANCE * club.reputation * TICKET_PRICE_PER_REPUTATION);
    const sponsorship = club.reputation * club.reputation * SPONSORSHIP_PER_REPUTATION_SQUARED;
    const total = entry.leaguePrize + entry.cupPrize + entry.continentalPrize + matchday + sponsorship;
    const toBudget = Math.round(total * BOARD_SHARE);
    lines.set(club.id, { ...entry, matchday, sponsorship, total, toBudget });

    const start = STARTING_BUDGET.get(club.id) ?? club.finances.transferBudget;
    const cap = Math.max(club.finances.transferBudget, start * BUDGET_CAP_MULTIPLE);
    return {
      ...club,
      finances: {
        ...club.finances,
        balance: club.finances.balance + toBudget,
        transferBudget: Math.min(cap, club.finances.transferBudget + toBudget),
      },
    };
  });

  return { db: { ...db, clubs: updated }, lines };
}

type Draft = Map<ClubId, { continentalResult: string | null; continentalPrize: number }>;

/** Continental Cup prize money: group-stage fees and results, then each knockout stage reached. */
function addContinental(season: Season, cupId: string, draft: Draft, countryOf: (id: ClubId) => string): void {
  const cup = seasonCup(season, cupId);
  const fixtures = cupFixtures(season, cupId);
  if (!cup || !fixtures.some((f) => f.result)) return;
  const winner = cupWinner(season, cupId);
  // Which knockout stage a round is: 0 = Round of 16 … 3 = final.
  const stageOf = (round: number) => (cup.twoLegged ? twoLegStage(round)?.stage ?? 0 : round - GROUP_MATCHDAYS - 1);

  const money = new Map<ClubId, number>();
  const best = new Map<ClubId, number>(); // best knockout stage reached, -1 = groups only
  const add = (id: ClubId, amount: number) => money.set(id, (money.get(id) ?? 0) + amount);
  for (const f of fixtures) {
    for (const id of [f.homeId, f.awayId]) {
      if (!money.has(id)) add(id, CONTINENTAL_PARTICIPATION);
      if (!best.has(id)) best.set(id, -1);
    }
    if (!f.result) continue;
    const { home, away } = f.result.score;
    if (f.matchday <= GROUP_MATCHDAYS) {
      if (home === away) {
        add(f.homeId, CONTINENTAL_GROUP_DRAW);
        add(f.awayId, CONTINENTAL_GROUP_DRAW);
      } else {
        add(home > away ? f.homeId : f.awayId, CONTINENTAL_GROUP_WIN);
      }
    } else {
      const stage = stageOf(f.matchday);
      for (const id of [f.homeId, f.awayId]) best.set(id, Math.max(best.get(id) ?? -1, stage));
    }
  }

  const stageNames = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];
  for (const [id, stage] of best) {
    let prize = money.get(id) ?? 0;
    for (let k = 0; k <= stage; k++) prize += CONTINENTAL_STAGE_BONUS[k] ?? 0;
    const won = id === winner;
    if (won) prize += CONTINENTAL_WINNER_BONUS;
    const factor = CONTINENTAL_BIG_LEAGUES.includes(countryOf(id)) ? 1 : CONTINENTAL_UNDERDOG_MULTIPLIER;
    const entry = draft.get(id);
    if (!entry) continue;
    entry.continentalPrize = Math.round(prize * factor);
    entry.continentalResult = won ? 'Winners' : stage < 0 ? 'Group stage' : stage >= 3 ? 'Runners-up' : `Out in the ${stageNames[stage]}`;
  }
}

const money = (n: number) => (n >= 1_000_000 ? `€${(n / 1_000_000).toFixed(1)}M` : `€${Math.round(n / 1000)}K`);
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;

/** The chairman's note about the season's money, for the user's club (null when the club earned nothing). */
export function financeMessage(line: FinanceLine | undefined, seasonLabel: string, date: string): NewMessage | null {
  if (!line) return null;
  const rows = [
    `League (${ordinal(line.position)} in the ${line.leagueName}): ${money(line.leaguePrize)}`,
    line.cupName ? `${line.cupName} (${line.cupResult}): ${money(line.cupPrize)}` : null,
    line.continentalResult ? `Continental Cup (${line.continentalResult}): ${money(line.continentalPrize)}` : null,
    `Matchday income: ${money(line.matchday)}`,
    `Sponsorship: ${money(line.sponsorship)}`,
  ].filter(Boolean);
  return {
    date,
    category: 'transfer',
    from: 'Chairman',
    title: `${seasonLabel} season finances`,
    body:
      `The season's books are closed. We earned ${money(line.total)} in all:\n\n${rows.join('\n')}\n\n` +
      `The board keeps most of it for running costs. ${money(line.toBudget)} has been added to our balance and transfer budget.`,
  };
}
