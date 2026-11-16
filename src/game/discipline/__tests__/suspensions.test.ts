import { buildFictionalDatabase } from '@/data/fictional';
import { aiSetup, aiSetupOn } from '@/game/ai/opponent';
import { withoutUnavailable } from '@/game/condition/squad-care';
import { emptyConditions } from '@/game/condition/condition';
import { autoPickLineup, starterIds, validateLineup } from '@/game/lineup';
import type { Fixture, FixtureCard, Season } from '@/game/season/season';
import { buildFixtureInput, createSeason } from '@/game/season/season-flow';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';
import { addDays } from '@/utils/date';

import {
  activeBans,
  bansFrom,
  disciplineMessages,
  leagueYellows,
  selectDiscipline,
  suspendedFor,
} from '../suspensions';

/**
 * A hand-made season: clubs A and B meet in a league every Saturday
 * (38 matchdays, from 1 Aug) and in the cup on the Wednesday after matchday 1. Results
 * are filled in per test, so each rule can be checked in isolation.
 */
const LEAGUE = 'comp_league';
const CUP = 'comp_cup';
const P = 'plr_1';

const saturday = (md: number) => addDays('2026-08-01', 7 * (md - 1));

function baseSeason(): Season {
  const league: Fixture[] = Array.from({ length: 38 }, (_, i) => ({
    id: `fx_l${i + 1}`,
    competitionId: LEAGUE,
    matchday: i + 1,
    date: saturday(i + 1),
    homeId: i % 2 ? 'club_b' : 'club_a',
    awayId: i % 2 ? 'club_a' : 'club_b',
    result: null,
  }));
  const cup: Fixture = { id: 'fx_c1', competitionId: CUP, matchday: 1, date: '2026-08-05', homeId: 'club_a', awayId: 'club_b', result: null };
  return {
    label: '2026/27',
    startYear: 2026,
    seed: 1,
    leagues: [{ competitionId: LEAGUE, clubIds: ['club_a', 'club_b'] }],
    cupId: CUP,
    fixtures: [...league, cup],
    playerStats: [],
  };
}

/** Plays fixtures (no goals) with the given cards for club A's player(s): fixture id → cards. */
function played(season: Season, results: Record<string, FixtureCard['card'][] | FixtureCard[]>): Season {
  return {
    ...season,
    fixtures: season.fixtures.map((f) => {
      if (!(f.id in results)) return f;
      const side = f.homeId === 'club_a' ? 'home' : 'away';
      const cards = results[f.id].map((c, i): FixtureCard => (typeof c === 'string' ? { minute: 10 + i, side, playerId: P, card: c } : c));
      return { ...f, result: { score: { home: 0, away: 0 }, goals: [], cards, playerOfTheMatch: null } };
    }),
  };
}

const fixture = (season: Season, id: string) => season.fixtures.find((f) => f.id === id)!;
const bannedFrom = (season: Season, id: string) => suspendedFor(season, fixture(season, id)).has(P);

