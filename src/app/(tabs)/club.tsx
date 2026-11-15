import { useMemo } from 'react';

import { ClubScreen } from '@/features/club/ClubScreen';
import { competitionName, leagueOfClub } from '@/game/season/season-flow';
import { saveStatus, useSaveStatus } from '@/persistence/save-status';
import { useGameStore } from '@/store/game-store';
import { useUserClub } from '@/store/hooks';

/** Route: club overview and the career save. */
export default function ClubRoute() {
  const club = useUserClub();
  const database = useGameStore((s) => s.database);
  const season = useGameStore((s) => s.season);
  const clubId = useGameStore((s) => s.userClubId);
  const startNewGame = useGameStore((s) => s.startNewGame);
  const { lastSavedAt, loadedFromSave, notice } = useSaveStatus();

  const leagueId = leagueOfClub(season, clubId);
  const info = useMemo(
    () =>
      club
        ? {
            name: club.name,
            city: club.city,
            founded: club.founded,
            reputation: club.reputation,
            leagueName: leagueId ? competitionName(database, leagueId) : '',
            stadiumName: club.stadium.name,
            capacity: club.stadium.capacity,
            balance: club.finances.balance,
            transferBudget: club.finances.transferBudget,
            weeklyWageBudget: club.finances.weeklyWageBudget,
          }
        : null,
    [club, leagueId, database],
  );
  if (!info) return null;

  // Rendered only after the save has loaded (root layout gate), so using the
  // device clock here can't cause a static-web hydration mismatch.
  const lastSavedLabel = lastSavedAt
    ? `Last saved at ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;

  return (
    <ClubScreen
      club={info}
      save={{ lastSavedLabel, loadedFromSave, notice }}
      onStartNewGame={startNewGame}
      onDismissNotice={saveStatus.dismissNotice}
    />
  );
}
