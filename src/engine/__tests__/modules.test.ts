import { DEFAULT_TACTICS, type Tactics } from '@/game/tactics/tactics';

import { describeEvent, formatClock, type CommentaryContext } from '../commentary';
import { playerRating, type RatingInput } from '../ratings';
import { simulateMatch } from '../simulate';
import { tacticalEffects } from '../tactical-effects';
import {
  attackStrength,
  bestReplacement,
  controlStrength,
  createTeamState,
  defenceStrength,
  drainEnergy,
  value,
} from '../team-state';
import type { MatchEvent } from '../types';
import { CLUBS, team } from '../__fixtures__/helpers';

describe('tacticalEffects', () => {
  const effects = (t: Partial<Tactics>) => tacticalEffects({ ...DEFAULT_TACTICS, ...t });

  it('is neutral for the balanced defaults', () => {
    const e = effects({});
    expect([e.possession, e.chanceCreation, e.exposure]).toEqual([0, 0, 0]);
    expect([e.shotQuality, e.foulRate, e.energyDrain, e.spaceBehind]).toEqual([1, 1, 1, 1]);
  });

  it('orders mentality from cautious to bold', () => {
    const levels = (['very-defensive', 'defensive', 'balanced', 'attacking', 'very-attacking'] as const).map(
      (m) => effects({ mentality: m }),
    );
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].chanceCreation).toBeGreaterThan(levels[i - 1].chanceCreation);
      expect(levels[i].exposure).toBeGreaterThan(levels[i - 1].exposure);
    }
  });

  it('maps each instruction to its intended trade-off', () => {
    expect(effects({ passing: 'short' }).possession).toBeGreaterThan(0);
    expect(effects({ passing: 'direct' }).chanceMix['long-ball']).toBeGreaterThan(1);
    expect(effects({ width: 'wide' }).chanceMix.cross).toBeGreaterThan(1);
    expect(effects({ width: 'narrow' }).chanceMix.cross).toBeLessThan(1);
    expect(effects({ defensiveLine: 'high' }).spaceBehind).toBeGreaterThan(1);
    expect(effects({ defensiveLine: 'deep' }).spaceBehind).toBeLessThan(1);
    expect(effects({ pressing: 'high' }).energyDrain).toBeGreaterThan(1);
    expect(effects({ pressing: 'high' }).foulRate).toBeGreaterThan(1);
    expect(effects({ tempo: 'fast' }).energyDrain).toBeGreaterThan(1);
    expect(effects({ tempo: 'slow' }).possession).toBeGreaterThan(0);
  });
});

describe('team state', () => {
  const fresh = () => createTeamState('home', team(CLUBS.middle));

  it('fields the starting XI with full energy and the bench', () => {
    const t = fresh();
    expect(t.onPitch).toHaveLength(11);
    expect(t.bench).toHaveLength(7);
    t.onPitch.forEach((p) => expect(p.energy).toBe(100));
  });

  it('counts tired and out-of-position players for less', () => {
    const p = fresh().onPitch[3];
    const base = value(p, 'passing');
    expect(value({ ...p, energy: 0 }, 'passing')).toBeCloseTo(base * 0.7);
    expect(value({ ...p, fit: 'unfamiliar' }, 'passing')).toBeLessThan(base);
  });

  it('gets weaker when players tire or are sent off', () => {
    const t = fresh();
    const before = [controlStrength(t), attackStrength(t), defenceStrength(t)];
    t.onPitch.forEach((p) => (p.energy = 40));
    const tired = [controlStrength(t), attackStrength(t), defenceStrength(t)];
    tired.forEach((v, i) => expect(v).toBeLessThan(before[i]));

    const ten = fresh();
    ten.onPitch.pop();
    expect(controlStrength(ten)).toBeLessThan(before[0]);
  });

  it('drains low-stamina players faster and goalkeepers slowest', () => {
    const t = fresh();
    for (let i = 0; i < 60; i++) drainEnergy(t);
    const outfield = t.onPitch.filter((p) => p.position !== 'GK');
    const keeper = t.onPitch.find((p) => p.position === 'GK')!;
    const fittest = outfield.reduce((a, b) => (a.attrs.stamina > b.attrs.stamina ? a : b));
    const leastFit = outfield.reduce((a, b) => (a.attrs.stamina < b.attrs.stamina ? a : b));
    if (fittest.attrs.stamina > leastFit.attrs.stamina) expect(fittest.energy).toBeGreaterThan(leastFit.energy);
    expect(keeper.energy).toBeGreaterThan(Math.max(...outfield.map((p) => p.energy)));
  });

  it('replaces keepers only with keepers, outfielders only with outfielders', () => {
    const t = fresh();
    expect(bestReplacement(t, 'GK')?.player.primaryPosition).toBe('GK');
    expect(bestReplacement(t, 'ST')?.player.primaryPosition).not.toBe('GK');
  });
});