describe('suspensions', () => {
  it('a second yellow bans the player from the next league match only', () => {
    const s = played(baseSeason(), { fx_l1: ['yellow', 'second-yellow'] });
    expect(bannedFrom(s, 'fx_l2')).toBe(true);
    expect(bannedFrom(s, 'fx_l3')).toBe(false);
    // Served in the same competition: the cup tie in between doesn't count, and he can play it.
    expect(bannedFrom(s, 'fx_c1')).toBe(false);
    expect(bansFrom(s, 'fx_l1')).toMatchObject([{ reason: 'second-yellow', matches: 1, remaining: 1, clubId: 'club_a' }]);
  });

  it('a straight red bans him for three matches, counting down as they are played', () => {
    let s = played(baseSeason(), { fx_l1: ['red'] });
    expect(['fx_l2', 'fx_l3', 'fx_l4', 'fx_l5'].map((id) => bannedFrom(s, id))).toEqual([true, true, true, false]);
    expect(activeBans(s, P)[0].remaining).toBe(3);
    s = played(s, { fx_l2: [], fx_l3: [] });
    expect(activeBans(s, P)[0].remaining).toBe(1);
    s = played(s, { fx_l4: [] });
    expect(activeBans(s, P)).toEqual([]);
  });

  it('a red in the cup is served in the cup, not the league', () => {
    const s = played(baseSeason(), { fx_c1: ['red'] });
    expect(bannedFrom(s, 'fx_l2')).toBe(false);
    // The next cup round hasn't been drawn: the ban is still waiting to be served.
    expect(activeBans(s, P)).toMatchObject([{ competitionId: CUP, remaining: 3 }]);
  });

  it('a fifth league yellow by the halfway matchday is a one-match ban', () => {
    const s = played(baseSeason(), { fx_l1: ['yellow'], fx_l2: ['yellow'], fx_l3: ['yellow'], fx_l4: ['yellow'] });
    expect(leagueYellows(s, P, LEAGUE)).toBe(4);
    expect(bannedFrom(s, 'fx_l5')).toBe(false);
    const fifth = played(s, { fx_l5: ['yellow'] });
    expect(bansFrom(fifth, 'fx_l5')).toMatchObject([{ reason: 'yellows', matches: 1 }]);
    expect(bannedFrom(fifth, 'fx_l6')).toBe(true);
    expect(bannedFrom(fifth, 'fx_l7')).toBe(false);
  });

  it('a fifth yellow after matchday 19 is no ban; a tenth by matchday 32 is a two-match ban', () => {
    const yellowOn = (matchdays: number[]) => Object.fromEntries(matchdays.map((md) => [`fx_l${md}`, ['yellow' as const]]));
    const late = played(baseSeason(), yellowOn([2, 4, 6, 8, 20]));
    expect(bansFrom(late, 'fx_l20')).toEqual([]);
    expect(bannedFrom(late, 'fx_l21')).toBe(false);

    const tenth = played(baseSeason(), yellowOn([1, 2, 3, 4, 5, 10, 12, 14, 16, 30]));
    expect(bansFrom(tenth, 'fx_l5')).toMatchObject([{ reason: 'yellows', yellows: 5, matches: 1 }]);
    expect(bansFrom(tenth, 'fx_l30')).toMatchObject([{ reason: 'yellows', yellows: 10, matches: 2 }]);
    expect(['fx_l31', 'fx_l32', 'fx_l33'].map((id) => bannedFrom(tenth, id))).toEqual([true, true, false]);

    const tooLate = played(baseSeason(), yellowOn([1, 2, 3, 4, 5, 10, 12, 14, 16, 33]));
    expect(bansFrom(tooLate, 'fx_l33')).toEqual([]);
  });

  it("yellows in a match he was sent off in don't count towards accumulation, and cup yellows never do", () => {
    const s = played(baseSeason(), { fx_l1: ['yellow', 'second-yellow'], fx_c1: ['yellow'] });
    expect(leagueYellows(s, P, LEAGUE)).toBe(0);
    expect(leagueYellows(s, P, CUP)).toBe(0);
  });

  it('overlapping bans are served one after the other', () => {
    // Synthetic: he plays the match after a sending-off (the rules would stop him) and is sent off again.
    const s = played(baseSeason(), { fx_l1: ['yellow', 'second-yellow'], fx_l2: ['red'] });
    expect(['fx_l3', 'fx_l4', 'fx_l5', 'fx_l6'].map((id) => bannedFrom(s, id))).toEqual([true, true, true, false]);
    // 1 match (fx_l2, already played) + 3 queued after it (fx_l3–l5).
    expect(bannedFrom(s, 'fx_l2')).toBe(true);
  });

  it('only bans players of the right fixture date and competition, and never mutates the season', () => {
    const s = played(baseSeason(), { fx_l1: ['red'] });
    const copy = JSON.stringify(s);
    expect(suspendedFor(s, null).size).toBe(0);
    expect(suspendedFor(s, fixture(s, 'fx_l1')).size).toBe(0);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe('discipline in the game', () => {
  const db = buildFictionalDatabase();
  const clubId = db.clubs[0].id;
  const squad = selectSquadCandidates(db, clubId);
  const lineup = autoPickLineup(squad, '4-4-2');
  const starter = starterIds(lineup)[0];

  it('blocks a lineup with a suspended player and leaves him out of auto-replaced lineups', () => {
    const availability = { isInjured: () => false, fitnessOf: () => 100, isSuspended: (id: string) => id === starter };
    expect(validateLineup(lineup, squad, availability)).toContainEqual(expect.objectContaining({ code: 'suspended', severity: 'error', playerId: starter }));
    const fixed = withoutUnavailable(db, clubId, lineup, emptyConditions('2026-08-01'), new Set([starter]));
    expect(starterIds(fixed)).not.toContain(starter);
    expect(validateLineup(fixed, squad, availability).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('AI clubs leave suspended players out', () => {
    const best = aiSetup(db, clubId);
    const banned = starterIds(best.lineup)[3];
    const setup = aiSetupOn(db, clubId, undefined, new Set([banned]));
    expect([...starterIds(setup.lineup), ...setup.lineup.substitutes]).not.toContain(banned);
    expect(aiSetupOn(db, clubId, undefined, new Set())).toBe(best);
  });

  it("refuses to play the user's fixture with a suspended player", () => {
    const season = createSeason(db, 2026, 99);
    const first = season.fixtures.find((f) => f.matchday === 1 && (f.homeId === clubId || f.awayId === clubId) && f.competitionId !== season.cupId)!;
    // A straight red in a (made-up) earlier league fixture of the same competition.
    const earlier: Fixture = {
      ...first,
      id: 'fx_earlier',
      date: '2026-08-01',
      result: {
        score: { home: 0, away: 0 },
        goals: [],
        cards: [{ minute: 5, side: first.homeId === clubId ? 'home' : 'away', playerId: starter, card: 'red' }],
        playerOfTheMatch: null,
      },
    };
    const withRed: Season = { ...season, fixtures: [earlier, ...season.fixtures] };
    expect(suspendedFor(withRed, first).has(starter)).toBe(true);
    expect(() => buildFixtureInput(db, withRed, first, { clubId, lineup, tactics: DEFAULT_TACTICS })).toThrow(/suspended/);
    expect(() => buildFixtureInput(db, season, first, { clubId, lineup, tactics: DEFAULT_TACTICS })).not.toThrow();

    // Profile and inbox views.
    expect(selectDiscipline(db, withRed, starter).bans).toEqual(['Suspended for the next 3 league matches (straight red card)']);
    const messages = disciplineMessages(db, withRed, earlier, clubId, '2026-08-01');
    expect(messages).toHaveLength(1);
    expect(messages[0].title).toMatch(/suspended$/);
    expect(messages[0].body).toMatch(/straight red card .* misses the next 3 league matches/);
  });

  it('warns when a player is one league booking from a ban', () => {
    const season = createSeason(db, 2026, 99);
    const mine = season.fixtures.filter((f) => f.competitionId !== season.cupId && (f.homeId === clubId || f.awayId === clubId)).slice(0, 4);
    const booked = mine.map((f) => ({
      ...f,
      result: {
        score: { home: 0, away: 0 },
        goals: [],
        cards: [{ minute: 5, side: f.homeId === clubId ? ('home' as const) : ('away' as const), playerId: starter, card: 'yellow' as const }],
        playerOfTheMatch: null,
      },
    }));
    const ids = new Set(booked.map((f) => f.id));
    const s: Season = { ...season, fixtures: [...booked, ...season.fixtures.filter((f) => !ids.has(f.id))] };
    const messages = disciplineMessages(db, s, booked[3], clubId, booked[3].date);
    expect(messages.map((m) => m.title)).toEqual([expect.stringMatching(/one booking from a ban$/)]);
    expect(selectDiscipline(db, s, starter).leagueYellows).toEqual({ count: 4, next: { untilBan: 1, byMatchday: 19, matches: 1 } });
  });
});
