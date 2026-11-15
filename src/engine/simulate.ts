import type { AttributeKey, PlayerId, Position } from '@/data/schemas';
import { clamp } from '@/utils/math';
import { createRng, type Rng } from '@/utils/random';

import { summarise } from './summarise';
import {
  attackStrength,
  average,
  bestReplacement,
  controlStrength,
  createTeamState,
  defenceStrength,
  drainEnergy,
  goalkeeper,
  MAX_SUBS,
  positionalAverage,
  toOnPitch,
  value,
  type OnPitch,
  type TeamState,
} from './team-state';
import type {
  Appearance,
  ChanceType,
  MatchClock,
  MatchEvent,
  MatchInput,
  MatchResult,
  Score,
  Side,
  SimulationOutput,
} from './types';

/**
 * The match engine. Each minute:
 *   1. possession   who has the ball (control strength + tactics + home edge)
 *   2. discipline   the defending side may foul (→ cards, sendings-off)
 *   3. chance       the side in possession may create a shot (attack vs
 *                   defence + tactics); otherwise a defender may win it back
 *   4. fatigue      everyone tires; tired players count for less
 *   5. injuries     rare; tired players are more at risk; forced substitution
 *   6. substitutions at set windows, tired players are replaced
 *
 * Every random decision goes through one seeded RNG, in a fixed order, so the
 * same input and seed always replay the same match.
 *
 * All tuning numbers live at the top of this file and in tactical-effects.ts;
 * __tests__/calibration.test.ts checks that their combined effect looks like
 * football (goals per game, home advantage, ...).
 */

// --- Tuning ------------------------------------------------------------------

// A strength gap counts in four places (possession, chance creation, shot
// quality, keeper), and the effects multiply, so each sensitivity is small.

/** Logit bonus for the home side (possession, half-weight; chance creation, full). */
export const HOME_ADVANTAGE = 0.25;
/** How strongly a strength difference (attribute points) moves possession. */
const POSSESSION_SENSITIVITY = 0.05;
/** How strongly attack-vs-defence moves chance creation. */
const CHANCE_SENSITIVITY = 0.05;
/** How strongly shooter-vs-defender skill moves xG (per attribute point, exponential). */
const XG_SKILL_SENSITIVITY = 0.03;
/** How strongly keeper skill reduces the chance a shot goes in. */
const KEEPER_SENSITIVITY = 0.025;
/** logit of the base chance of a shot in a minute with the ball (~0.22). */
const BASE_CHANCE_LOGIT = -1.27;
/**
 * Per team, per minute foul chance. Out of possession a side fouls more
 * (×1.4) than in possession (×0.6): ~21 fouls a match in total.
 */
const FOUL_RATE = 0.11;
const YELLOW_PER_FOUL = 0.19;
const STRAIGHT_RED_PER_FOUL = 0.004;
/** Booked players are more careful: they're picked as fouler less, and booked less readily. */
const BOOKED_CAUTION = 0.5;
/** When no shot happens, chance a defender is credited with winning the ball. */
const TACKLE_RATE = 0.35;
/** Minutes when the AI considers substitutions. */
const SUB_WINDOWS = [60, 70, 78, 85];
/** Energy below which an outfielder is due to be replaced. */
const TIRED = 72;
const MAX_SUBS_PER_WINDOW = 2;
/**
 * Injury chance per outfielder per minute when fresh; doubles at 50 energy.
 * Keepers ×0.3. Gives ~0.12 injuries per team per match (calibration test).
 */
const INJURY_RATE = 0.000085;

const BASE_MIX: Record<ChanceType, number> = {
  'through-ball': 30,
  cross: 25,
  'long-ball': 10,
  'long-shot': 20,
  'set-piece': 15,
};

/** Expected-goals value of an average chance of each type. */
const BASE_XG: Record<ChanceType, number> = {
  'through-ball': 0.22,
  cross: 0.1,
  'long-ball': 0.125,
  'long-shot': 0.045,
  'set-piece': 0.085,
};

/** Probability a goal from this chance type has an assist. */
const ASSIST_CHANCE: Record<ChanceType, number> = {
  'through-ball': 0.9,
  cross: 0.95,
  'long-ball': 0.8,
  'long-shot': 0.4,
  'set-piece': 0.6,
};

const SHOOTER_SKILL: Record<ChanceType, readonly AttributeKey[]> = {
  'through-ball': ['finishing', 'composure', 'anticipation', 'pace'],
  cross: ['heading', 'anticipation', 'finishing'],
  'long-ball': ['finishing', 'pace', 'strength', 'firstTouch'],
  'long-shot': ['finishing', 'composure', 'firstTouch'],
  'set-piece': ['heading', 'strength', 'anticipation'],
};

