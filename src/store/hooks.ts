import { useMemo } from 'react';

import type { ClubId, PlayerId } from '@/data/schemas';
import { buildAiTeam } from '@/game/ai/opponent';
import { lineupStrength } from '@/game/match/build-match-team';
import { competitionName, leagueOfClub, nextFixtureFor, roundLabel } from '@/game/season/season-flow';
import {
  findClub,
  fullName,
  groupSquad,
  selectPlayerProfile,
  selectSquad,
  selectSquadCandidates,
} from '@/game/squad/squad-selectors';
import { selectPlayerPicker, selectTeamSheet, type PickerTarget } from '@/game/squad/team-sheet';
import { analyseTactics } from '@/game/tactics/analysis';
import { matchPlayingStyle } from '@/game/tactics/presets';

import { useGameStore } from './game-store';

/**
 * React hooks that turn store state into view models.
 *
 * Pattern: subscribe to *raw* state slices (stable references), then build
 * the view model with useMemo. The view model is only rebuilt when one of
 * those slices actually changes. See the note in game-store.ts for why we
 * don't build objects inside the Zustand selector.
 */

export function useUserClub() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  return useMemo(() => findClub(database, clubId), [database, clubId]);
}

export function useSquadGroups() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const date = useGameStore((s) => s.currentDate);
  return useMemo(() => groupSquad(selectSquad(database, clubId, date)), [database, clubId, date]);
}

export function usePlayerProfile(playerId: PlayerId) {
  const database = useGameStore((s) => s.database);
  const date = useGameStore((s) => s.currentDate);
  return useMemo(() => selectPlayerProfile(database, playerId, date), [database, playerId, date]);
}

export function useTeamSheet() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const lineup = useGameStore((s) => s.lineup);
  return useMemo(() => selectTeamSheet(database, clubId, lineup), [database, clubId, lineup]);
}

/** Other clubs in the user's league this season, strongest first: friendly opponents. */
export function useLeagueOpponents() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const season = useGameStore((s) => s.season);
  return useMemo(() => {
    const leagueId = leagueOfClub(season, clubId);
    const members = new Set(season.leagues.find((l) => l.competitionId === leagueId)?.clubIds ?? []);
    return database.clubs
      .filter((c) => c.id !== clubId && members.has(c.id))
      .sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, reputation: c.reputation }));
  }, [database, clubId, season]);
}

/** How the AI opponent would line up against the user's current XI (formation + style), or null. */
export function useOpponentPreview(opponentId: ClubId | null) {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const lineup = useGameStore((s) => s.lineup);
  return useMemo(() => {
    if (!opponentId) return null;
    const ai = buildAiTeam(database, opponentId, lineupStrength(lineup, selectSquadCandidates(database, clubId)));
    return `${ai.lineup.formationId} · ${matchPlayingStyle(ai.tactics)?.name ?? 'Custom'}`;
  }, [database, clubId, lineup, opponentId]);
}

/** The user's next fixture in any competition, shaped for the pre-match screen, or null when they have none left. */
export function useNextFixture() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const season = useGameStore((s) => s.season);
  return useMemo(() => {
    const fixture = nextFixtureFor(season, clubId);
    if (!fixture) return null;
    const nameOf = (id: ClubId) => findClub(database, id)?.name ?? id;
    const venue = fixture.homeId === clubId ? ('home' as const) : ('away' as const);
    return {
      fixtureId: fixture.id,
      competitionName: competitionName(database, fixture.competitionId),
      isCup: fixture.competitionId === season.cupId,
      roundLabel: roundLabel(season, fixture),
      date: fixture.date,
      venue,
      opponentId: venue === 'home' ? fixture.awayId : fixture.homeId,
      homeName: nameOf(fixture.homeId),
      awayName: nameOf(fixture.awayId),
    };
  }, [database, clubId, season]);
}

/** Lookup from player id to full name, for commentary and ratings. */
export function usePlayerNames() {
  const database = useGameStore((s) => s.database);
  return useMemo(() => {
    const names = new Map(database.players.map((p) => [p.id, fullName(p)]));
    return (id: PlayerId) => names.get(id) ?? 'Unknown player';
  }, [database]);
}

/** Current tactics, the playing style they match (null = custom) and the assistant's notes. */
export function useTacticsView() {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const lineup = useGameStore((s) => s.lineup);
  const tactics = useGameStore((s) => s.tactics);
  return useMemo(
    () => ({
      tactics,
      style: matchPlayingStyle(tactics),
      notes: analyseTactics(tactics, lineup, selectSquadCandidates(database, clubId)),
    }),
    [database, clubId, lineup, tactics],
  );
}

export function usePlayerPicker(target: PickerTarget | null) {
  const database = useGameStore((s) => s.database);
  const clubId = useGameStore((s) => s.userClubId);
  const lineup = useGameStore((s) => s.lineup);
  return useMemo(
    () => (target ? selectPlayerPicker(database, clubId, lineup, target) : null),
    [database, clubId, lineup, target],
  );
}
