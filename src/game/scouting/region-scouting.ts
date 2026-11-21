import type { AttributeKey, ClubId, GameDatabase, PlayerAttributes, PlayerId, Position } from '@/data/schemas';
import { addDays, ageOn } from '@/utils/date';
import { formatDate } from '@/utils/format';
import { createRng } from '@/utils/random';

import { formatPotentialRange, potentialOf, potentialRange, type Knowledge } from '../development/potential';
import type { NewMessage } from '../inbox/inbox';
import { POSITION_GROUP, POSITION_GROUP_LABELS } from '../positions';
import { mixSeed } from '../season/season';
import { isProspectId } from '../world/prospects';
import { fullName } from '../squad/squad-selectors';
import { playerAbility } from '../transfers/valuation';
import {
  busyScouts,
  deliverReports,
  knowledgeOf,
  SCOUTS,
  SHORTLIST_MAX,
  type RegionAssignment,
  type RegionGroup,
  type ScoutingState,
} from './scouting';

/**
 * Scouting trips: send a scout to a country for REGION_REPORT_DAYS; he comes
 * back with up to REPORT_PROSPECTS young players whom the user knew nothing
 * about: youngsters at clubs there, and the country's unattached youth
 * prospects (game/world/prospects.ts), who can't be found any other way. They land on the shortlist, "scouted" (potential
 * known to within a point), and the Chief Scout writes up the trip.
 *
 * "Young" means WONDERKID_MAX_AGE or under on the report date. Which players
 * a scout finds is deterministic: the assignment itself seeds the dice, so a
 * reloaded save delivers the same report (nothing here reads the clock or
 * Math.random).
 */

export const REGION_REPORT_DAYS = 21;
export const WONDERKID_MAX_AGE = 19;
export const REPORT_PROSPECTS = 3;

/** Random wobble on how a scout rates a prospect: he is good, not perfect. */
const SCOUT_NOISE = 1.5;

/**
 * Attributes that moved results most in the match engine's calibration runs
 * (+2 on each across a whole squad gave about +0.05 points a game; crossing,
 * workRate, acceleration and kicking gave nothing). Prospects strong in
 * these are favoured a little, and the report says so. If the engine's
 * weights change, re-measure and update this list.
 */
export const MATCH_TRAITS = ['anticipation', 'composure', 'firstTouch', 'positioning'] as const satisfies readonly AttributeKey[];
/** Potential points added per point the prospect's average trait sits above 10. */
const TRAIT_WEIGHT = 0.12;
/** Average trait value from which the report calls his instincts sharp. */
const SHARP_TRAITS = 13;

export const NATION_NAMES: Readonly<Record<string, string>> = {
  ENG: 'England',
  KEN: 'Kenya',
  FRA: 'France',
  GER: 'Germany',
  ITA: 'Italy',
  ESP: 'Spain',
  NED: 'Netherlands',
  POR: 'Portugal',
  NGA: 'Nigeria',
  GHA: 'Ghana',
  UGA: 'Uganda',
  TAN: 'Tanzania',
};

export const nationName = (code: string): string => NATION_NAMES[code] ?? code;

export const REGION_GROUP_LABELS: Record<RegionGroup, string> = { all: 'Any position', ...POSITION_GROUP_LABELS };

const matchesGroup = (group: RegionGroup, position: Position) => group === 'all' || POSITION_GROUP[position] === group;

/** Average of the MATCH_TRAITS, 1–20. */
export function matchTraits(attributes: PlayerAttributes): number {
  const flat: Record<string, number> = { ...attributes.technical, ...attributes.mental, ...attributes.physical };
  return MATCH_TRAITS.reduce((sum, key) => sum + flat[key], 0) / MATCH_TRAITS.length;
}

/** Stable small integer from text, to seed a trip's dice. */
function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const sameTrip = (a: Pick<RegionAssignment, 'nation' | 'group'>, b: Pick<RegionAssignment, 'nation' | 'group'>) =>
  a.nation === b.nation && a.group === b.group;

