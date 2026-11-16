import { buildFictionalDatabase } from '@/data/fictional';
import { domesticWorld } from '@/data/fictional/__fixtures__/domestic';
import { autoPickLineup } from '@/game/lineup';
import { nextCupRound } from '@/game/season/cup';
import type { Season } from '@/game/season/season';
import { createSeason, isSeasonComplete, nextFixtureFor, playRemaining } from '@/game/season/season-flow';
import { addDays } from '@/utils/date';
import { playUserFixture } from '@/game/season/__fixtures__/play';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { addMessages } from '@/game/inbox/inbox';

import { buildDashboardSummary, INBOX_PREVIEW } from '../build-dashboard-summary';
import { previewDashboard } from '../dashboard.preview';

// England only: these tests play whole seasons, and the dashboard only shows the user's own competitions.
const db = domesticWorld(buildFictionalDatabase());
const CLUB = 'club_greywater_town';
const user = { clubId: CLUB, lineup: autoPickLineup(selectSquadCandidates(db, CLUB), '4-4-2'), tactics: DEFAULT_TACTICS };
const fresh = createSeason(db, 2026, 5);

describe('buildDashboardSummary: pre-season', () => {
  const summary = buildDashboardSummary(db, CLUB, fresh, '2026-07-01', [], previewDashboard);

  it('uses the real club, league and season', () => {
    expect(summary.club).toEqual({ id: CLUB, name: 'Greywater Town', shortName: 'GRW', leagueName: 'First Division' });
    expect(summary.season).toEqual({ label: '2026/27', currentDate: 'Wed 1 Jul 2026', matchday: 1, totalMatchdays: 38 });
  });

  it('shows the first fixture with no table position yet', () => {
    expect(summary.nextMatch!.date).toBe('Sat 8 Aug');
    expect(summary.nextMatch!.competition).toBe('First Division');
    expect(summary.nextMatch!.opponentPosition).toBeNull();
    expect(summary.form).toEqual([]);
    expect(summary.seasonEnd).toBeNull();
    expect(summary.awaitingSeasonEnd).toBe(false);
  });

  it('lists all 20 league clubs with zero points', () => {
    expect(summary.table).toHaveLength(20);
    expect(summary.table.every((r) => r.points === 0 && r.played === 0)).toBe(true);
  });

  it('uses real squad size and finances, preview for the rest', () => {
    expect(summary.squad.playerCount).toBe(22);
    expect(summary.finances.balance).toBe(db.clubs.find((c) => c.id === CLUB)!.finances.balance);
    expect(summary.inbox).toEqual([]);
    expect(summary.unreadMessages).toBe(0);
  });

  it('shows the latest inbox messages and counts all unread ones', () => {
    const messages = Array.from({ length: 6 }, (_, i) => ({
      date: '2026-07-02', category: 'transfer' as const, from: 'Director of Football', title: `Deal ${i}`, body: '',
    }));
    const inbox = addMessages([], messages);
    const s = buildDashboardSummary(db, CLUB, fresh, '2026-07-02', inbox, previewDashboard);
    expect(s.inbox).toHaveLength(INBOX_PREVIEW);
    expect(s.inbox[0]).toEqual({ id: inbox[0].id, from: 'Director of Football', subject: inbox[0].title, date: '2 Jul 2026', unread: true });
    expect(s.unreadMessages).toBe(6);
  });

  it('uses real fitness, morale and injuries when condition is given', () => {
    const ids = db.contracts.filter((c) => c.clubId === CLUB).map((c) => c.playerId);
    const condition = {
      date: '2026-07-01',
      players: {
        [ids[0]]: { fitness: 50, morale: 60, injury: { name: 'calf strain', returns: '2026-07-20' } },
        [ids[1]]: { fitness: 80, morale: 30, injury: null },
      },
    };
    const s = buildDashboardSummary(db, CLUB, fresh, '2026-07-01', [], previewDashboard, condition);
    expect(s.squad.injuredCount).toBe(1);
    expect(s.squad.suspendedCount).toBe(0);
    expect(s.squad.averageFitness).toBeCloseTo((100 * (ids.length - 2) + 50 + 80) / ids.length / 100);
    expect(s.squad.averageMorale).toBeCloseTo((60 * (ids.length - 1) + 30) / ids.length / 100);
  });

  it('falls back to the preview for a club outside the leagues', () => {
    expect(buildDashboardSummary(db, 'club_nowhere', fresh, '2026-07-01', [], previewDashboard)).toBe(previewDashboard);
  });
});

