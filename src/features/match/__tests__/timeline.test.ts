import { buildFictionalDatabase } from '@/data/fictional';
import { simulateMatch } from '@/engine/simulate';
import { autoPickLineup } from '@/game/lineup';
import { prepareFriendly } from '@/game/match/friendly';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { buildRatingRows, buildStatRows, buildTimeline, matchRatingTone, phaseLabel, scorerLines, type TimelineItem } from '../timeline';

const db = buildFictionalDatabase();
const USER = 'club_greywater_town';
const lineup = autoPickLineup(selectSquadCandidates(db, USER), '4-4-2');
const result = simulateMatch(
  prepareFriendly({ db, userClubId: USER, lineup, tactics: DEFAULT_TACTICS, opponentId: 'club_kestrel_bay', venue: 'home', seed: 77 }),
);
const timeline = buildTimeline(result, (id) => `Name(${id})`);

describe('substitutions in the feed', () => {
  it('puts planned changes by one team at the same minute on one line, keyed by the last of them', () => {
    // A match with two changes by one side at the same minute.
    for (let seed = 1; seed < 200; seed++) {
      const r = simulateMatch(
        prepareFriendly({ db, userClubId: USER, lineup, tactics: DEFAULT_TACTICS, opponentId: 'club_kestrel_bay', venue: 'home', seed }),
      );
      const subs = r.events.flatMap((e, index) => (e.type === 'substitution' && e.reason === 'fatigue' ? [{ e, index }] : []));
      const pair = subs.find((a, i) => subs[i + 1] && subs[i + 1].index === a.index + 1 && subs[i + 1].e.side === a.e.side && subs[i + 1].e.minute === a.e.minute);
      if (!pair) continue;
      const second = subs[subs.indexOf(pair) + 1];
      const items = buildTimeline(r, (id) => `Name(${id})`);
      const line = items.find((i) => i.text.includes(`Name(${pair.e.onId}) for`))!;
      expect(line.text).toMatch(/^Substitutions for .+: Name\(plr_\d+\) for Name\(plr_\d+\), Name/);
      expect(line.text).toContain(`Name(${second.e.onId}) for Name(${second.e.offId})`);
      expect(Number(line.key)).toBeGreaterThanOrEqual(second.index);
      return;
    }
    throw new Error('No match with two changes at the same minute');
  });
});

describe('scorerLines', () => {
  const goal = (side: 'home' | 'away', scorer: string, clock: string): TimelineItem => ({
    key: clock,
    at: { minute: Number.parseInt(clock, 10) },
    clock,
    kind: 'goal',
    side,
    text: '',
    score: { home: 0, away: 0 },
    phase: 'first-half',
    scorer,
  });

  it('lists each scorer once with every minute, in the order they first scored, per side', () => {
    const items = [goal('home', 'Óscar Vidal', "30'"), goal('away', 'Rayan Bonnet', "33'"), goal('home', 'Rick Kyalo', "34'"), goal('home', 'Óscar Vidal', "35'")];
    expect(scorerLines(items, 'home')).toEqual(["Óscar Vidal 30', 35'", "Rick Kyalo 34'"]);
    expect(scorerLines(items, 'away')).toEqual(["Rayan Bonnet 33'"]);
    expect(scorerLines(items.slice(0, 1), 'away')).toEqual([]); // only what has been shown
  });

  it('names the scorer of every goal in a real match', () => {
    const goals = timeline.filter((i) => i.kind === 'goal');
    expect(goals.every((g) => g.scorer?.startsWith('Name(plr_'))).toBe(true);
    expect(scorerLines(timeline, 'home').length + scorerLines(timeline, 'away').length).toBeLessThanOrEqual(goals.length);
  });
});

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
    // Every substitution is in the feed, though planned changes at the same minute share a line.
    const subLines = timeline.filter((i) => i.kind === 'substitution').map((i) => i.text);
    for (const e of result.events) {
      if (e.type === 'substitution') expect(subLines.some((t) => t.includes(`Name(${e.onId})`))).toBe(true);
    }
    expect(subLines.length).toBeLessThanOrEqual(count('substitution'));
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
