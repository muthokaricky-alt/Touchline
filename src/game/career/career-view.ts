import { HOME_COUNTRY } from '@/data/fictional';
import type { ClubId, GameDatabase } from '@/data/schemas';

import { aiSetup } from '../ai/opponent';
import type { Season } from '../season/season';
import { competitionName } from '../season/season-flow';
import { seasonEnd } from './career-flow';
import { boardExpectation, SACK_THRESHOLD, WARNING_THRESHOLD, type Manager } from './manager';

/** View models for the career screens (new career, board, job offers, history). */

export type ClubChoiceView = {
  id: ClubId;
  name: string;
  reputation: number;
  /** Average rating of the best XI, 1 decimal. */
  squadRating: number;
  expectation: string;
};

export type LeagueChoicesView = { leagueName: string; clubs: ClubChoiceView[] };

/** Every club in the home country, grouped by league (top tier first), strongest first: what a new manager can choose from. */
export function selectCareerChoices(db: GameDatabase, season: Season): LeagueChoicesView[] {
  const home = (competitionId: string) => db.competitions.find((c) => c.id === competitionId)?.country === HOME_COUNTRY;
  return season.leagues
    .filter((membership) => home(membership.competitionId))
    .map((membership) => ({ membership, tier: boardExpectation(db, season, membership.clubIds[0])?.tier ?? 9 }))
    .sort((a, b) => a.tier - b.tier)
    .map(({ membership }) => ({
      leagueName: competitionName(db, membership.competitionId),
      clubs: membership.clubIds
        .map((id) => {
          const club = db.clubs.find((c) => c.id === id)!;
          return {
            id,
            name: club.name,
            reputation: club.reputation,
            squadRating: Math.round(aiSetup(db, id).strength * 10) / 10,
            expectation: boardExpectation(db, season, id)?.label ?? '',
          };
        })
        .sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name)),
    }));
}

export type JobOfferView = { clubId: ClubId; name: string; leagueName: string; reputation: number; expectation: string };

export function jobOfferViews(db: GameDatabase, season: Season, clubIds: readonly ClubId[]): JobOfferView[] {
  return clubIds.map((clubId) => {
    const club = db.clubs.find((c) => c.id === clubId)!;
    const expectation = boardExpectation(db, season, clubId);
    return { clubId, name: club.name, leagueName: expectation?.leagueName ?? '', reputation: club.reputation, expectation: expectation?.label ?? '' };
  });
}

export type BoardView = {
  managerName: string;
  reputation: number;
  expectation: string;
  /** 0–100 */
  confidence: number;
  mood: { label: string; tone: 'accent' | 'neutral' | 'warning' | 'danger' };
  /** After a mid-season sacking: the clubs he can choose from. */
  sackedOffers: JobOfferView[] | null;
};

export function boardMood(confidence: number): BoardView['mood'] {
  if (confidence >= 70) return { label: 'Delighted', tone: 'accent' };
  if (confidence >= 50) return { label: 'Satisfied', tone: 'neutral' };
  if (confidence >= WARNING_THRESHOLD) return { label: 'Concerned', tone: 'warning' };
  if (confidence >= SACK_THRESHOLD) return { label: 'Under pressure', tone: 'danger' };
  return { label: 'Job at risk', tone: 'danger' };
}

export function selectBoardView(db: GameDatabase, season: Season, clubId: ClubId, manager: Manager): BoardView {
  return {
    managerName: manager.name,
    reputation: manager.reputation,
    expectation: boardExpectation(db, season, clubId)?.label ?? '',
    confidence: manager.confidence,
    mood: boardMood(manager.confidence),
    sackedOffers: manager.sackedOffers ? jobOfferViews(db, season, manager.sackedOffers) : null,
  };
}

export type SeasonEndView = {
  verdict: string;
  target: string;
  reputationChange: number;
  sacked: boolean;
  offers: JobOfferView[];
};

/** The season review and job offers, for the season-complete card. Null mid-season or before a career. */
export function selectSeasonEndView(db: GameDatabase, season: Season, clubId: ClubId, manager: Manager | null): SeasonEndView | null {
  if (!manager) return null;
  const end = seasonEnd(db, season, clubId, manager);
  if (!end) return null;
  return {
    verdict: end.review.sacked ? 'The board has decided to let you go.' : end.review.verdict,
    target: end.review.expectation.label,
    reputationChange: end.review.reputationChange,
    sacked: end.review.sacked,
    offers: jobOfferViews(db, season, end.offers),
  };
}