const KEEPER_SKILL: Record<ChanceType, readonly AttributeKey[]> = {
  'through-ball': ['oneOnOnes', 'reflexes', 'handling'],
  cross: ['aerialReach', 'handling', 'reflexes'],
  'long-ball': ['oneOnOnes', 'reflexes', 'handling'],
  'long-shot': ['reflexes', 'handling', 'positioning'],
  'set-piece': ['aerialReach', 'handling', 'reflexes'],
};

const DEFENDERS: readonly Position[] = ['CB', 'RB', 'LB', 'RWB', 'LWB'];

/** How likely each slot is to take a shot (before skill). */
const SHOOTER_ROLE: Partial<Record<Position, number>> = {
  ST: 5, AM: 3, RW: 3, LW: 3, RM: 2, LM: 2, CM: 1.5, DM: 0.7, RWB: 0.7, LWB: 0.7, RB: 0.5, LB: 0.5, CB: 0.4,
};
/** Headers from set pieces: centre-backs come forward. */
const SET_PIECE_ROLE: Partial<Record<Position, number>> = { ST: 3, CB: 2.5, AM: 1, RW: 0.8, LW: 0.8, CM: 1, DM: 1, RB: 0.6, LB: 0.6 };

const DEFENSIVE_ROLE: Partial<Record<Position, number>> = {
  CB: 1, RB: 0.9, LB: 0.9, RWB: 0.8, LWB: 0.8, DM: 1, CM: 0.6, RM: 0.4, LM: 0.4, AM: 0.25, RW: 0.25, LW: 0.25, ST: 0.15,
};
const ATTACKING_ROLE: Partial<Record<Position, number>> = {
  ST: 1, AM: 1, RW: 1, LW: 1, RM: 0.8, LM: 0.8, CM: 0.6, RWB: 0.5, LWB: 0.5, DM: 0.4, RB: 0.4, LB: 0.4, CB: 0.2,
};

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

// --- Public API ----------------------------------------------------------------

/** Simulates a full match and summarises it (score, stats, ratings). */
export function simulateMatch(input: MatchInput): MatchResult {
  return summarise(input, runSimulation(input));
}

/** The raw simulation: events, appearances, possession. Exposed for tests. */
export function runSimulation(input: MatchInput): SimulationOutput {
  assertValidInput(input);
  return new MatchSimulation(input).run();
}

/**
 * Player ids identify players in events and stats, so the two squads must
 * not share any. (A club can't play itself; tests that want two equal sides
 * use a renamed copy.)
 */
function assertValidInput(input: MatchInput): void {
  const homeIds = new Set(input.home.squad.map((c) => c.player.id));
  const shared = input.away.squad.find((c) => homeIds.has(c.player.id));
  if (shared) {
    throw new RangeError(`Both teams include player "${shared.player.id}"; squads must not overlap`);
  }
}

// --- Implementation ------------------------------------------------------------

/**
 * A class here (rather than loose functions) keeps the per-match mutable
 * state (score, teams, event list) in one place without passing six
 * arguments to every helper. It never leaves this module.
 */
class MatchSimulation {
  private readonly rng: Rng;
  private readonly teams: Record<Side, TeamState>;
  private readonly events: MatchEvent[] = [];
  private readonly appearances: Appearance[] = [];
  private readonly possession: Record<Side, number> = { home: 0, away: 0 };
  private readonly finalEnergy: Record<PlayerId, number> = {};
  private readonly score: Score = { home: 0, away: 0 };

  constructor(input: MatchInput) {
    this.rng = createRng(input.seed);
    this.teams = { home: createTeamState('home', input.home), away: createTeamState('away', input.away) };
    for (const team of Object.values(this.teams)) {
      for (const p of team.onPitch) {
        this.appearances.push({ playerId: p.id, side: team.side, position: p.position, started: true, onMinute: 0, offMinute: null });
      }
    }
  }

  run(): SimulationOutput {
    this.events.push({ type: 'kick-off', minute: 0 });
    const firstHalfAdded = this.rng.int(1, 4);
    const secondHalfAdded = this.rng.int(2, 6);

    for (let minute = 1; minute <= 45; minute++) this.playMinute({ minute });
    for (let added = 1; added <= firstHalfAdded; added++) this.playMinute({ minute: 45, addedTime: added });
    this.events.push({ type: 'half-time', minute: 45, addedTime: firstHalfAdded, score: { ...this.score } });

    for (let minute = 46; minute <= 90; minute++) this.playMinute({ minute });
    for (let added = 1; added <= secondHalfAdded; added++) this.playMinute({ minute: 90, addedTime: added });
    this.events.push({ type: 'full-time', minute: 90, addedTime: secondHalfAdded, score: { ...this.score } });

    for (const team of Object.values(this.teams)) {
      for (const p of team.onPitch) this.finalEnergy[p.id] = p.energy;
    }
    return {
      events: this.events,
      appearances: this.appearances,
      possessionMinutes: this.possession,
      finalEnergy: this.finalEnergy,
    };
  }

