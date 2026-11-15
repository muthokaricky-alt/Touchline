import { buildFictionalDatabase } from '@/data/fictional';
import { simulateMatch } from '@/engine/simulate';
import type { MatchResult } from '@/engine/types';
import { aiSetup, aiSetupOn } from '@/game/ai/opponent';
import { autoPickLineup, starterIds } from '@/game/lineup';
import { buildMatchTeam } from '@/game/match/build-match-team';
import { advanceToUserFixture, createSeason, playDate } from '@/game/season/season-flow';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import {
  adjustMorale,
  applyMatch,
  conditionOf,
  conditionOn,
  ConditionStateSchema,
  emptyConditions,
  FULLY_FIT,
  injuryName,
  isInjured,
  matchConditions,
  moraleLabel,
  NEUTRAL_MORALE,
  RECOVERY_PER_DAY,
  squadIds,
  type ConditionState,
} from '../condition';
import { durationLabel, injuryMessages, withoutInjured } from '../squad-care';

const db = buildFictionalDatabase();
const USER = 'club_greywater_town';
const OTHER = 'club_kestrel_bay';
const lineup = autoPickLineup(selectSquadCandidates(db, USER), '4-4-2');
const DAY = '2026-08-08';

/** A state with the given players' conditions set. */
function stateWith(entries: Record<string, Partial<typeof FULLY_FIT>>, date = DAY): ConditionState {
  const players: ConditionState['players'] = {};
  for (const [id, c] of Object.entries(entries)) players[id] = { ...FULLY_FIT, ...c };
  return { date, players };
}

const someone = lineup.starters.LST!;

describe('recovery over time', () => {
  it('fitness recovers RECOVERY_PER_DAY a day, up to 100', () => {
    const s = stateWith({ [someone]: { fitness: 60 } });
    expect(conditionOf(conditionOn(s, '2026-08-11'), someone).fitness).toBe(60 + 3 * RECOVERY_PER_DAY);
    expect(conditionOf(conditionOn(s, '2026-08-20'), someone).fitness).toBe(100);
  });

  it('gives the same fitness and injuries however the days are split', () => {
    const s = stateWith({ [someone]: { fitness: 40, injury: { name: 'calf strain', returns: '2026-08-20' } } });
    const direct = conditionOn(s, '2026-08-15');
    const stepped = conditionOn(conditionOn(conditionOn(s, '2026-08-10'), '2026-08-12'), '2026-08-15');
    expect(conditionOf(stepped, someone).fitness).toBe(conditionOf(direct, someone).fitness);
    expect(conditionOf(stepped, someone).injury).toEqual(conditionOf(direct, someone).injury);
  });

  it('heals an injury on its return date', () => {
    const s = stateWith({ [someone]: { injury: { name: 'dead leg', returns: '2026-08-12' } } });
    expect(isInjured(conditionOn(s, '2026-08-11'), someone)).toBe(true);
    expect(isInjured(conditionOn(s, '2026-08-12'), someone)).toBe(false);
  });

  it('lets morale drift back to neutral and drops players who are back to default', () => {
    const s = stateWith({ [someone]: { morale: 90 } });
    const week = conditionOf(conditionOn(s, '2026-08-15'), someone).morale;
    expect(week).toBeLessThan(90);
    expect(week).toBeGreaterThan(NEUTRAL_MORALE);
    expect(conditionOn(s, '2027-08-08').players).toEqual({}); // a year later: settled, so no entry at all
  });

  it('never goes backwards in time', () => {
    const s = stateWith({ [someone]: { fitness: 50 } });
    expect(conditionOn(s, '2026-08-01')).toBe(s);
  });
});

describe('applyMatch', () => {
  const home = buildMatchTeam(db, USER, lineup, DEFAULT_TACTICS);
  const away = buildMatchTeam(db, OTHER, autoPickLineup(selectSquadCandidates(db, OTHER), '4-4-2'), DEFAULT_TACTICS);
  const squads = { home: squadIds(db, USER), away: squadIds(db, OTHER) };
  const results: MatchResult[] = Array.from({ length: 60 }, (_, seed) => simulateMatch({ home, away, seed }));

  it('sets fitness to end-of-match energy and leaves non-players fully fit', () => {
    const r = results[0];
    const { state } = applyMatch(emptyConditions(DAY), r, squads, DAY);
    for (const line of r.players) expect(conditionOf(state, line.playerId).fitness).toBe(Math.round(line.energy));
    const unused = squads.home.find((id) => !r.players.some((p) => p.playerId === id))!;
    expect(conditionOf(state, unused).fitness).toBe(100);
    expect(conditionOf(state, unused).morale).toBeLessThan(NEUTRAL_MORALE); // left out
    expect(ConditionStateSchema.safeParse(state).success).toBe(true);
  });

  it('winners gain morale, losers lose it', () => {
    const win = results.find((r) => r.score.home > r.score.away)!;
    const { state } = applyMatch(emptyConditions(DAY), win, squads, DAY);
    const avg = (side: 'home' | 'away') => {
      const lines = win.players.filter((p) => p.side === side);
      return lines.reduce((sum, p) => sum + conditionOf(state, p.playerId).morale, 0) / lines.length;
    };
    expect(avg('home')).toBeGreaterThan(NEUTRAL_MORALE);
    expect(avg('away')).toBeLessThan(NEUTRAL_MORALE);
  });

  it('starts injuries with a name and return date', () => {
    const injured = results.find((r) => r.events.some((e) => e.type === 'injury'))!;
    expect(injured).toBeDefined();
    const { state, injuries } = applyMatch(emptyConditions(DAY), injured, squads, DAY);
    expect(injuries.length).toBeGreaterThan(0);
    for (const i of injuries) {
      expect(isInjured(state, i.playerId)).toBe(true);
      expect(i.injury.returns > DAY).toBe(true);
      expect([USER, OTHER]).toContain(i.clubId);
    }
  });

  it('refuses a state on another date', () => {
    expect(() => applyMatch(emptyConditions('2026-08-01'), results[0], squads, DAY)).toThrow(/Condition is on/);
  });
});

