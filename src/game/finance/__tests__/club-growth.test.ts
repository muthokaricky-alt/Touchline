import { buildFictionalDatabase } from '@/data/fictional';
import { cupWinner } from '@/game/season/cup';
import type { Season } from '@/game/season/season';
import { createSeason, leagueForSeason, playRemaining } from '@/game/season/season-flow';
import { computeTable } from '@/game/season/table';

import { clubGrowth, growthMessage, MAX_GAIN, MAX_REPUTATION, type ClubGrowth } from '../club-growth';

describe('club growth after a season', () => {
  const db = buildFictionalDatabase();
  let season: Season;
  let result: ClubGrowth;

  // Plays a whole season of the full world, which takes a while.
  beforeAll(() => {
    season = playRemaining(db, createSeason(db, 2026, 77)).season;
    result = clubGrowth(db, season);
  }, 180_000);

  const before = (id: string) => db.clubs.find((c) => c.id === id)!;
  const after = (id: string) => result.db.clubs.find((c) => c.id === id)!;

  it('raises the reputation of every top-division champion that can still grow', () => {
    for (const membership of season.leagues) {
      const league = leagueForSeason(db, season, membership.competitionId);
      if (league.tier !== 1) continue;
      const champion = computeTable(season.fixtures, league)[0].clubId;
      expect(after(champion).reputation).toBe(Math.min(MAX_REPUTATION, before(champion).reputation + 1 + (cupWinner(season, 'comp_continental_cup') === champion ? 1 : 0)));
    }
  });

  it('never gains more than the cap in a season, and keeps reputation between 1 and 20', () => {
    for (const club of result.db.clubs) {
      expect(club.reputation).toBeGreaterThanOrEqual(1);
      expect(club.reputation).toBeLessThanOrEqual(MAX_REPUTATION);
      expect(club.reputation - before(club.id).reputation).toBeLessThanOrEqual(MAX_GAIN);
    }
  });

  it('grows the stadium of a club that rises, and never shrinks anyone', () => {
    for (const [id, change] of result.changes) {
      expect(after(id).stadium.capacity).toBe(change.capacityAfter);
      if (change.reputationAfter > change.reputationBefore) expect(change.capacityAfter).toBeGreaterThanOrEqual(change.capacityBefore);
      else expect(change.capacityAfter).toBe(change.capacityBefore);
    }
    for (const club of result.db.clubs) expect(club.stadium.capacity).toBeGreaterThanOrEqual(before(club.id).stadium.capacity);
  });

  it('changes nothing but reputation and stadium capacity', () => {
    expect(result.db.players).toBe(db.players);
    for (const club of result.db.clubs) {
      const old = before(club.id);
      expect({ ...club, reputation: 0, stadium: 0 }).toEqual({ ...old, reputation: 0, stadium: 0 });
    }
  });

  it('writes the chairman a message when the club moves', () => {
    const [id, change] = [...result.changes.entries()].find(([, c]) => c.reputationAfter > c.reputationBefore)!;
    const msg = growthMessage(change, before(id).name, season.label, '2027-06-30')!;
    expect(msg.from).toBe('Chairman');
    expect(msg.body).toContain(String(change.reputationAfter));
    expect(growthMessage(undefined, 'X', season.label, '2027-06-30')).toBeNull();
  });
});
