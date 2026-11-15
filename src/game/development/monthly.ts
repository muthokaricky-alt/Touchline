import type { ClubId, GameDatabase, PlayerId } from '@/data/schemas';
import { formatDate } from '@/utils/format';
import { createRng } from '@/utils/random';

import { conditionOf, conditionOn, injuryName, type ConditionState, type NewInjury } from '../condition/condition';
import type { NewMessage } from '../inbox/inbox';
import { mixSeed, type Season } from '../season/season';
import { fullName } from '../squad/squad-selectors';
import { DEFAULT_TRAINING, developWorld, INTENSITY_EFFECTS, monthsCrossed, trainingInjuryReturn, type AttributeChange, type Training } from './development';

/**
 * Everything that happens when the calendar crosses the 1st of a month:
 * every player develops, some get hurt in training, and the user gets a
 * development report. Called by the store whenever the date moves on.
 */

export type MonthlyInput = {
  db: GameDatabase;
  /** The calendar moves from `from` (exclusive) to `to` (inclusive). */
  from: string;
  to: string;
  season: Season;
  /** Condition as of `to` (or earlier); training injuries are added on `to`. */
  condition: ConditionState;
  userClubId: ClubId;
  userTraining: Training;
  seed: number;
};

export type MonthlyOutcome = {
  db: GameDatabase;
  condition: ConditionState;
  /** Every month's changes, all clubs. */
  changes: AttributeChange[];
  trainingInjuries: NewInjury[];
  months: string[];
};

export function developThrough({ db, from, to, season, condition, userClubId, userTraining, seed }: MonthlyInput): MonthlyOutcome {
  const months = monthsCrossed(from, to);
  if (months.length === 0) return { db, condition, changes: [], trainingInjuries: [], months };

  const trainingFor = (clubId: ClubId | null) => (clubId === userClubId ? userTraining : DEFAULT_TRAINING);
  let world = db;
  const changes: AttributeChange[] = [];
  for (const month of months) {
    const developed = developWorld(world, month, season, trainingFor, seed);
    world = developed.db;
    changes.push(...developed.changes);
  }

  // Training knocks: one roll per contracted player per month, at his club's intensity.
  let state = conditionOn(condition, to);
  const injuries: NewInjury[] = [];
  for (const month of months) {
    const rng = createRng(mixSeed(seed, Number(month.replace(/-/g, '')) + 500));
    for (const contract of world.contracts) {
      const roll = rng.next();
      if (roll >= INTENSITY_EFFECTS[trainingFor(contract.clubId).intensity].injuryChance) continue;
      const id = contract.playerId;
      if (conditionOf(state, id).injury) continue;
      const { days, returns } = trainingInjuryReturn(rng, to);
      const injury = { name: injuryName(id, days), returns };
      state = { ...state, players: { ...state.players, [id]: { ...conditionOf(state, id), injury } } };
      injuries.push({ playerId: id, clubId: contract.clubId, injury, days });
    }
  }
  return { db: world, condition: state, changes, trainingInjuries: injuries, months };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * The Head of Coaching's monthly report on the user's players: who improved
 * and who declined (change in ability, summed over the months crossed).
 * Null when nothing worth mentioning happened.
 */
export function developmentReport(db: GameDatabase, userClubId: ClubId, outcome: MonthlyOutcome, date: string): NewMessage | null {
  const own = new Set(db.contracts.filter((c) => c.clubId === userClubId).map((c) => c.playerId));
  const delta = new Map<PlayerId, number>();
  for (const c of outcome.changes) {
    if (!own.has(c.playerId)) continue;
    delta.set(c.playerId, (delta.get(c.playerId) ?? 0) + c.abilityAfter - c.abilityBefore);
  }
  const nameOf = (id: PlayerId) => {
    const p = db.players.find((x) => x.id === id);
    return p ? fullName(p) : id;
  };
  const format = ([id, d]: [PlayerId, number]) => `${nameOf(id)} ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`;
  const sorted = [...delta].filter(([, d]) => Math.abs(d) >= 0.1).sort((a, b) => b[1] - a[1]);
  const up = sorted.filter(([, d]) => d > 0).slice(0, 4);
  const down = sorted.filter(([, d]) => d < 0).reverse().slice(0, 3);
  if (up.length === 0 && down.length === 0) return null;

  const month = outcome.months.at(-1)!;
  const label = MONTHS[Number(month.slice(5, 7)) - 1];
  const lines = [
    up.length ? `Improving: ${up.map(format).join(', ')}.` : null,
    down.length ? `Declining: ${down.map(format).join(', ')}.` : null,
    `(Change in rating for their position, up to ${formatDate(date)}.)`,
  ].filter((l): l is string => l !== null);
  return {
    date,
    category: 'squad',
    from: 'Head of Coaching',
    title: `Development report: ${label}`,
    body: lines.join(' '),
  };
}