describe('helpers', () => {
  it('adjusts morale within 0–100', () => {
    expect(conditionOf(adjustMorale(emptyConditions(DAY), someone, -100), someone).morale).toBe(0);
    expect(conditionOf(adjustMorale(emptyConditions(DAY), someone, 10), someone).morale).toBe(70);
  });

  it('passes only non-default players to the engine', () => {
    expect(matchConditions(stateWith({ [someone]: { fitness: 70 } }))).toEqual({ [someone]: { fitness: 70, morale: NEUTRAL_MORALE } });
  });

  it('names injuries by severity, deterministically', () => {
    expect(injuryName(someone, 5)).toBe(injuryName(someone, 5));
    expect(['dead leg', 'ankle knock', 'bruised ribs', 'tight calf']).toContain(injuryName(someone, 5));
    expect(durationLabel(6)).toBe('about 6 days');
    expect(durationLabel(21)).toBe('about 3 weeks');
    expect(durationLabel(80)).toBe('about 3 months');
    expect(moraleLabel(90)).toBe('Superb');
    expect(moraleLabel(NEUTRAL_MORALE)).toBe('Okay');
  });
});

describe('AI rotation', () => {
  const base = aiSetup(db, OTHER);
  const starters = starterIds(base.lineup);

  it('keeps its best team when everyone is fit', () => {
    expect(aiSetupOn(db, OTHER, emptyConditions(DAY))).toBe(base);
  });

  it('leaves out injured players and rests tired starters', () => {
    const s = stateWith({ [starters[0]]: { injury: { name: 'calf strain', returns: '2026-09-01' } }, [starters[1]]: { fitness: 60 } });
    const today = aiSetupOn(db, OTHER, s);
    const picked = [...starterIds(today.lineup), ...today.lineup.substitutes];
    expect(picked).not.toContain(starters[0]);
    expect(starterIds(today.lineup)).not.toContain(starters[1]);
    expect(starterIds(today.lineup).filter(Boolean)).toHaveLength(11);
  });
});

describe('the user after a matchday', () => {
  it('injured players leave the lineup and are replaced by fit ones', () => {
    const s = stateWith({ [someone]: { injury: { name: 'calf strain', returns: '2026-09-01' } } });
    const next = withoutInjured(db, USER, lineup, s);
    expect(starterIds(next)).not.toContain(someone);
    expect(starterIds(next).filter(Boolean)).toHaveLength(11);
    expect(next.substitutes).toHaveLength(lineup.substitutes.length);
  });

  it("only the user's injuries become messages", () => {
    const injury = { name: 'calf strain', returns: '2026-08-29' };
    const other = squadIds(db, OTHER)[0];
    const messages = injuryMessages(db, USER, [
      { playerId: someone, clubId: USER, injury, days: 21 },
      { playerId: other, clubId: OTHER, injury, days: 21 },
    ], DAY);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ category: 'medical', from: 'Head of Medical' });
    expect(messages[0].body).toMatch(/about 3 weeks/);
  });
});

describe('through the season flow', () => {
  const season = createSeason(db, 2026, 3);
  const user = { clubId: USER, lineup, tactics: DEFAULT_TACTICS };

  it('players who played are tired after a matchday, and recover by the next', () => {
    const first = advanceToUserFixture(db, season, user);
    const played = first.result.players.filter((p) => p.started);
    played.forEach((p) => expect(conditionOf(first.condition, p.playerId).fitness).toBeLessThan(100));
    const week = conditionOn(first.condition, '2026-08-15');
    played.forEach((p) => expect(conditionOf(week, p.playerId).fitness).toBeGreaterThanOrEqual(Math.min(100, Math.round(p.energy) + 7 * RECOVERY_PER_DAY)));
  });

  it('is deterministic with the same condition', () => {
    const a = playDate(db, season, '2026-08-08', undefined, emptyConditions('2026-07-01'));
    const b = playDate(db, season, '2026-08-08', undefined, emptyConditions('2026-07-01'));
    expect(a.condition).toEqual(b.condition);
    expect(a.season).toEqual(b.season);
  });
});
