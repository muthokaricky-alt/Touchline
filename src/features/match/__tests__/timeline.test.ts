import { buildFictionalDatabase } from '@/data/fictional';
import { simulateMatch } from '@/engine/simulate';
import { autoPickLineup } from '@/game/lineup';
import { prepareFriendly } from '@/game/match/friendly';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { buildRatingRows, buildStatRows, buildTimeline, matchRatingTone, phaseLabel } from '../timeline';

const db = buildFictionalDatabase();
const USER = 'club_greywater_town';
const lineup = autoPickLineup(selectSquadCandidates(db, USER), '4-4-2');
const result = simulateMatch(
  prepareFriendly({ db, userClubId: USER, lineup, tactics: DEFAULT_TACTICS, opponentId: 'club_kestrel_bay', venue: 'home', seed: 77 }),
);
const timeline = buildTimeline(result, (id) => `Name(${id})`);

describe('buildTimeline', () => {
  it('starts with kick-off and ends with full-time', () => {
    expect(timeline[0].kind).toBe('whistle');
    expect(timeline[0].clock).toBe("0'");
    expect(timeline.at(-1)?.phase).toBe('full-time');
    expect(timeline.at(-1)?.score).toEqual(result.score);
  });

  it('includes every goal, card and substitution, and leaves out tackles and plain fouls', () => {
    const count = (type: string) => result.events.filter((e) => e.type === type).length;
    expect(timeline.filter((i) => i.kind === 'goal')).toHaveLength(count('goal'));
    expect(timeline.filter((i) => i.kind === 'card')).toHaveLength(count('card'));
    expect(timeline.filter((i) => i.kind === 'substitution')).toHaveLength(count('substitution'));
    expect(timeline.length).toBeLessThan(result.events.length);
  });

  it('carries a running score that only changes on goals', () => {
    for (let i = 1; i < timeline.length; i++) {
      const changed = JSON.stringify(timeline[i].score) !== JSON.stringify(timeline[i - 1].score);
      if (changed) expect(timeline[i].kind).toBe('goal');
    }
  });

  it('marks phases in order', () => {
    const order = ['first-half', 'half-time', 'second-half', 'full-time'];
    const phases = timeline.map((i) => order.indexOf(i.phase));
    expect(phases).toEqual([...phases].sort((a, b) => a - b));
    expect(timeline.filter((i) => i.phase === 'half-time')).toHaveLength(1);
  });

  it('uses the supplied player names and has unique keys', () => {
    expect(timeline.some((i) => i.text.includes('Name(plr_'))).toBe(true);
    expect(new Set(timeline.map((i) => i.key)).size).toBe(timeline.length);
  });
});

describe('buildStatRows', () => {
  const rows = buildStatRows(result.stats);

  it('formats possession and xG, and computes bar shares', () => {
    const possession = rows.find((r) => r.label === 'Possession')!;
    expect(possession.home).toBe(`${result.stats.home.possession}%`);
    expect(possession.homeShare).toBeCloseTo(result.stats.home.possession / 100);
    expect(rows.find((r) => r.label === 'Expected goals')!.home).toMatch(/^\d+\.\d\d$/);
  });

  it('uses an even bar when both sides have zero', () => {
    const zero = { ...result.stats.home, redCards: 0 };
    const red = buildStatRows({ home: zero, away: { ...result.stats.away, redCards: 0 } }).find((r) => r.label === 'Red cards')!;
    expect(red.homeShare).toBe(0.5);
  });
});

describe('buildRatingRows', () => {
  const home = buildRatingRows(result, 'home', (id) => `Name(${id})`);

  it('lists only that side, starters first', () => {
    expect(home.every((r) => result.players.find((p) => p.playerId === r.id)?.side === 'home')).toBe(true);
    const firstSub = home.findIndex((r) => !r.started);
    if (firstSub !== -1) expect(home.slice(firstSub).every((r) => !r.started)).toBe(true);
    expect(home.filter((r) => r.started)).toHaveLength(11);
  });

  it('sorts starters by rating and flags the player of the match once at most', () => {
    const starters = home.filter((r) => r.started).map((r) => r.rating);
    expect(starters).toEqual([...starters].sort((a, b) => b - a));
    const all = [...home, ...buildRatingRows(result, 'away', String)];
    expect(all.filter((r) => r.playerOfTheMatch)).toHaveLength(1);
  });
});

describe('labels', () => {
  it.each([
    [8.2, 'excellent'],
    [7.5, 'excellent'],
    [6.8, 'good'],
    [6.0, 'average'],
    [4.9, 'poor'],
  ] as const)('rating %d is %s', (rating, tone) => {
    expect(matchRatingTone(rating)).toBe(tone);
  });

  it('labels phases', () => {
    expect(phaseLabel('half-time')).toBe('Half-time');
    expect(phaseLabel('second-half')).toBe('Live');
  });
});
