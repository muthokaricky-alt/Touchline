import { useRouter } from 'expo-router';
import { useMemo } from 'react';

import { ClubScreen } from '@/features/club/ClubScreen';
import { competitionName, leagueOfClub } from '@/game/season/season-flow';
import { fullName } from '@/game/squad/squad-selectors';
import { saveStatus, useSaveStatus } from '@/persistence/save-status';
import { useGameStore } from '@/store/game-store';
import { useTransferBudget, useUserClub } from '@/store/hooks';
import { formatCompactCurrency, formatDate, formatWeeklyWage } from '@/utils/format';

/** Route: club overview, transfers and the career save. */
export default function ClubRoute() {
  const router = useRouter();
  const club = useUserClub();
  const database = useGameStore((s) => s.database);
  const season = useGameStore((s) => s.season);
  const clubId = useGameStore((s) => s.userClubId);
  const transferHistory = useGameStore((s) => s.transferHistory);
  const startNewGame = useGameStore((s) => s.startNewGame);
  const budget = useTransferBudget();
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

  const history = useMemo(() => {
    const nameOf = (id: string) => {
      const p = database.players.find((x) => x.id === id);
      // Retired players leave the world (Milestone 9a); their old deals stay in the history.
      return p ? fullName(p) : 'Retired player';
    };
    const clubName = (id: string | null) => (id ? (database.clubs.find((c) => c.id === id)?.name ?? id) : 'free agency');
    return transferHistory
      .filter((t) => t.toClubId === clubId || t.fromClubId === clubId)
      .slice()
      .reverse()
      .map((t, i) => {
        const incoming = t.toClubId === clubId;
        const fee = t.fee ? formatCompactCurrency(t.fee) : 'free';
        return {
          key: `${t.playerId}-${t.date}-${i}`,
          title: nameOf(t.playerId),
          detail: incoming
            ? `From ${clubName(t.fromClubId)} · ${fee} · ${formatWeeklyWage(t.weeklyWage)} · ${formatDate(t.date)}`
            : `To ${clubName(t.toClubId)} · ${fee} · ${formatDate(t.date)}`,
          incoming,
        };
      });
  }, [transferHistory, database, clubId]);

  if (!info) return null;

  // Rendered only after the save has loaded (root layout gate), so using the
  // device clock here can't cause a static-web hydration mismatch.
  const lastSavedLabel = lastSavedAt
    ? `Last saved at ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;
  const { window } = budget;

  return (
    <ClubScreen
      club={info}
      transfers={{
        windowOpen: window.open,
        windowLabel: window.open
          ? `${window.name} window open until ${formatDate(window.closes)}`
          : `Window closed · opens ${formatDate(window.opensNext)} (free agents any time)`,
        wageBill: budget.wageBill,
        wageBudget: budget.wageBudget,
        squadSize: budget.squadSize,
        maxSquad: budget.maxSquad,
        history,
      }}
      save={{ lastSavedLabel, loadedFromSave, notice }}
      onOpenMarket={() => router.push('/transfers')}
      onStartNewGame={startNewGame}
      onDismissNotice={saveStatus.dismissNotice}
    />
  );
}
