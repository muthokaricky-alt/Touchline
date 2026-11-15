import type { ClubId, CompetitionId } from '@/data/schemas';
import { addDays, nextWeekday } from '@/utils/date';
import { createRng } from '@/utils/random';

import type { Fixture } from './season';

/**
 * Fixture generation with the "polygon" (circle) method: clubs 0..n−2 sit on
 * a polygon that rotates one step per round, club n−1 sits in the middle.
 * With n clubs this gives n−1 rounds in which everyone meets everyone once.
 *
 * Venues: the middle club alternates home/away every round; for the other
 * pairs, the venue depends on the pair's index. This gives each club at most
 * 2 consecutive home (or away) games, the minimum possible.
 *
 * Later legs repeat the round-robin with venues swapped, *rotated by one
 * round*. Without the rotation a club could get 3 in a row where the two
 * halves meet; reversing the order instead would put the same fixture on
 * back-to-back weekends. (Both checked with a probe across league sizes.)
 */

export type Pairing = { home: ClubId; away: ClubId };

/** One round-robin: n−1 rounds of n/2 pairings. An odd count gets a "bye" (that club rests). */
export function singleRoundRobin(clubIds: readonly ClubId[]): Pairing[][] {
  const teams: (ClubId | null)[] = [...clubIds];
  if (teams.length % 2 === 1) teams.push(null); // bye
  const n = teams.length;
  const rounds: Pairing[][] = [];

  for (let round = 0; round < n - 1; round++) {
    const pairings: Pairing[] = [];
    for (let match = 0; match < n / 2; match++) {
      let home = (round + match) % (n - 1);
      let away = match === 0 ? n - 1 : (n - 1 - match + round) % (n - 1);
      const swap = match === 0 ? round % 2 === 1 : match % 2 === 1;
      if (swap) [home, away] = [away, home];
      const homeClub = teams[home];
      const awayClub = teams[away];
      if (homeClub !== null && awayClub !== null) pairings.push({ home: homeClub, away: awayClub });
    }
    rounds.push(pairings);
  }
  return rounds;
}

/** Full league schedule: `roundsPerOpponent` legs; odd legs swap venues; each leg is rotated one round further. */
export function leagueRounds(clubIds: readonly ClubId[], roundsPerOpponent: number): Pairing[][] {
  const single = singleRoundRobin(clubIds);
  const all: Pairing[][] = [];
  for (let leg = 0; leg < roundsPerOpponent; leg++) {
    const shift = leg % single.length;
    const ordered = [...single.slice(shift), ...single.slice(0, shift)];
    for (const round of ordered) {
      all.push(leg % 2 === 0 ? round : round.map(({ home, away }) => ({ home: away, away: home })));
    }
  }
  return all;
}

/** League matches are on Saturdays, weekly, starting the first Saturday on/after 8 August. */
export function seasonStartDate(startYear: number): string {
  return nextWeekday(`${startYear}-08-08`, 6);
}

export type ScheduleOptions = {
  competitionId: CompetitionId;
  clubIds: readonly ClubId[];
  roundsPerOpponent: number;
  startYear: number;
  /** Shuffles club order, so each season's fixture list differs. */
  seed: number;
};

export function scheduleLeague({ competitionId, clubIds, roundsPerOpponent, startYear, seed }: ScheduleOptions): Fixture[] {
  const rng = createRng(seed);
  // Fisher–Yates shuffle with the seeded RNG: deterministic for a given seed.
  const order = [...clubIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }

  const start = seasonStartDate(startYear);
  const shortYear = String(startYear % 100).padStart(2, '0');
  return leagueRounds(order, roundsPerOpponent).flatMap((round, index) =>
    round.map((pairing, slot) => ({
      id: `fx_${competitionId.replace(/^comp_/, '')}_${shortYear}_${String(index + 1).padStart(2, '0')}_${slot + 1}`,
      competitionId,
      matchday: index + 1,
      date: addDays(start, index * 7),
      homeId: pairing.home,
      awayId: pairing.away,
      result: null,
    })),
  );
}
