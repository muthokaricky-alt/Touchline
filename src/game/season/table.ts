import type { ClubId, League } from '@/data/schemas';
import type { MatchOutcome } from '@/types/football';

import type { Fixture } from './season';

/**
 * League table from fixture results. Pure: the table is never stored; it's
 * always recomputed from results, so it can't drift out of sync with them.
 *
 * Order: points → goal difference → goals scored → head-to-head points
 * between the tied clubs → club id (a stable last resort; real leagues
 * would hold a play-off).
 */

export type TableZone = 'champion' | 'promotion' | 'relegation';

export type TableRow = {
  position: number;
  clubId: ClubId;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Last 5 results, oldest first. */
  form: MatchOutcome[];
  zone: TableZone | null;
};

type Tally = Omit<TableRow, 'position' | 'zone' | 'form'> & { results: MatchOutcome[] };

export function computeTable(fixtures: readonly Fixture[], league: League): TableRow[] {
  const { win, draw, loss } = league.rules.points;
  const tallies = new Map<ClubId, Tally>(
    league.clubIds.map((clubId) => [
      clubId,
      { clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, results: [] },
    ]),
  );

  const played = fixtures
    .filter((f) => f.competitionId === league.id && f.result)
    .sort((a, b) => a.matchday - b.matchday);

  for (const fixture of played) {
    const { home: homeGoals, away: awayGoals } = fixture.result!.score;
    const record = (clubId: ClubId, scored: number, conceded: number) => {
      const t = tallies.get(clubId);
      if (!t) return;
      t.played++;
      t.goalsFor += scored;
      t.goalsAgainst += conceded;
      t.goalDifference = t.goalsFor - t.goalsAgainst;
      const outcome: MatchOutcome = scored > conceded ? 'W' : scored === conceded ? 'D' : 'L';
      t.results.push(outcome);
      if (outcome === 'W') {
        t.won++;
        t.points += win;
      } else if (outcome === 'D') {
        t.drawn++;
        t.points += draw;
      } else {
        t.lost++;
        t.points += loss;
      }
    };
    record(fixture.homeId, homeGoals, awayGoals);
    record(fixture.awayId, awayGoals, homeGoals);
  }

  const sorted = sortWithTiebreakers([...tallies.values()], played, league);
  const n = sorted.length;
  return sorted.map(({ results, ...t }, index) => ({
    ...t,
    position: index + 1,
    form: results.slice(-5),
    zone: zoneFor(index + 1, n, league),
  }));
}

function sortWithTiebreakers(tallies: Tally[], played: readonly Fixture[], league: League): Tally[] {
  const primary = (a: Tally, b: Tally) =>
    b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;
  const sorted = [...tallies].sort((a, b) => primary(a, b) || (a.clubId < b.clubId ? -1 : 1));

  // Resolve groups still level on points, GD and GF by head-to-head.
  const result: Tally[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && primary(sorted[i], sorted[j]) === 0) j++;
    const group = sorted.slice(i, j);
    if (group.length > 1) {
      const h2h = headToHeadPoints(group.map((t) => t.clubId), played, league);
      group.sort((a, b) => (h2h.get(b.clubId) ?? 0) - (h2h.get(a.clubId) ?? 0) || (a.clubId < b.clubId ? -1 : 1));
    }
    result.push(...group);
    i = j;
  }
  return result;
}

/** Points each club earned in matches between clubs of `group` only. */
export function headToHeadPoints(group: readonly ClubId[], played: readonly Fixture[], league: League): Map<ClubId, number> {
  const members = new Set(group);
  const points = new Map<ClubId, number>(group.map((id) => [id, 0]));
  const { win, draw, loss } = league.rules.points;
  for (const f of played) {
    if (!f.result || !members.has(f.homeId) || !members.has(f.awayId)) continue;
    const { home, away } = f.result.score;
    points.set(f.homeId, points.get(f.homeId)! + (home > away ? win : home === away ? draw : loss));
    points.set(f.awayId, points.get(f.awayId)! + (away > home ? win : home === away ? draw : loss));
  }
  return points;
}

export function zoneFor(position: number, clubCount: number, league: League): TableZone | null {
  const { promotionPlaces, relegationPlaces } = league.rules;
  if (position === 1 && league.tier === 1) return 'champion';
  if (position <= promotionPlaces) return 'promotion';
  if (position > clubCount - relegationPlaces) return 'relegation';
  return null;
}
