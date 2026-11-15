import type { ClubId, GameDatabase } from '@/data/schemas';
import type { MatchTeamInput } from '@/engine/types';

import { FORMATION_IDS, type FormationId } from '../formations';
import { autoPickLineup, type Lineup, type LineupCandidate } from '../lineup';
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

/** Full engine input for an AI club facing an opponent of the given strength. */
export function buildAiTeam(db: GameDatabase, clubId: ClubId, opponentStrength: number): MatchTeamInput {
  const { squad, lineup } = aiSetup(db, clubId);
  return buildMatchTeam(db, clubId, lineup, chooseAiTactics(squad, lineup, opponentStrength));
}
