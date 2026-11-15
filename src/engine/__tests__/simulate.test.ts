import { runSimulation, simulateMatch } from '../simulate';
import { MAX_SUBS } from '../team-state';
import type { MatchEvent, MatchInput, MatchResult } from '../types';
import { CLUBS, mirror, simulateMany, team } from '../__fixtures__/helpers';

const home = team(CLUBS.middle);
const away = team(CLUBS.strongest);
const input = (seed: number): MatchInput => ({ home, away, seed });

/** Every player id mentioned by an event. */
function playerIdsIn(event: MatchEvent): string[] {
  switch (event.type) {
    case 'goal':
      return [event.scorerId, ...(event.assistId ? [event.assistId] : [])];
    case 'shot':
      return [event.shooterId, ...(event.defenderId ? [event.defenderId] : [])];
    case 'tackle':
    case 'card':
      return [event.playerId];
    case 'foul':
      return [event.playerId, event.victimId];
    case 'substitution':
      return [event.offId, event.onId];
    default:
      return [];
  }
}

describe('simulateMatch: determinism', () => {
  it('replays exactly with the same seed', () => {
    expect(simulateMatch(input(42))).toEqual(simulateMatch(input(42)));
  });

  it('produces different matches for different seeds', () => {
    const a = simulateMatch(input(1));
    const b = simulateMatch(input(2));
    expect(a.events).not.toEqual(b.events);
  });

  it('does not modify its input', () => {
    const snapshot = structuredClone(input(7));
    simulateMatch(input(7));
    expect(input(7)).toEqual(snapshot);
  });
});

describe('simulateMatch: invariants over many matches', () => {
  const results: MatchResult[] = simulateMany(150, input);

  it('starts with kick-off and ends with full-time; half-time in between', () => {
    for (const r of results) {
      expect(r.events[0].type).toBe('kick-off');
      expect(r.events.at(-1)?.type).toBe('full-time');
      expect(r.events.filter((e) => e.type === 'half-time')).toHaveLength(1);
    }
  });

  it('keeps events in chronological order', () => {
    for (const r of results) {
      const times = r.events.map((e) => e.minute * 100 + (e.addedTime ?? 0));
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });

  it('counts the score from goal events and goal events carry the running score', () => {
    for (const r of results) {
      const goals = r.events.filter((e) => e.type === 'goal');
      expect(goals.filter((g) => g.side === 'home')).toHaveLength(r.score.home);
      expect(goals.filter((g) => g.side === 'away')).toHaveLength(r.score.away);
      const final = r.events.at(-1);
      expect(final?.type === 'full-time' && final.score).toEqual(r.score);
    }
  });

  it('only mentions players who appeared for the right side', () => {
    for (const r of results) {
      const sideOf = new Map(r.players.map((p) => [p.playerId, p.side]));
      for (const e of r.events) {
        for (const id of playerIdsIn(e)) expect(sideOf.has(id)).toBe(true);
        if (e.type === 'goal') {
          expect(sideOf.get(e.scorerId)).toBe(e.side);
          if (e.assistId) {
            expect(sideOf.get(e.assistId)).toBe(e.side);
            expect(e.assistId).not.toBe(e.scorerId);
          }
        }
      }
    }
  });

  it('never involves a sent-off player after the red card', () => {
    for (const r of results) {
      const sentOff = new Map<string, number>();
      r.events.forEach((e, index) => {
        if (e.type === 'card' && e.card !== 'yellow') sentOff.set(e.playerId, index);
      });
      r.events.forEach((e, index) => {
        if (e.type === 'card') return;
        for (const id of playerIdsIn(e)) {
          const at = sentOff.get(id);
          if (at !== undefined) expect(index).toBeLessThan(at);
        }
      });
    }
  });

  it('uses at most 5 substitutes per side, only from the bench, and never brings a player back', () => {
    for (const r of results) {
      for (const side of ['home', 'away'] as const) {
        const subs = r.events.filter((e) => e.type === 'substitution' && e.side === side);
        expect(subs.length).toBeLessThanOrEqual(MAX_SUBS);
        const bench = new Set((side === 'home' ? home : away).lineup.substitutes);
        const offIds = new Set<string>();
        for (const s of subs) {
          if (s.type !== 'substitution') continue;
          expect(bench.has(s.onId)).toBe(true);
          expect(offIds.has(s.onId)).toBe(false);
          offIds.add(s.offId);
        }
      }
    }
  });

  it('gives consistent team stats', () => {
    for (const r of results) {
      expect(r.stats.home.possession + r.stats.away.possession).toBe(100);
      for (const side of ['home', 'away'] as const) {
        const s = r.stats[side];
        expect(s.shots).toBeGreaterThanOrEqual(s.shotsOnTarget);
        expect(s.shotsOnTarget).toBeGreaterThanOrEqual(r.score[side]);
      }
    }
  });

  it('gives player stats that add up to the team stats', () => {
    for (const r of results) {
      for (const side of ['home', 'away'] as const) {
        const players = r.players.filter((p) => p.side === side);
        expect(players.reduce((s, p) => s + p.goals, 0)).toBe(r.score[side]);
        expect(players.reduce((s, p) => s + p.shots, 0)).toBe(r.stats[side].shots);
        expect(players.reduce((s, p) => s + p.fouls, 0)).toBe(r.stats[side].fouls);
      }
    }
  });

  it('keeps ratings within 3–10 and picks a player of the match', () => {
    for (const r of results) {
      for (const p of r.players) {
        expect(p.rating).toBeGreaterThanOrEqual(3);
        expect(p.rating).toBeLessThanOrEqual(10);
        expect(p.minutesPlayed).toBeGreaterThanOrEqual(0);
        expect(p.minutesPlayed).toBeLessThanOrEqual(90);
      }
      const best = Math.max(...r.players.map((p) => p.rating));
      expect(r.players.find((p) => p.playerId === r.playerOfTheMatch)?.rating).toBe(best);
    }
  });

  it('starts 11 players per side and tires them', () => {
    const sim = runSimulation(input(3));
    expect(sim.appearances.filter((a) => a.started && a.side === 'home')).toHaveLength(11);
    const outfieldEnergy = sim.appearances
      .filter((a) => a.started && a.position !== 'GK' && a.offMinute === null)
      .map((a) => sim.finalEnergy[a.playerId]);
    outfieldEnergy.forEach((e) => expect(e).toBeLessThan(100));
  });
});

describe('simulateMatch: edge cases', () => {
  it('copes with an incomplete lineup (empty slots) and an empty bench', () => {
    const thin = { ...home, lineup: { ...home.lineup, substitutes: [], starters: { ...home.lineup.starters, LM: null, RM: null } } };
    const result = simulateMatch({ home: thin, away, seed: 5 });
    expect(result.players.filter((p) => p.side === 'home' && p.started)).toHaveLength(9);
    expect(result.events.some((e) => e.type === 'substitution' && e.side === 'home')).toBe(false);
  });

  it('rejects two teams that share players', () => {
    expect(() => simulateMatch({ home, away: home, seed: 1 })).toThrow(/must not overlap/);
  });

  it('gives each side its own player stats when a club faces a renamed copy of itself', () => {
    const result = simulateMatch({ home, away: mirror(home), seed: 8 });
    expect(result.players.filter((p) => p.side === 'home' && p.started)).toHaveLength(11);
    expect(result.players.filter((p) => p.side === 'away' && p.started)).toHaveLength(11);
  });
});
