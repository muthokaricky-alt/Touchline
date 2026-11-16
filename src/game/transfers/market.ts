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
  /** Upper bound on market value (free agents always pass). */
  maxValue: number | null;
};

export const DEFAULT_FILTERS: MarketFilters = { group: 'all', scope: 'all', maxAge: null, maxValue: null };

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

    const attrs = attributes.get(player.id);
    if (!attrs) continue;
    const ability = playerAbility(player, attrs);
    const value = contract ? marketValue({ ability, age, yearsLeft: contractYearsLeft(contract, date), potential: player.potential }) : 0;
    if (filters.maxValue !== null && value > filters.maxValue) continue;

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