  private playMinute(clock: MatchClock): void {
    const { home, away } = this.teams;

    // 1. Possession
    const possessionLogit =
      POSSESSION_SENSITIVITY * (controlStrength(home) - controlStrength(away)) +
      home.effects.possession -
      away.effects.possession +
      HOME_ADVANTAGE / 2;
    const attacking = this.rng.next() < logistic(possessionLogit) ? home : away;
    const defending = attacking === home ? away : home;
    this.possession[attacking.side]++;

    // 2. Discipline: both sides can foul; the side without the ball more often.
    for (const [fouling, fouled, factor] of [[defending, attacking, 1.4], [attacking, defending, 0.6]] as const) {
      if (this.rng.next() < FOUL_RATE * factor * fouling.effects.foulRate * foulTendency(fouling)) {
        this.commitFoul(fouling, fouled, clock);
      }
    }

    // 3. Chance (or a defender wins it back)
    const chanceLogit =
      BASE_CHANCE_LOGIT +
      CHANCE_SENSITIVITY * (attackStrength(attacking) - defenceStrength(defending)) +
      attacking.effects.chanceCreation +
      defending.effects.exposure +
      (attacking.side === 'home' ? HOME_ADVANTAGE : 0);
    if (this.rng.next() < logistic(chanceLogit)) {
      this.resolveChance(attacking, defending, clock);
    } else if (this.rng.next() < TACKLE_RATE) {
      const tackler = this.rng.pickWeighted(defending.onPitch, (p) => (DEFENSIVE_ROLE[p.position] ?? 0) * value(p, 'tackling'));
      if (tackler) this.events.push({ ...clock, type: 'tackle', side: defending.side, playerId: tackler.id });
    }

    // 4. Fatigue
    drainEnergy(home);
    drainEnergy(away);

    // 5. Injuries
    this.considerInjury(home, clock);
    this.considerInjury(away, clock);

    // 6. Substitutions (not in stoppage time)
    if (clock.addedTime === undefined && SUB_WINDOWS.includes(clock.minute)) {
      this.considerSubstitutions(home, clock);
      this.considerSubstitutions(away, clock);
    }
  }

  // --- Chances -------------------------------------------------------------

  private resolveChance(att: TeamState, def: TeamState, clock: MatchClock): void {
    const type = this.rng.pickWeighted(Object.keys(BASE_MIX) as ChanceType[], (t) => BASE_MIX[t] * att.effects.chanceMix[t])!;
    const roles = type === 'set-piece' ? SET_PIECE_ROLE : SHOOTER_ROLE;
    const shooter = this.rng.pickWeighted(att.onPitch, (p) => (roles[p.position] ?? 0) * average(p, SHOOTER_SKILL[type]));
    if (!shooter) return;

    // Shot quality: chance type × shooter vs defenders × tactics.
    const shooterSkill = average(shooter, SHOOTER_SKILL[type]);
    const defenderSkill =
      type === 'cross' || type === 'set-piece'
        ? positionalAverage(def, ['CB'], ['heading', 'marking', 'strength'])
        : type === 'long-shot'
          ? positionalAverage(def, ['DM', 'CM', 'CB'], ['tackling', 'positioning'])
          : positionalAverage(def, DEFENDERS, ['positioning', 'marking', 'anticipation', 'pace']);
    let xg = BASE_XG[type] * Math.exp(XG_SKILL_SENSITIVITY * (shooterSkill - defenderSkill)) * att.effects.shotQuality;

    if (type === 'through-ball' || type === 'long-ball') {
      xg *= def.effects.spaceBehind;
      if (def.input.tactics.defensiveLine === 'high') {
        // A high line is only as safe as the centre-backs' pace.
        const paceGap = value(shooter, 'pace') - positionalAverage(def, ['CB'], ['pace', 'acceleration']);
        xg *= clamp(1 + 0.03 * paceGap, 0.7, 1.4);
      }
    }
    xg = clamp(xg, 0.01, 0.75);

    const keeper = goalkeeper(def);
    const keeperSkill = keeper ? average(keeper, KEEPER_SKILL[type]) : 3;
    const goalProbability = clamp(xg * Math.exp(-KEEPER_SENSITIVITY * (keeperSkill - 11)), 0.005, 0.85);
    const onTargetProbability = Math.min(0.95, goalProbability + 0.24 + 0.01 * (value(shooter, 'composure') - 10));
    const roundedXg = Math.round(xg * 1000) / 1000;
    const roll = this.rng.next();

    if (roll < goalProbability) {
      this.score[att.side]++;
      const assister = this.rng.next() < ASSIST_CHANCE[type] ? this.pickAssister(att, shooter, type) : undefined;
      this.events.push({
        ...clock,
        type: 'goal',
        side: att.side,
        scorerId: shooter.id,
        assistId: assister?.id ?? null,
        chance: type,
        xg: roundedXg,
        score: { ...this.score },
      });
      return;
    }

    const base = { ...clock, type: 'shot' as const, side: att.side, shooterId: shooter.id, chance: type, xg: roundedXg };
    if (roll < onTargetProbability) {
      this.events.push({ ...base, outcome: 'saved', defenderId: keeper?.id ?? null, corner: this.rng.next() < 0.35 });
    } else if (this.rng.next() < 0.3) {
      const blocker = this.rng.pickWeighted(def.onPitch, (p) => DEFENSIVE_ROLE[p.position] ?? 0);
      this.events.push({ ...base, outcome: 'blocked', defenderId: blocker?.id ?? null, corner: this.rng.next() < 0.5 });
    } else {
      this.events.push({ ...base, outcome: 'off-target', defenderId: null, corner: false });
    }
  }

