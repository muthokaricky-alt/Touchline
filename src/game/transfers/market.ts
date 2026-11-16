import type { ClubId, GameDatabase, PlayerId, Position } from '@/data/schemas';

import { POSITION_GROUP, type PositionGroup } from '../positions';
import type { Season } from '../season/season';
import { fullName } from '../squad/squad-selectors';
import { ageAt, contractYearsLeft, marketValue, playerAbility, wageDemand } from './valuation';

/** Transfer market search: every player not at the user's club, filtered and ranked. Pure. */

/**
 * Where to look: everyone, free agents, one league (`league:<competition id>`,
 * the user's country's leagues are offered), or 'abroad' (clubs in other
 * countries than the user's).
 */
export type MarketScope = 'all' | 'free' | 'abroad' | `league:${string}`;

export type MarketFilters = {
  group: PositionGroup | 'all';
  scope: MarketScope;
  maxAge: number | null;
  /**
   * Upper bound on market value (free agents always pass): an amount, or
   * 'budget' for the user's transfer budget as it is now (so the filter
   * follows the budget after a signing).
   */
  maxValue: number | 'budget' | null;
  /** Part of the player's name; capitals and accents don't matter ("oscar" finds Óscar). */
  name: string;
};

/** Players the user can afford, first: a list of stars costing ten times the budget isn't a useful start. */
export const DEFAULT_FILTERS: MarketFilters = { group: 'all', scope: 'all', maxAge: null, maxValue: 'budget', name: '' };

/** Lower case without accents, for name search. */
const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export type MarketPlayerView = {
  id: PlayerId;
  name: string;
  age: number;
  position: Position;
  /** Rounded 1–20 ability in their main position. */
  rating: number;
  clubName: string | null;
  clubShortName: string | null;
  /** 0 for free agents. */
  value: number;
  /** The value is within the user's transfer budget (always true for free agents). */
  affordable: boolean;
  /** Current wage, or what a free agent would ask from the user's club. */
  weeklyWage: number;
  contractEnds: string | null;
};

export function searchMarket(
  db: GameDatabase,
  season: Season,
  userClubId: ClubId,
  filters: MarketFilters,
  date: string,
  limit = 50,
): MarketPlayerView[] {
  const contracts = new Map(db.contracts.map((c) => [c.playerId, c]));
  const clubs = new Map(db.clubs.map((c) => [c.id, c]));
  const attributes = new Map(db.attributes.map((a) => [a.playerId, a]));
  const leagueOf = new Map(season.leagues.flatMap((l) => l.clubIds.map((id) => [id, l.competitionId] as const)));
  const scopeLeague = filters.scope.startsWith('league:') ? filters.scope.slice('league:'.length) : null;
  const userRep = clubs.get(userClubId)?.reputation ?? 10;
  const userCountry = clubs.get(userClubId)?.country;
  const budget = clubs.get(userClubId)?.finances.transferBudget ?? 0;
  const maxValue = filters.maxValue === 'budget' ? budget : filters.maxValue;
  const wanted = plain(filters.name.trim());

  const views: MarketPlayerView[] = [];
  for (const player of db.players) {
    const contract = contracts.get(player.id);
    if (contract?.clubId === userClubId) continue;
    if (filters.group !== 'all' && POSITION_GROUP[player.primaryPosition] !== filters.group) continue;
    if (filters.scope === 'free' && contract) continue;
    if (scopeLeague && (!contract || leagueOf.get(contract.clubId) !== scopeLeague)) continue;
    if (filters.scope === 'abroad' && (!contract || clubs.get(contract.clubId)?.country === userCountry)) continue;
    const age = ageAt(player, date);
    if (filters.maxAge !== null && age > filters.maxAge) continue;
    if (wanted && !plain(fullName(player)).includes(wanted)) continue;

    const attrs = attributes.get(player.id);
    if (!attrs) continue;
    const ability = playerAbility(player, attrs);
    const value = contract ? marketValue({ ability, age, yearsLeft: contractYearsLeft(contract, date), potential: player.potential }) : 0;
    if (maxValue !== null && value > maxValue) continue;

    const club = contract ? clubs.get(contract.clubId) : undefined;
    views.push({
      id: player.id,
      name: fullName(player),
      age,
      position: player.primaryPosition,
      rating: Math.round(ability),
      clubName: club?.name ?? null,
      clubShortName: club?.shortName ?? null,
      value,
      affordable: value <= budget,
      weeklyWage: contract ? contract.weeklyWage : wageDemand({ ability, clubReputation: userRep, currentWage: null }),
      contractEnds: contract?.endDate ?? null,
    });
  }
  return views.sort((a, b) => b.rating - a.rating || a.value - b.value || (a.id < b.id ? -1 : 1)).slice(0, limit);
}

/** The market's "Where" choices for a user at `userClubId`: their country's leagues by short name. */
export function marketScopes(db: GameDatabase, season: Season, userClubId: ClubId): { value: MarketScope; label: string }[] {
  const country = db.clubs.find((c) => c.id === userClubId)?.country;
  const leagues = season.leagues
    .map((l) => db.competitions.find((c) => c.id === l.competitionId))
    .filter((c): c is NonNullable<typeof c> => c !== undefined && c.country === country);
  return [
    { value: 'all', label: 'Everyone' },
    { value: 'free', label: 'Free agents' },
    ...leagues.map((l) => ({ value: `league:${l.id}` as const, label: l.shortName })),
    { value: 'abroad', label: 'Abroad' },
  ];
}
