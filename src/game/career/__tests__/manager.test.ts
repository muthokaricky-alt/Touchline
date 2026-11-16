import { buildFictionalDatabase } from '@/data/fictional';
import { createRng } from '@/utils/random';
import { createSeason, playRemaining } from '@/game/season/season-flow';

import { afterUserMatchday, closeSeason, seasonEnd } from '../career-flow';
import { boardMood, selectBoardView, selectCareerChoices } from '../career-view';
import {
  boardExpectation,
  boardVerdict,
  confidenceAfterMatch,
  expectedPointsPerGame,
  jobOffers,
  ManagerSchema,
  newManager,
  SACK_THRESHOLD,
  seasonReview,
  startingReputation,
  WARNING_THRESHOLD,
  type Manager,
} from '../manager';

const db = buildFictionalDatabase();
const season = createSeason(db, 2026, 3);
const byRep = [...db.clubs].sort((a, b) => b.reputation - a.reputation);
const FIRST = season.leagues.find((l) => l.competitionId === 'comp_first_division')!;
const firstDivisionByRep = byRep.filter((c) => FIRST.clubIds.includes(c.id));

describe('board expectations', () => {
  it('the biggest club must win the league, the smallest avoid relegation', () => {
    expect(boardExpectation(db, season, firstDivisionByRep[0].id)).toMatchObject({ target: 1, label: 'Win the league', tier: 1 });
    expect(boardExpectation(db, season, firstDivisionByRep.at(-1)!.id)).toMatchObject({ target: 17, label: 'Avoid relegation' });
  });

  it('second-division giants are expected to go up', () => {
    const secondDivision = db.competitions.find((c) => c.id === 'comp_second_division');
    const second = byRep.find((c) => secondDivision && 'clubIds' in secondDivision && secondDivision.clubIds.includes(c.id))!;
    expect(boardExpectation(db, season, second.id)).toMatchObject({ tier: 2, label: 'Win promotion', target: 3 });
  });

  it('expected points fall with the target', () => {
    expect(expectedPointsPerGame(1)).toBeGreaterThan(2.2);
    expect(expectedPointsPerGame(17)).toBeLessThan(1.2);
  });
});

describe('board confidence', () => {
  it('wins raise it, defeats lower it, more so when much is expected', () => {
    expect(confidenceAfterMatch(60, 3, 10)).toBeGreaterThan(60);
    expect(confidenceAfterMatch(60, 0, 10)).toBeLessThan(60);
    expect(60 - confidenceAfterMatch(60, 0, 1)).toBeGreaterThan(60 - confidenceAfterMatch(60, 0, 17));
  });

  /** Simulates many seasons of results at a given points-per-game for a target, returns the share sacked. */
  function sackRate(ppg: number, target: number): number {
    const rng = createRng(7);
    let sacked = 0;
    const runs = 400;
    for (let run = 0; run < runs; run++) {
      let m: Manager = newManager('Test', 12);
      for (let game = 1; game <= 38; game++) {
        const roll = rng.next();
        // Results with the right average: win/draw/loss mix for the ppg.
        const winP = Math.max(0, Math.min(1, (ppg - 0.75) / 2.25 + 0.15));
        const drawP = 0.25;
        const points = roll < winP ? 3 : roll < winP + drawP ? 1 : 0;
        m = { ...m, confidence: confidenceAfterMatch(m.confidence, points, target) };
        const verdict = boardVerdict(m, game);
        if (verdict.kind === 'warning') m = { ...m, warned: true };
        if (verdict.kind === 'sacked') {
          sacked++;
          break;
        }
      }
    }
    return sacked / runs;
  }

  it('rarely sacks a manager meeting expectations, usually one far below them', () => {
    const onTarget = sackRate(expectedPointsPerGame(10), 10);
    const farBelow = sackRate(expectedPointsPerGame(10) - 0.8, 10);
    console.log(`Sacked within a season: on target ${(onTarget * 100).toFixed(1)}%, 0.8 ppg below ${(farBelow * 100).toFixed(1)}%`);
    expect(onTarget).toBeLessThan(0.05);
    expect(farBelow).toBeGreaterThan(0.4);
  });

  it('warns once before sacking, and gives a new season a grace period', () => {
    const low: Manager = { ...newManager('Test', 12), confidence: WARNING_THRESHOLD - 1 };
    expect(boardVerdict(low, 3)).toEqual({ kind: 'warning' });
    expect(boardVerdict({ ...low, warned: true }, 3)).toEqual({ kind: 'fine' });
    const awful = { ...low, confidence: SACK_THRESHOLD - 1, warned: true };
    expect(boardVerdict(awful, 3)).toEqual({ kind: 'fine' }); // too early in the season
    expect(boardVerdict(awful, 10)).toEqual({ kind: 'sacked' });
  });
});