  private pickAssister(att: TeamState, shooter: OnPitch, type: ChanceType): OnPitch | undefined {
    const candidates = att.onPitch.filter((p) => p.id !== shooter.id && p.position !== 'GK');
    switch (type) {
      case 'cross':
      case 'set-piece':
        return this.rng.pickWeighted(candidates, (p) => value(p, 'crossing') * (isWide(p.position) ? 2 : 0.6));
      case 'through-ball':
        return this.rng.pickWeighted(candidates, (p) => average(p, ['passing', 'vision']) * (ATTACKING_ROLE[p.position] ?? 0.3));
      default:
        return this.rng.pickWeighted(candidates, (p) => value(p, 'passing'));
    }
  }

  // --- Discipline ----------------------------------------------------------

  private commitFoul(def: TeamState, att: TeamState, clock: MatchClock): void {
    const fouler = this.rng.pickWeighted(
      def.onPitch,
      (p) =>
        (p.position === 'GK' ? 0.05 : (DEFENSIVE_ROLE[p.position] ?? 0.2)) *
        (1 + (12 - value(p, 'tackling')) / 12) *
        (p.booked ? BOOKED_CAUTION : 1),
    );
    const victim = this.rng.pickWeighted(att.onPitch, (p) => (p.position === 'GK' ? 0 : (ATTACKING_ROLE[p.position] ?? 0.3)));
    if (!fouler || !victim) return;
    this.events.push({ ...clock, type: 'foul', side: def.side, playerId: fouler.id, victimId: victim.id });

    const roll = this.rng.next();
    const yellowChance =
      YELLOW_PER_FOUL * (1 + (10 - value(fouler, 'composure')) / 20) * (fouler.booked ? BOOKED_CAUTION : 1);
    if (roll < STRAIGHT_RED_PER_FOUL) {
      this.events.push({ ...clock, type: 'card', side: def.side, playerId: fouler.id, card: 'red' });
      this.sendOff(def, fouler, clock);
    } else if (roll < STRAIGHT_RED_PER_FOUL + yellowChance) {
      if (fouler.booked) {
        this.events.push({ ...clock, type: 'card', side: def.side, playerId: fouler.id, card: 'second-yellow' });
        this.sendOff(def, fouler, clock);
      } else {
        fouler.booked = true;
        this.events.push({ ...clock, type: 'card', side: def.side, playerId: fouler.id, card: 'yellow' });
      }
    }
  }

  private sendOff(team: TeamState, player: OnPitch, clock: MatchClock): void {
    team.onPitch = team.onPitch.filter((p) => p.id !== player.id);
    this.leaveField(team.side, player, clock);
    if (player.position === 'GK') this.replaceSentOffKeeper(team, clock);
  }

