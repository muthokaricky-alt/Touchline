import { buildFictionalDatabase } from '@/data/fictional';
import type { ConditionState } from '@/game/condition/condition';
import { starterIds } from '@/game/lineup';
import { buildFixtureInput, createSeason, nextDate, playDate } from '@/game/season/season-flow';

import { bansFrom, type BanReason, suspendedFor } from '../suspensions';

/**
 * A whole AI season (40 clubs, two leagues and the cup): how often bans
 * happen, and that no banned player is ever picked. Bans per club should be
 * a handful a season, like real football, or squads of 22 can't cope.
 */
describe('suspensions over a full season', () => {
  const db = buildFictionalDatabase();
  let season = createSeason(db, 2026, 2024);
  let condition: ConditionState | undefined;
  let violations = 0;
  let suspendedSelections = 0;

  for (let date = nextDate(season); date !== null; date = nextDate(season)) {
    for (const f of season.fixtures) {
      if (f.date !== date || f.result) continue;
      const banned = suspendedFor(season, f);
      const input = buildFixtureInput(db, season, f, undefined, condition);
      for (const side of [input.home, input.away]) {
        const picked = [...starterIds(side.lineup), ...side.lineup.substitutes];
        violations += picked.filter((id) => banned.has(id)).length;
        suspendedSelections += side.squad.filter((c) => banned.has(c.player.id)).length;
      }
    }
    const played = playDate(db, season, date, undefined, condition);
    season = played.season;
    condition = played.condition;
  }

  const bans = season.fixtures.flatMap((f) => bansFrom(season, f.id));
  const byReason = (reason: BanReason) => bans.filter((b) => b.reason === reason).length;
  const clubs = db.clubs.length;

  it('never selects a suspended player', () => {
    console.log(
      `Bans per club per season: ${(bans.length / clubs).toFixed(1)} ` +
        `(second yellow ${(byReason('second-yellow') / clubs).toFixed(1)}, red ${(byReason('red') / clubs).toFixed(1)}, ` +
        `yellows ${(byReason('yellows') / clubs).toFixed(1)}); banned squad players at kick-off: ${suspendedSelections}`,
    );
    expect(suspendedSelections).toBeGreaterThan(0); // bans did happen to players who'd otherwise be available
    expect(violations).toBe(0);
  });

  it('gives each club a handful of bans a season', () => {
    const perClub = bans.length / clubs;
    // Measured 6.9 with seed 2024 (real top-flight clubs: roughly 5–8).
    expect(perClub).toBeGreaterThan(4);
    expect(perClub).toBeLessThan(9);
    expect(byReason('yellows')).toBeGreaterThan(0);
    expect(byReason('red')).toBeGreaterThan(0);
  });
});