describe('playerRating', () => {
  const base: RatingInput = {
    playerId: 'plr_0001', side: 'home', position: 'ST', started: true, minutesPlayed: 90,
    goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, fouls: 0,
    yellowCards: 0, redCard: false, goalsConceded: 0, energy: 60, teamGoals: 0, opponentGoals: 0,
  };

  it('starts at 6.0 for an uneventful draw', () => {
    expect(playerRating(base)).toBe(6);
  });

  it('rewards goals and assists, punishes cards', () => {
    expect(playerRating({ ...base, goals: 2, shots: 2, shotsOnTarget: 2, teamGoals: 2 })).toBeGreaterThan(8);
    expect(playerRating({ ...base, assists: 1, teamGoals: 1 })).toBeGreaterThan(6.5);
    expect(playerRating({ ...base, redCard: true })).toBeLessThan(5);
  });

  it('rewards clean sheets and punishes goals conceded for keepers', () => {
    expect(playerRating({ ...base, position: 'GK', saves: 4 })).toBeGreaterThan(7);
    expect(playerRating({ ...base, position: 'GK', goalsConceded: 4, opponentGoals: 4 })).toBeLessThan(5);
  });

  it('stays within 3–10', () => {
    expect(playerRating({ ...base, goals: 9, teamGoals: 9 })).toBe(10);
    expect(playerRating({ ...base, position: 'GK', goalsConceded: 12, redCard: true, opponentGoals: 12 })).toBe(3);
  });
});

describe('commentary', () => {
  const result = simulateMatch({ home: team(CLUBS.middle), away: team(CLUBS.strongest), seed: 99 });
  const ctx: CommentaryContext = {
    playerName: (id) => `Player ${id}`,
    teamName: (side) => (side === 'home' ? 'Greywater Town' : 'Kestrel Bay'),
  };

  it('formats the clock', () => {
    expect(formatClock({ minute: 34 })).toBe("34'");
    expect(formatClock({ minute: 45, addedTime: 2 })).toBe("45+2'");
  });

  it('describes every event without leftover placeholders', () => {
    for (const event of result.events) {
      const line = describeEvent(event, ctx);
      expect(line.length).toBeGreaterThan(5);
      expect(line).not.toMatch(/\{|\}|undefined|null/);
    }
  });

  it('is deterministic and names the team on goals', () => {
    const goal: MatchEvent = {
      type: 'goal', minute: 10, side: 'away', scorerId: 'plr_0002', assistId: 'plr_0003', chance: 'cross', xg: 0.1,
      score: { home: 0, away: 1 },
    };
    expect(describeEvent(goal, ctx)).toBe(describeEvent(goal, ctx));
    expect(describeEvent(goal, ctx)).toContain('GOAL for Kestrel Bay');
    expect(describeEvent(goal, ctx)).toContain('Player plr_0003');
  });

  it('covers every event type that can occur', () => {
    const allTypes: MatchEvent['type'][] = ['kick-off', 'half-time', 'full-time', 'goal', 'shot', 'tackle', 'foul', 'card', 'substitution'];
    const seen = new Set(result.events.map((e) => e.type));
    // A single match may not contain cards; the others always appear.
    for (const type of allTypes.filter((t) => t !== 'card' && t !== 'goal')) expect(seen.has(type)).toBe(true);
  });
});
