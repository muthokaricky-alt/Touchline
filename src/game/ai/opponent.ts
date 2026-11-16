import type { ClubId, GameDatabase, PlayerId } from '@/data/schemas';
import type { MatchTeamInput } from '@/engine/types';

import { conditionOf, isInjured, ROTATION_FITNESS, type ConditionState } from '../condition/condition';
import { FORMATION_IDS, type FormationId } from '../formations';
import { autoPickLineup, starterIds, type Lineup, type LineupCandidate } from '../lineup';
import { buildMatchTeam, lineupStrength } from '../match/build-match-team';
import { selectSquadCandidates } from '../squad/squad-selectors';
import { analyseTactics } from '../tactics/analysis';
import { PLAYING_STYLES, type PlayingStyleId } from '../tactics/presets';
import type { Tactics } from '../tactics/tactics';

/**
 * How a computer-controlled club sets up for a match. Deterministic: the same
 * squad and opponent strength always produce the same team.
 *
 *  1. Formation: auto-pick an XI in every formation; keep the strongest.
 *  2. Style: choose from styles that suit the strength gap (favourites attack,
 *     underdogs sit deep), then let the assistant analysis (Milestone 4)
 *     pick the one that best fits the players.
 */

export function chooseAiLineup(squad: readonly LineupCandidate[]): Lineup {
  let best: Lineup | null = null;
  let bestStrength = -Infinity;
  for (const formationId of FORMATION_IDS) {
    const lineup = autoPickLineup(squad, formationId);
    const strength = lineupStrength(lineup, squad);
    if (strength > bestStrength + 1e-9) {
      best = lineup;
      bestStrength = strength;
    }
  }
  return best ?? autoPickLineup(squad, FORMATION_IDS[0] as FormationId);
}

/** Candidate styles by strength gap (own − opponent, in rating points). */
export function stylesForStrengthGap(gap: number): readonly PlayingStyleId[] {
  if (gap >= 1.5) return ['high-press', 'possession', 'wing-play'];
  if (gap <= -2.5) return ['low-block', 'counter'];
  if (gap <= -1) return ['counter', 'balanced'];
  return ['balanced', 'wing-play', 'possession'];
}

/** Score bonus for a band's first (default) style, so the AI only deviates when another clearly suits the squad. */
const DEFAULT_STYLE_PREFERENCE = 1.5;

export function chooseAiTactics(squad: readonly LineupCandidate[], lineup: Lineup, opponentStrength: number): Tactics {
  const gap = lineupStrength(lineup, squad) - opponentStrength;
  const candidates = stylesForStrengthGap(gap);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const [index, id] of candidates.entries()) {
    const notes = analyseTactics(PLAYING_STYLES[id].tactics, lineup, squad);
    const score =
      notes.filter((n) => n.tone === 'positive').length -
      2 * notes.filter((n) => n.tone === 'warning').length +
      (index === 0 ? DEFAULT_STYLE_PREFERENCE : 0);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return PLAYING_STYLES[best].tactics;
}

type AiSetup = { squad: LineupCandidate[]; lineup: Lineup; strength: number };

/**
 * Cache of each AI club's squad, best lineup and strength (~9 ms to compute
 * per club, and needed for every match).
 *
 * Keyed by the database *object* in a WeakMap: the database is immutable, so
 * as long as it's the same object the answer can't change; when squads do
 * change (transfers, injuries), the store will hold a new database object,
 * which starts with an empty cache. WeakMap also lets an old database and
 * its cache be garbage-collected.
 */
const setupCache = new WeakMap<GameDatabase, Map<ClubId, AiSetup>>();

export function aiSetup(db: GameDatabase, clubId: ClubId): AiSetup {
  let perDb = setupCache.get(db);
  if (!perDb) {
    perDb = new Map();
    setupCache.set(db, perDb);
  }
  let setup = perDb.get(clubId);
  if (!setup) {
    const squad = selectSquadCandidates(db, clubId);
    const lineup = chooseAiLineup(squad);
    setup = { squad, lineup, strength: lineupStrength(lineup, squad) };
    perDb.set(clubId, setup);
  }
  return setup;
}

const hasAnXi = (pool: readonly LineupCandidate[]) => pool.length >= 11 && pool.some((c) => c.player.primaryPosition === 'GK');

/**
 * The AI's team for a particular match: its best setup, unless someone in it
 * is injured or suspended, or a starter is tired (below ROTATION_FITNESS).
 * Then it re-picks in the same formation from the available players, falling
 * back to tired ones only if it's short. Untouched clubs reuse the cached setup.
 */
export function aiSetupOn(db: GameDatabase, clubId: ClubId, condition?: ConditionState, suspended?: ReadonlySet<PlayerId>): AiSetup {
  const setup = aiSetup(db, clubId);
  if (!condition && !suspended?.size) return setup;
  const starters = new Set(starterIds(setup.lineup));
  const unavailable = (id: string) => (condition ? isInjured(condition, id) : false) || (suspended?.has(id) ?? false);
  const tired = (id: string) => (condition ? conditionOf(condition, id).fitness < ROTATION_FITNESS : false);
  const affected = [...starters].some((id) => unavailable(id) || tired(id)) || setup.lineup.substitutes.some(unavailable);
  if (!affected) return setup;

  const available = setup.squad.filter((c) => !unavailable(c.player.id));
  const rested = available.filter((c) => !tired(c.player.id));
  const lineup = autoPickLineup(hasAnXi(rested) ? rested : available, setup.lineup.formationId);
  return { squad: setup.squad, lineup, strength: lineupStrength(lineup, setup.squad) };
}

/** Full engine input for an AI club facing an opponent of the given strength (and its players' condition and bans, if known). */
export function buildAiTeam(
  db: GameDatabase,
  clubId: ClubId,
  opponentStrength: number,
  condition?: ConditionState,
  suspended?: ReadonlySet<PlayerId>,
): MatchTeamInput {
  const { squad, lineup } = aiSetupOn(db, clubId, condition, suspended);
  return buildMatchTeam(db, clubId, lineup, chooseAiTactics(squad, lineup, opponentStrength), condition);
}