// --- Choices -----------------------------------------------------------------------

/** Countries with clubs in this world: where a scout can be sent. Sorted by name. */
export function regionOptions(db: GameDatabase): { value: string; label: string }[] {
  const codes = [...new Set(db.clubs.map((c) => c.country))];
  return codes.map((value) => ({ value, label: nationName(value) })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Why a scout can't be sent there right now, or null if he can. */
export function regionProblem(state: ScoutingState, db: GameDatabase, nation: string, group: RegionGroup): string | null {
  if (!db.clubs.some((c) => c.country === nation)) return 'There are no clubs there to watch.';
  if (state.regionAssignments.some((a) => sameTrip(a, { nation, group }))) {
    return `A scout is already in ${nationName(nation)} looking at ${REGION_GROUP_LABELS[group].toLowerCase()}.`;
  }
  if (busyScouts(state) >= SCOUTS) return `All ${SCOUTS} scouts are busy.`;
  return null;
}

export function startRegionAssignment(state: ScoutingState, db: GameDatabase, nation: string, group: RegionGroup, date: string): ScoutingState {
  const problem = regionProblem(state, db, nation, group);
  if (problem) throw new RangeError(problem);
  return { ...state, regionAssignments: [...state.regionAssignments, { nation, group, started: date, due: addDays(date, REGION_REPORT_DAYS) }] };
}

export function cancelRegionAssignment(state: ScoutingState, nation: string, group: RegionGroup): ScoutingState {
  return { ...state, regionAssignments: state.regionAssignments.filter((a) => !sameTrip(a, { nation, group })) };
}

// --- Delivering reports ----------------------------------------------------------------

type Prospect = { id: PlayerId; line: string };

/**
 * Delivers every trip due on or before `date`. Trips are handled in the
 * order they were started, and players found by one count as known to the
 * next, so two scouts in the same country never bring back the same boy.
 */
export function deliverRegionReports(
  state: ScoutingState,
  db: GameDatabase,
  userClubId: ClubId,
  date: string,
): { state: ScoutingState; messages: NewMessage[] } {
  const due = state.regionAssignments.filter((a) => a.due <= date);
  if (due.length === 0) return { state, messages: [] };

  const clubs = new Map(db.clubs.map((c) => [c.id, c]));
  const contracts = new Map(db.contracts.map((c) => [c.playerId, c.clubId]));
  const attributes = new Map(db.attributes.map((a) => [a.playerId, a]));

  let working = state;
  const messages: NewMessage[] = [];
  for (const trip of due) {
    const rng = createRng(mixSeed(hashText(`${trip.nation}|${trip.group}|${trip.started}`), 424242));

    const candidates = db.players.flatMap((player) => {
      const clubId = contracts.get(player.id);
      const club = clubId ? clubs.get(clubId) : undefined;
      const attrs = attributes.get(player.id);
      if (!attrs) return [];
      // Either a youngster at one of the country's clubs, or one of its unattached prospects.
      const unattached = !clubId && isProspectId(player.id) && player.nationality === trip.nation;
      if (!unattached && (!club || club.id === userClubId || club.country !== trip.nation)) return [];
      if (ageOn(player.dateOfBirth, trip.due) > WONDERKID_MAX_AGE || !matchesGroup(trip.group, player.primaryPosition)) return [];
      if (knowledgeOf(working, db, userClubId, player.id) > 0) return [];
      const score = potentialOf(player, attrs) + TRAIT_WEIGHT * (matchTraits(attrs) - 10) + (rng.next() * 2 - 1) * SCOUT_NOISE;
      return [{ player, attrs, club: club ?? null, score }];
    });
    candidates.sort((a, b) => b.score - a.score || (a.player.id < b.player.id ? -1 : 1));
    const found = candidates.slice(0, REPORT_PROSPECTS);

    const knowledge = { ...working.knowledge };
    const prospects: Prospect[] = found.map(({ player, attrs, club }) => {
      knowledge[player.id] = 1;
      const ability = playerAbility(player, attrs);
      const range = potentialRange(player.id, potentialOf(player, attrs), ability, 1 as Knowledge);
      const sharp = matchTraits(attrs) >= SHARP_TRAITS ? ' Sharp instincts.' : '';
      return {
        id: player.id,
        line: `${fullName(player)} (${player.primaryPosition}, ${ageOn(player.dateOfBirth, trip.due)}, ${club ? club.name : 'unattached'}): rating ${Math.round(ability)}, potential ${formatPotentialRange(range)}.${sharp}`,
      };
    });

    const where = nationName(trip.nation);
    const what = trip.group === 'all' ? 'young players' : `young ${REGION_GROUP_LABELS[trip.group].toLowerCase()}`;
    messages.push({
      date: trip.due,
      category: 'scouting',
      from: 'Chief Scout',
      title: `Scouting trip: ${where}`,
      body:
        prospects.length === 0
          ? `Our scout spent ${REGION_REPORT_DAYS} days in ${where} and found no ${what} you don't already know about.`
          : `Our scout is back from ${where} (${formatDate(trip.started)} to ${formatDate(trip.due)}). ${prospects.map((p) => p.line).join(' ')} They are on your shortlist: send a scout to any of them for an exact potential.`,
    });

    working = {
      ...working,
      regionAssignments: working.regionAssignments.filter((a) => a !== trip),
      knowledge,
      shortlist: [...prospects.map((p) => p.id), ...working.shortlist.filter((id) => !prospects.some((p) => p.id === id))].slice(0, SHORTLIST_MAX),
    };
  }
  return { state: working, messages };
}

/** Player reports and trip reports due by `date`, in one go (what the calendar calls). */
export function deliverAllReports(
  state: ScoutingState,
  db: GameDatabase,
  userClubId: ClubId,
  date: string,
): { state: ScoutingState; messages: NewMessage[] } {
  const players = deliverReports(state, db, userClubId, date);
  const trips = deliverRegionReports(players.state, db, userClubId, date);
  return { state: trips.state, messages: [...players.messages, ...trips.messages] };
}

// --- Views ------------------------------------------------------------------------------

export type RegionAssignmentView = { nation: string; group: RegionGroup; label: string; due: string };

export function regionAssignmentViews(state: ScoutingState): RegionAssignmentView[] {
  return state.regionAssignments.map((a) => ({
    nation: a.nation,
    group: a.group,
    label: `${nationName(a.nation)} · ${REGION_GROUP_LABELS[a.group]}`,
    due: a.due,
  }));
}

export type ProspectView = {
  id: PlayerId;
  name: string;
  age: number;
  position: string;
  clubName: string;
  /** Rounded current rating in his position. */
  rating: number;
  /** What the user is told, e.g. "14–16". */
  potential: string;
};

/** The shortlist, newest finds first. Players who left football are skipped. */
export function shortlistViews(state: ScoutingState, db: GameDatabase, userClubId: ClubId, date: string): ProspectView[] {
  const players = new Map(db.players.map((p) => [p.id, p]));
  const attributes = new Map(db.attributes.map((a) => [a.playerId, a]));
  const contracts = new Map(db.contracts.map((c) => [c.playerId, c.clubId]));
  const clubs = new Map(db.clubs.map((c) => [c.id, c]));
  return state.shortlist.flatMap((id) => {
    const player = players.get(id);
    const attrs = attributes.get(id);
    if (!player || !attrs) return [];
    const ability = playerAbility(player, attrs);
    const range = potentialRange(id, potentialOf(player, attrs), ability, knowledgeOf(state, db, userClubId, id));
    const clubId = contracts.get(id);
    return [
      {
        id,
        name: fullName(player),
        age: ageOn(player.dateOfBirth, date),
        position: player.primaryPosition,
        clubName: (clubId ? clubs.get(clubId)?.name : undefined) ?? (isProspectId(id) ? 'Unattached' : 'Free agent'),
        rating: Math.round(ability),
        potential: formatPotentialRange(range),
      },
    ];
  });
}
