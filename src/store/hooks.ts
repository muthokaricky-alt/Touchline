import { useMemo } from 'react';

import type { PlayerId } from '@/data/schemas';
import {
  findClub,
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
