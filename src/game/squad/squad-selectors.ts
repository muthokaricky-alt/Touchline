import type {
  AttributeGroup,
  AttributeKey,
  Club,
  ClubId,
  GameDatabase,
  NationCode,
  Player,
  PlayerId,
  Position,
  PreferredFoot,
} from '@/data/schemas';
import { ageOn } from '@/utils/date';

import type { LineupCandidate } from '../lineup';
import { POSITION_GROUP, POSITION_GROUP_LABELS, POSITION_GROUP_ORDER, type PositionGroup } from '../positions';
import { effectiveRating, positionFit, type PositionFit } from './position-fit';
import { conditionOf, FULLY_FIT, type ConditionState, type PlayerCondition } from '../condition/condition';
import { formatPotentialRange, potentialOf, potentialRange } from '../development/potential';
import { playerAbility } from '../transfers/valuation';

/**
 * Selectors: pure functions that join raw records (Player + PlayerAttributes
 * + Contract) into *view models*, the exact shape a screen needs. Screens
 * never do these joins themselves, so they stay simple and this logic is
 * testable without rendering anything.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function fullName(player: Pick<Player, 'firstName' | 'lastName'>): string {
  return `${player.firstName} ${player.lastName}`;
}

/** "Tom Hartley" → "T. Hartley" */
export function shortName(player: Pick<Player, 'firstName' | 'lastName'>): string {
  return `${player.firstName.charAt(0)}. ${player.lastName}`;
}

export function findClub(db: GameDatabase, clubId: ClubId): Club | undefined {
  return db.clubs.find((c) => c.id === clubId);
}

/** Players under contract at a club, with their attributes, ordered by squad number. */
export function selectSquadCandidates(db: GameDatabase, clubId: ClubId): LineupCandidate[] {
  const contracts = db.contracts
    .filter((c) => c.clubId === clubId)
    .sort((a, b) => a.squadNumber - b.squadNumber);
  const players = new Map(db.players.map((p) => [p.id, p]));
  const attributes = new Map(db.attributes.map((a) => [a.playerId, a]));

  return contracts.flatMap((contract) => {
    const player = players.get(contract.playerId);
    const attrs = attributes.get(contract.playerId);
    // A validated database always has both; skip rather than crash if not.
    return player && attrs ? [{ player, attributes: attrs }] : [];
  });
}

function squadNumbers(db: GameDatabase): Map<PlayerId, number> {
  return new Map(db.contracts.map((c) => [c.playerId, c.squadNumber]));
}

// ---------------------------------------------------------------------------
// Squad list
// ---------------------------------------------------------------------------

export type SquadPlayerView = {
  id: PlayerId;
  fullName: string;
  shortName: string;
  squadNumber: number | null;
  age: number;
  nationality: NationCode;
  primaryPosition: Position;
  secondaryPositions: readonly Position[];
  group: PositionGroup;
  /** Rounded 1–20 rating in their primary position. */
  rating: number;
  condition: PlayerCondition;
};

export type SquadGroupView = {
  group: PositionGroup;
  label: string;
  players: SquadPlayerView[];
};

export function selectSquad(db: GameDatabase, clubId: ClubId, onDate: string, condition?: ConditionState): SquadPlayerView[] {
  const numbers = squadNumbers(db);
  return selectSquadCandidates(db, clubId).map(({ player, attributes }) => ({
    id: player.id,
    fullName: fullName(player),
    shortName: shortName(player),
    squadNumber: numbers.get(player.id) ?? null,
    age: ageOn(player.dateOfBirth, onDate),
    nationality: player.nationality,
    primaryPosition: player.primaryPosition,
    secondaryPositions: player.secondaryPositions,
    group: POSITION_GROUP[player.primaryPosition],
    rating: Math.round(effectiveRating(player, attributes, player.primaryPosition)),
    condition: condition ? conditionOf(condition, player.id) : FULLY_FIT,
  }));
}

/** Groups players GK → DEF → MID → ATT; best-rated first within each group. Empty groups are dropped. */
export function groupSquad(players: readonly SquadPlayerView[]): SquadGroupView[] {
  return POSITION_GROUP_ORDER.map((group) => ({
    group,
    label: POSITION_GROUP_LABELS[group],
    players: players
      .filter((p) => p.group === group)
      .sort((a, b) => b.rating - a.rating || (a.squadNumber ?? 99) - (b.squadNumber ?? 99)),
  })).filter((g) => g.players.length > 0);
}

// ---------------------------------------------------------------------------
// Player profile
// ---------------------------------------------------------------------------

export type PlayerProfileView = {
  id: PlayerId;
  fullName: string;
  age: number;
  dateOfBirth: string;
  nationality: NationCode;
  heightCm: number;
  preferredFoot: PreferredFoot;
  primaryPosition: Position;
  secondaryPositions: readonly Position[];
  club: { id: ClubId; name: string; shortName: string } | null;
  contract: { squadNumber: number; weeklyWage: number; startDate: string; endDate: string } | null;
  /** Rating at each position they can play, primary first. */
  positionRatings: { position: Position; fit: PositionFit; rating: number }[];
  /** Attribute groups to show, in display order. Goalkeeping only appears for goalkeepers. */
  attributeGroups: { group: AttributeGroup; attributes: { key: AttributeKey; value: number }[] }[];
  condition: PlayerCondition;
  /** Rating in his main position and the potential range the viewer is told (narrower for their own players). */
  development: { rating: number; potential: string };
};

export function selectPlayerProfile(
  db: GameDatabase,
  playerId: PlayerId,
  onDate: string,
  condition?: ConditionState,
  viewerClubId?: ClubId,
): PlayerProfileView | null {
  const player = db.players.find((p) => p.id === playerId);
  const attributes = db.attributes.find((a) => a.playerId === playerId);
  if (!player || !attributes) return null;

  const contract = db.contracts.find((c) => c.playerId === playerId) ?? null;
  const club = contract ? findClub(db, contract.clubId) : undefined;
  const isGoalkeeper = player.primaryPosition === 'GK';
  const groups: AttributeGroup[] = isGoalkeeper
    ? ['goalkeeping', 'mental', 'physical', 'technical']
    : ['technical', 'mental', 'physical'];

  return {
    id: player.id,
    fullName: fullName(player),
    age: ageOn(player.dateOfBirth, onDate),
    dateOfBirth: player.dateOfBirth,
    nationality: player.nationality,
    heightCm: player.heightCm,
    preferredFoot: player.preferredFoot,
    primaryPosition: player.primaryPosition,
    secondaryPositions: player.secondaryPositions,
    club: club ? { id: club.id, name: club.name, shortName: club.shortName } : null,
    contract: contract
      ? {
          squadNumber: contract.squadNumber,
          weeklyWage: contract.weeklyWage,
          startDate: contract.startDate,
          endDate: contract.endDate,
        }
      : null,
    positionRatings: [player.primaryPosition, ...player.secondaryPositions].map((position) => ({
      position,
      fit: positionFit(player, position),
      rating: Math.round(effectiveRating(player, attributes, position)),
    })),
    attributeGroups: groups.map((group) => ({
      group,
      attributes: Object.entries(attributes[group]).map(([key, value]) => ({ key: key as AttributeKey, value })),
    })),
    condition: condition ? conditionOf(condition, player.id) : FULLY_FIT,
    development: (() => {
      const ability = playerAbility(player, attributes);
      const own = contract !== null && contract.clubId === viewerClubId;
      return { rating: Math.round(ability), potential: formatPotentialRange(potentialRange(player.id, potentialOf(player, attributes), ability, own)) };
    })(),
  };
}