describe('matchdays, season end and job offers', () => {
  const club = firstDivisionByRep[0].id; // must win the league
  const finished = playRemaining(db, season).season;

  it('a sacking comes with at least one job offer and is recorded', () => {
    const doomed: Manager = { ...newManager('Test', 16), confidence: 2, warned: true };
    // No new results (before = after): confidence stays at 2, well past the grace period → sacked.
    const update = afterUserMatchday(db, finished, finished, club, doomed, '2027-05-30');
    expect(update.manager.sackedOffers?.length).toBeGreaterThanOrEqual(1);
    expect(update.manager.sackedOffers).not.toContain(club);
    expect(update.manager.history.at(-1)).toMatchObject({ clubId: club, outcome: 'sacked', finished: null });
    expect(update.messages[0].title).toMatch(/sacked/);
    expect(ManagerSchema.safeParse(update.manager).success).toBe(true);
  });

  it('reviews a completed season and offers jobs deterministically', () => {
    const manager = newManager('Test', 16);
    const end = seasonEnd(db, finished, club, manager)!;
    expect(end.review.finished).toBeGreaterThanOrEqual(1);
    expect(seasonEnd(db, finished, club, manager)).toEqual(end);
    expect(end.offers).not.toContain(club);
  });

  it('closing a season updates reputation and history, staying or moving', () => {
    const manager = newManager('Test', 16);
    const end = seasonEnd(db, finished, club, manager)!;
    if (end.review.sacked) return; // covered above
    const stay = closeSeason(db, finished, club, manager, null, '2027-07-01');
    expect(stay.clubId).toBe(club);
    expect(stay.manager.history.at(-1)).toMatchObject({ clubId: club, outcome: 'completed', finished: end.review.finished });
    expect(() => closeSeason(db, finished, club, manager, 'club_nowhere', '2027-07-01')).toThrow(/offered/);
    if (end.offers.length) {
      const move = closeSeason(db, finished, club, manager, end.offers[0], '2027-07-01');
      expect(move.clubId).toBe(end.offers[0]);
      expect(move.manager.history.at(-1)!.outcome).toBe('left');
      expect(move.messages[0].title).toMatch(/new manager/);
    }
  });

  it('review: beating the target raises reputation', () => {
    const smallest = firstDivisionByRep.at(-1)!.id;
    const review = seasonReview(db, finished, smallest, 60)!;
    expect(Math.sign(review.reputationChange)).toBe(review.margin > 0 ? 1 : review.margin < 0 ? -1 : Math.sign(review.reputationChange));
  });
});

describe('helpers', () => {
  it('starting reputation scales with the club', () => {
    expect(startingReputation(16)).toBeGreaterThan(startingReputation(9));
    expect(newManager('  Alex Kamau ', 12).name).toBe('Alex Kamau');
  });

  it('a better reputation brings offers from bigger clubs', () => {
    const avgRep = (rep: number) => {
      const offers = Array.from({ length: 30 }, (_, i) => jobOffers(db, rep, 'club_greywater_town', i, true)).flat();
      return offers.reduce((s, id) => s + db.clubs.find((c) => c.id === id)!.reputation, 0) / offers.length;
    };
    expect(avgRep(90)).toBeGreaterThan(avgRep(30));
  });
});