describe('buildDashboardSummary: during and after the season', () => {
  const afterOne = playUserFixture(db, fresh, user).season;

  it('reflects played matches', () => {
    const summary = buildDashboardSummary(db, CLUB, afterOne, '2026-08-08', [], previewDashboard);
    expect(summary.season.matchday).toBe(2);
    expect(summary.form).toHaveLength(1);
    expect(summary.table.find((r) => r.clubId === CLUB)!.played).toBe(1);
  });

  it('labels a cup tie with the round', () => {
    let season = afterOne;
    while (nextFixtureFor(season, CLUB)?.competitionId !== 'comp_national_cup') season = playUserFixture(db, season, user).season;
    const summary = buildDashboardSummary(db, CLUB, season, '2026-08-08', [], previewDashboard);
    expect(summary.nextMatch!.competition).toBe('National Cup · Round of 32');
    expect(summary.nextMatch!.kickOff).toBe('19:45');
  });

  it('asks to play out the season once the user is done, then summarises it', () => {
    let season = afterOne;
    while (nextFixtureFor(season, CLUB)) season = playUserFixture(db, season, user).season;
    if (!isSeasonComplete(season)) {
      const waiting = buildDashboardSummary(db, CLUB, season, '2027-04-24', [], previewDashboard);
      expect(waiting.nextMatch).toBeNull();
      expect(waiting.awaitingSeasonEnd).toBe(true);
      expect(waiting.seasonEnd).toBeNull();
      season = playRemaining(db, season).season;
    }
    const summary = buildDashboardSummary(db, CLUB, season, '2027-05-01', [], previewDashboard);
    expect(summary.awaitingSeasonEnd).toBe(false);
    expect(summary.seasonEnd).toMatchObject({ leagueName: 'First Division', cupName: 'National Cup' });
    expect(summary.seasonEnd!.userPosition).toBe(summary.table.find((r) => r.clubId === CLUB)!.position);
    expect(summary.seasonEnd!.championName).toBe(summary.table[0].clubName);
    expect(summary.seasonEnd!.cupWinnerName).not.toBeNull();
  });
});

describe('buildDashboardSummary: a Continental Cup second leg', () => {
  // Full world; results filled in (home wins 1–0) rather than simulated, up to the tie.
  const world = buildFictionalDatabase();
  const CUP = 'comp_continental_cup';
  const filledBefore = (s: Season, date: string): Season => ({
    ...s,
    fixtures: s.fixtures.map((f) => (f.result || f.date >= date ? f : { ...f, result: { score: { home: 1, away: 0 }, goals: [], cards: [], playerOfTheMatch: null } })),
  });
  let s = createSeason(world, 2026, 1234);
  const lastGroupDay = s.fixtures.filter((f) => f.competitionId === CUP).map((f) => f.date).sort().at(-1)!;
  s = filledBefore(s, addDays(lastGroupDay, 1));
  s = { ...s, fixtures: [...s.fixtures, ...nextCupRound(s, CUP)] };
  const leg2 = s.fixtures.find((f) => f.competitionId === CUP && f.matchday === 8)!;
  s = filledBefore(s, leg2.date);
  const user = leg2.homeId;

  it('shows the first leg instead of the table line', () => {
    expect(nextFixtureFor(s, user)?.id).toBe(leg2.id);
    const summary = buildDashboardSummary(world, user, s, leg2.date, [], previewDashboard);
    const nameOf = (id: string) => world.clubs.find((c) => c.id === id)!.name;
    // The first leg was the other way round: its hosts (the second leg's visitors) won 1–0.
    expect(summary.nextMatch?.firstLeg).toBe(`First leg: ${nameOf(leg2.awayId)} 1–0 ${nameOf(leg2.homeId)}`);
  });

  it('places a cup opponent from another league in its own league’s table', () => {
    const opponent = leg2.awayId;
    const sameLeague = s.leagues.some((l) => l.clubIds.includes(user) && l.clubIds.includes(opponent));
    const summary = buildDashboardSummary(world, user, s, leg2.date, [], previewDashboard);
    expect(summary.nextMatch?.opponentPosition).not.toBeNull();
    if (sameLeague) expect(summary.nextMatch?.opponentLeagueName).toBeNull();
    else expect(summary.nextMatch?.opponentLeagueName).toMatch(/Division$/);
  });
});