  /** No keeper left: bring on the reserve keeper if possible, otherwise an outfielder goes in goal. */
  private replaceSentOffKeeper(team: TeamState, clock: MatchClock): void {
    const outfield = team.onPitch.filter((p) => p.position !== 'GK');
    if (outfield.length === 0) return;
    const reserveKeeper = team.subsUsed < MAX_SUBS ? bestReplacement(team, 'GK') : undefined;
    if (reserveKeeper) {
      const sacrificed = outfield.reduce((least, p) => (p.energy < least.energy ? p : least));
      this.substitute(team, sacrificed, reserveKeeper, 'GK', clock, 'goalkeeper');
      return;
    }
    const standIn = outfield.reduce((best, p) =>
      average(p, ['handling', 'reflexes']) > average(best, ['handling', 'reflexes']) ? p : best,
    );
    standIn.position = 'GK';
    standIn.fit = 'unfamiliar';
  }

  // --- Injuries --------------------------------------------------------------

  /** One draw per team per minute: does anyone get hurt, and if so who (tired players more likely). */
  private considerInjury(team: TeamState, clock: MatchClock): void {
    const risk = (p: OnPitch) => INJURY_RATE * (1 + (100 - p.energy) / 50) * (p.position === 'GK' ? 0.3 : 1);
    const total = team.onPitch.reduce((sum, p) => sum + risk(p), 0);
    if (this.rng.next() >= total) return;
    const player = this.rng.pickWeighted(team.onPitch, risk);
    if (!player) return;
    this.events.push({ ...clock, type: 'injury', side: team.side, playerId: player.id, days: injuryDays(this.rng) });

    const replacement = team.subsUsed < MAX_SUBS ? bestReplacement(team, player.position) : undefined;
    if (replacement) {
      this.substitute(team, player, replacement, player.position, clock, 'injury');
      return;
    }
    // No substitute left: his team plays on a man down.
    team.onPitch = team.onPitch.filter((p) => p.id !== player.id);
    this.leaveField(team.side, player, clock);
    if (player.position === 'GK') this.replaceSentOffKeeper(team, clock);
  }

  // --- Substitutions ---------------------------------------------------------

  private considerSubstitutions(team: TeamState, clock: MatchClock): void {
    const tired = team.onPitch
      .filter((p) => p.position !== 'GK' && p.energy < TIRED)
      .sort((a, b) => a.energy - b.energy);
    let made = 0;
    for (const player of tired) {
      if (team.subsUsed >= MAX_SUBS || made >= MAX_SUBS_PER_WINDOW) break;
      const replacement = bestReplacement(team, player.position);
      if (!replacement) continue;
      this.substitute(team, player, replacement, player.position, clock, 'fatigue');
      made++;
    }
  }

  private substitute(
    team: TeamState,
    off: OnPitch,
    on: TeamState['bench'][number],
    position: Position,
    clock: MatchClock,
    reason: 'fatigue' | 'goalkeeper' | 'injury',
  ): void {
    const index = team.onPitch.findIndex((p) => p.id === off.id);
    if (index === -1) return;
    team.onPitch[index] = toOnPitch(on, position, team.input.condition?.[on.player.id]);
    team.bench = team.bench.filter((c) => c.player.id !== on.player.id);
    team.subsUsed++;
    this.leaveField(team.side, off, clock);
    this.appearances.push({ playerId: on.player.id, side: team.side, position, started: false, onMinute: clock.minute, offMinute: null });
    this.events.push({ ...clock, type: 'substitution', side: team.side, offId: off.id, onId: on.player.id, reason });
  }

  private leaveField(side: Side, player: OnPitch, clock: MatchClock): void {
    this.finalEnergy[player.id] = player.energy;
    const appearance = this.appearances.find((a) => a.playerId === player.id && a.side === side && a.offMinute === null);
    if (appearance) appearance.offMinute = clock.minute;
  }
}

/** Days out: half are knocks (3–10), a third a strain (11–28), the rest serious (29–90). */
function injuryDays(rng: Rng): number {
  const roll = rng.next();
  if (roll < 0.5) return rng.int(3, 10);
  if (roll < 0.85) return rng.int(11, 28);
  return rng.int(29, 90);
}

/** Poor tacklers foul more. Whole-team factor, roughly 0.8–1.25. */
function foulTendency(team: TeamState): number {
  const outfield = team.onPitch.filter((p) => p.position !== 'GK');
  if (outfield.length === 0) return 1;
  const tackling = outfield.reduce((sum, p) => sum + value(p, 'tackling'), 0) / outfield.length;
  return clamp(1 + 0.03 * (10 - tackling), 0.75, 1.3);
}

function isWide(position: Position): boolean {
  return ['RB', 'LB', 'RWB', 'LWB', 'RM', 'LM', 'RW', 'LW'].includes(position);
}