describe('career views', () => {
  it('lists every league club (England first), biggest first, with what the board expects', () => {
    const leagues = selectCareerChoices(db, season);
    expect(leagues.slice(0, 2).map((l) => l.leagueName)).toEqual(['First Division', 'Second Division']);
    expect(leagues.flatMap((l) => l.clubs)).toHaveLength(40 + 5 * 18);
    expect(leagues[0].clubs[0].expectation).toBe('Win the league');
    expect(leagues[0].clubs[0].reputation).toBeGreaterThanOrEqual(leagues[0].clubs.at(-1)!.reputation);
  });

  it('shows the board mood from confidence and the offers after a sacking', () => {
    expect(boardMood(80).label).toBe('Delighted');
    expect(boardMood(10).tone).toBe('danger');
    const manager = { ...newManager('Alex', 12), sackedOffers: ['club_kestrel_bay'] };
    const view = selectBoardView(db, season, 'club_greywater_town', manager);
    expect(view.sackedOffers?.[0]).toMatchObject({ clubId: 'club_kestrel_bay', name: 'Kestrel Bay' });
  });
});

describe('careers abroad', () => {
  const kenya = season.leagues.find((l) => l.competitionId === 'comp_kenya_premier')!;
  // The board ranks by reputation, ties by club id.
  const kenyaByRep = byRep.filter((c) => kenya.clubIds.includes(c.id)).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));

  it('scales targets to an 18-club league; with no relegation the smallest must stay out of the bottom three', () => {
    expect(boardExpectation(db, season, kenyaByRep[0].id)).toMatchObject({ target: 1, label: 'Win the league' });
    expect(boardExpectation(db, season, kenyaByRep[8].id)).toMatchObject({ target: 9, label: 'Finish in the top half' });
    expect(boardExpectation(db, season, kenyaByRep.at(-1)!.id)).toMatchObject({ target: 15, label: 'Stay out of the bottom three' });
    // England's 20-club targets are unchanged (top half 10, mid-table 14, safety 17th).
    const firstRanked = [...firstDivisionByRep].sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
    expect(boardExpectation(db, season, firstRanked[9].id)).toMatchObject({ target: 10 });
    expect(boardExpectation(db, season, firstRanked[13].id)).toMatchObject({ target: 14 });
  });

  it('offers come from league clubs at home and abroad, home clubs about twice as likely; background clubs never offer', () => {
    const inLeague = new Set(season.leagues.flatMap((l) => l.clubIds));
    const country = new Map(db.clubs.map((c) => [c.id, c.country]));
    const offers = Array.from({ length: 600 }, (_, i) => jobOffers(db, 55, 'club_greywater_town', i, false)).flat();
    expect(offers.every((id) => inLeague.has(id))).toBe(true);
    const homeShare = offers.filter((id) => country.get(id) === 'ENG').length / offers.length;
    expect(offers.some((id) => country.get(id) !== 'ENG')).toBe(true);
    // Candidates are ~1/4 English (40 of 130 league clubs at similar spreads): doubled weight lifts that well above a quarter.
    expect(homeShare).toBeGreaterThan(0.33);
    expect(homeShare).toBeLessThan(0.6);
  });

  it('offers a new manager every league, England first, each with its country', () => {
    const choices = selectCareerChoices(db, season);
    expect(choices.map((c) => c.countryName)).toEqual(['England', 'England', 'Kenya', 'France', 'Germany', 'Italy', 'Spain']);
    expect(choices.find((c) => c.country === 'KEN')!.clubs.map((c) => c.name)).toContain('Chapati FC');
  });
});
