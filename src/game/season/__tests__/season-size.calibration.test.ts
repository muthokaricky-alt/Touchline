import { buildFictionalDatabase } from '@/data/fictional';
import { compress } from '@/persistence/slot-storage';

import { cupFixtures, cupWinner } from '../cup';
import { createSeason, leagueTable, playRemaining, startNextSeason, totalMatchdays } from '../season-flow';
import { daysBetween } from '@/utils/date';

/**
 * A whole season in the FULL world (England + the leagues abroad), played
 * out: is it small enough to save? Slow (a few seconds), so it runs with
 * `npm run test:calibration` / `test:all`.
 */
describe('a full season in the full world', () => {
  const db = buildFictionalDatabase();
  const finished = playRemaining(db, createSeason(db, 2026, 99)).season;

  it('keeps a season small enough to save', () => {
    // ~2.4 MB of JSON with the leagues abroad (was ~0.9 MB); saves are compressed (persistence/slot-storage),
    // which is what's measured here: ~205 KB.
    const json = JSON.stringify(finished);
    expect(json.length).toBeLessThan(3_000_000);
    expect(compress(json).length).toBeLessThan(350_000);
  });

  it('plays every cup abroad to a final after its league ends, with a winner from that country', () => {
    for (const cup of finished.cups.filter((c) => c.competitionId !== 'comp_national_cup' && c.competitionId !== 'comp_continental_cup')) {
      const league = finished.leagues.find((l) => l.competitionId === cup.entrantLeagues[0])!;
      const rounds = cupFixtures(finished, cup.competitionId);
      expect(rounds).toHaveLength(2 + 8 + 4 + 2 + 1); // first round, 16, quarter-finals, semis, final
      const lastLeagueDate = finished.fixtures.filter((f) => f.competitionId === league.competitionId).map((f) => f.date).sort().at(-1)!;
      expect(rounds.find((f) => f.matchday === 5)!.date > lastLeagueDate).toBe(true);
      expect(totalMatchdays(finished, league.competitionId)).toBe(34);
      expect(league.clubIds).toContain(cupWinner(finished, cup.competitionId));
    }
  });

  it('plays the Continental Cup to a winner, and no club ever plays twice within two days', () => {
    expect(cupWinner(finished, 'comp_continental_cup')).not.toBeNull();
    expect(cupFixtures(finished, 'comp_continental_cup')).toHaveLength(72 + 8 + 4 + 2 + 1); // groups, R16, QF, SF, final
    const dates = new Map<string, string[]>();
    for (const f of finished.fixtures) for (const id of [f.homeId, f.awayId]) dates.set(id, [...(dates.get(id) ?? []), f.date]);
    for (const list of dates.values()) {
      const sorted = [...list].sort();
      for (let i = 1; i < sorted.length; i++) expect(daysBetween(sorted[i - 1], sorted[i])).toBeGreaterThanOrEqual(3);
    }
  });

  it('qualifies next season’s Continental Cup from the final tables', () => {
    const next = startNextSeason(db, finished);
    const cup = next.cups.find((c) => c.competitionId === 'comp_continental_cup')!;
    for (const leagueId of cup.entrantLeagues) {
      const top4 = leagueTable(db, finished, leagueId).slice(0, 4).map((r) => r.clubId);
      expect(cup.entrants!.filter((id) => top4.includes(id)).sort()).toEqual([...top4].sort());
    }
    // Champions first.
    const champions = cup.entrantLeagues.map((id) => leagueTable(db, finished, id)[0].clubId);
    expect(cup.entrants!.slice(0, champions.length)).toEqual(champions);
  });

  it('plays every league to the end, abroad too', () => {
    expect(finished.fixtures.every((f) => f.result)).toBe(true);
    expect(finished.fixtures.filter((f) => f.competitionId === 'comp_spain_premier')).toHaveLength(306);
  });
});
