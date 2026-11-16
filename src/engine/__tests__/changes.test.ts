import { starterIds } from '@/game/lineup';

import { changeProblem, clockKey, matchSnapshot, runSimulation, simulateMatch } from '../simulate';
import { MAX_SUBS } from '../team-state';
import type { MatchChange, MatchClock, MatchEvent, MatchInput } from '../types';
import { CLUBS, simulateMany, team } from '../__fixtures__/helpers';

/**
 * In-match changes. The property everything rests on: a change made at
 * minute m leaves every event up to and including m exactly as it was, so
 * the game can re-simulate the whole match and the replay carries on.
 */

const home = team(CLUBS.middle);
const away = team(CLUBS.strongest);
const base = (seed: number, changes: MatchChange[] = []): MatchInput => ({ home, away, seed, changes });

const upTo = (events: readonly MatchEvent[], at: MatchClock) => events.filter((e) => clockKey(e) <= clockKey(at) && e.type !== 'half-time');
const benchOf = (input: MatchInput) => input.home.lineup.substitutes;
const sub = (after: MatchClock, offId: string, onId: string): MatchChange => ({ after, side: 'home', kind: 'substitution', offId, onId });

describe('in-match changes', () => {
  it('never change anything up to the minute they are made at', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const after of [{ minute: 20 }, { minute: 45, addedTime: 1 }, { minute: 63 }, { minute: 88 }] as MatchClock[]) {
        const plain = runSimulation(base(seed));
        const snapshot = matchSnapshot(base(seed), after);
        const off = snapshot.teams.home.onPitch.find((p) => p.position !== 'GK')!.id;
        const on = snapshot.teams.home.bench[0];
        const changed = runSimulation(
          base(seed, [sub(after, off, on), { after, side: 'home', kind: 'tactics', tactics: { ...home.tactics, mentality: 'very-attacking' } }]),
        );
        expect(upTo(changed.events, after)).toEqual(upTo(plain.events, after));
      }
    }
  });

  it('a substitution happens in the next minute, by the manager, and counts towards the limit', () => {
    const after = { minute: 30 };
    const off = starterIds(home.lineup)[5];
    const on = benchOf(base(1))[0];
    const result = simulateMatch(base(1, [sub(after, off, on)]));
    const event = result.events.find((e) => e.type === 'substitution' && e.reason === 'manager');
    expect(event).toMatchObject({ minute: 31, offId: off, onId: on, side: 'home' });
    expect(result.players.find((p) => p.playerId === on)).toMatchObject({ started: false });
    expect(result.players.find((p) => p.playerId === on)!.minutesPlayed).toBeGreaterThan(55);
    expect(matchSnapshot(base(1, [sub(after, off, on)]), after).teams.home.subsLeft).toBe(MAX_SUBS - 1);
  });

  it('the assistant stops making fatigue substitutions once the manager takes charge', () => {
    const results = simulateMany(40, (seed) => base(seed, [{ after: { minute: 10 }, side: 'home', kind: 'tactics', tactics: home.tactics }]));
    const autoSubs = results.flatMap((r) => r.events).filter((e) => e.type === 'substitution' && e.side === 'home' && e.reason === 'fatigue');
    expect(autoSubs).toEqual([]);
    // The other side still gets them.
    expect(results.flatMap((r) => r.events).some((e) => e.type === 'substitution' && e.side === 'away' && e.reason === 'fatigue')).toBe(true);
  });

  it('a tactics change is announced and takes effect: going very attacking from half-time means more shots after it', () => {
    const attack = { ...home.tactics, mentality: 'very-attacking' as const, tempo: 'fast' as const };
    const shotsAfterBreak = (changes: (seed: number) => MatchChange[]) =>
      simulateMany(300, (seed) => base(seed, changes(seed)))
        .flatMap((r) => r.events)
        .filter((e) => (e.type === 'shot' || e.type === 'goal') && e.side === 'home' && e.minute > 45).length;
    const plain = shotsAfterBreak(() => []);
    const attacking = shotsAfterBreak(() => [{ after: { minute: 45, addedTime: 1 }, side: 'home', kind: 'tactics', tactics: attack }]);
    expect(attacking).toBeGreaterThan(plain * 1.05);

    const one = simulateMatch(base(3, [{ after: { minute: 50 }, side: 'home', kind: 'tactics', tactics: attack }]));
    expect(one.events.find((e) => e.type === 'tactics')).toMatchObject({ minute: 51, side: 'home', tactics: attack });
  });

  it('snapshots show who is on, who is left, and when the match is over', () => {
    const start = matchSnapshot(base(1), { minute: 0 });
    expect(start.teams.home.onPitch.map((p) => p.id).sort()).toEqual(starterIds(home.lineup).sort());
    expect(start.teams.home.bench).toEqual(benchOf(base(1)));
    expect(start.teams.home.onPitch.every((p) => p.energy === 100)).toBe(true);

    const later = matchSnapshot(base(1), { minute: 70 });
    expect(later.teams.home.onPitch.some((p) => p.energy < 100)).toBe(true);
    expect(later.finished).toBe(false);
    expect(matchSnapshot(base(1), { minute: 90, addedTime: 9 }).finished).toBe(true);

    const result = simulateMatch(base(1));
    const fullTime = result.events.find((e) => e.type === 'full-time')!;
    expect(matchSnapshot(base(1), fullTime).score).toEqual(result.score);
  });

  it('checks changes before they are made, and the engine skips invalid ones', () => {
    const off = starterIds(home.lineup)[5];
    const on = benchOf(base(1))[0];
    expect(changeProblem(base(1), sub({ minute: 30 }, off, on))).toBeNull();
    expect(changeProblem(base(1), sub({ minute: 30 }, on, off))).toBe('That player isn’t on the pitch');
    expect(changeProblem(base(1, [sub({ minute: 30 }, off, on)]), sub({ minute: 40 }, starterIds(home.lineup)[6], on))).toBe(
      'That player isn’t on the bench',
    );
    expect(changeProblem(base(1), sub({ minute: 90, addedTime: 9 }, off, on))).toBe('The match is over');

    const bench = benchOf(base(1));
    const outfield = starterIds(home.lineup).slice(1);
    const tooMany = bench.slice(0, MAX_SUBS).map((id, i) => sub({ minute: 50 + i }, outfield[i], id));
    expect(changeProblem(base(1, tooMany), sub({ minute: 60 }, outfield[6], bench[MAX_SUBS]))).toBe('No substitutions left');

    // Applied anyway (e.g. an old save): skipped, the match still finishes normally.
    const result = simulateMatch(base(1, [sub({ minute: 30 }, on, off)]));
    expect(result.events.some((e) => e.type === 'substitution' && e.reason === 'manager')).toBe(false);
    expect(result.events.at(-1)?.type).toBe('full-time');
  });
});
