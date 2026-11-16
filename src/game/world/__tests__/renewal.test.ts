import { buildFictionalDatabase, FICTIONAL_REFERENCE_DATE, FICTIONAL_SEED } from '@/data/fictional';
import { checkIntegrity } from '@/data/integrity';
import { PlayerSchema } from '@/data/schemas';
import { assignPotential } from '@/game/development/potential';
import { autoPickLineup, starterIds } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import type { TransferCareer } from '@/game/transfers/career';
import { ageOn } from '@/utils/date';

import {
  admitIntake,
  AI_KEEPS,
  FIRST_INTAKE_YEAR,
  generatedIntake,
  intakePlayerNumber,
  quitChance,
  retirementChance,
  retirePlayers,
  worldFor,
} from '../renewal';
import { admitIntakeToCareer, retireFromCareer } from '../renewal-career';

const base = assignPotential(buildFictionalDatabase(), FICTIONAL_SEED, FICTIONAL_REFERENCE_DATE);
const USER = 'club_greywater_town';

describe('youth intakes', () => {
  const intake = generatedIntake(base.clubs, FICTIONAL_SEED, FIRST_INTAKE_YEAR);

  it('gives every club 2–4 valid 16–17-year-olds with potential', () => {
    expect(intake).toHaveLength(base.clubs.length);
    for (const club of intake) {
      expect(club.players.length).toBeGreaterThanOrEqual(2);
      expect(club.players.length).toBeLessThanOrEqual(4);
      for (const p of club.players) {
        expect(PlayerSchema.safeParse(p).success).toBe(true);
        expect([16, 17]).toContain(ageOn(p.dateOfBirth, `${FIRST_INTAKE_YEAR}-07-01`));
        expect(p.potential).toBeDefined();
      }
    }
  });

  it('is regenerated identically from the seed (the save relies on it)', () => {
    const fresh = buildFictionalDatabase();
    const again = generatedIntake(fresh.clubs, FICTIONAL_SEED, FIRST_INTAKE_YEAR);
    expect(again).toEqual(intake);
    expect(worldFor(base, FICTIONAL_SEED, 2029).players.length).toBe(
      base.players.length + [2027, 2028, 2029].reduce((n, y) => n + generatedIntake(base.clubs, FICTIONAL_SEED, y).flatMap((c) => c.players).length, 0),
    );
  });

  it('uses ids that never collide with the base world', () => {
    const ids = new Set(base.players.map((p) => p.id));
    for (const p of intake.flatMap((c) => c.players)) expect(ids.has(p.id)).toBe(false);
    expect(intakePlayerNumber(2027, 3, 2)).toBe(127_032);
  });

  it('bigger clubs produce better youngsters on average', () => {
    const avgPotential = (clubIds: string[]) => {
      const ps = intake.filter((c) => clubIds.includes(c.clubId)).flatMap((c) => c.players);
      return ps.reduce((s, p) => s + p.potential!, 0) / ps.length;
    };
    const byRep = [...base.clubs].sort((a, b) => b.reputation - a.reputation);
    expect(avgPotential(byRep.slice(0, 10).map((c) => c.id))).toBeGreaterThan(avgPotential(byRep.slice(-10).map((c) => c.id)));
  });

  it('AI clubs keep their best prospects; the user signs everyone with room', () => {
    const outcome = admitIntake(base, FICTIONAL_SEED, FIRST_INTAKE_YEAR, USER);
    const userIntake = intake.find((c) => c.clubId === USER)!.players.map((p) => p.id);
    expect(outcome.userSigned.sort()).toEqual(userIntake.sort());
    const other = intake.find((c) => c.clubId !== USER)!;
    const kept = other.players.filter((p) => outcome.db.contracts.some((c) => c.playerId === p.id));
    expect(kept.length).toBe(AI_KEEPS);
    const best = [...other.players].sort((a, b) => b.potential! - a.potential!).slice(0, AI_KEEPS).map((p) => p.id);
    expect(kept.map((p) => p.id).sort()).toEqual(best.sort());
    expect(checkIntegrity(outcome.db)).toEqual([]);
  });
});

describe('retirement', () => {
  it('rises with age and comes sooner for weaker players', () => {
    expect(retirementChance(32, 12)).toBe(0);
    expect(retirementChance(35, 12)).toBeGreaterThan(retirementChance(34, 12));
    expect(retirementChance(35, 8)).toBeGreaterThan(retirementChance(35, 16));
    expect(quitChance(7, 25)).toBeGreaterThan(quitChance(12, 25));
  });

  it('removes retired players from the world completely', () => {
    const { db, leavers } = retirePlayers(base, FICTIONAL_SEED, FIRST_INTAKE_YEAR);
    expect(leavers.length).toBeGreaterThan(0);
    const gone = new Set(leavers.map((l) => l.playerId));
    expect(db.players.some((p) => gone.has(p.id))).toBe(false);
    expect(db.contracts.some((c) => gone.has(c.playerId))).toBe(false);
    expect(checkIntegrity(db)).toEqual([]);
    for (const l of leavers.filter((x) => x.reason === 'retired')) {
      expect(ageOn(base.players.find((p) => p.id === l.playerId)!.dateOfBirth, `${FIRST_INTAKE_YEAR}-07-01`)).toBeGreaterThanOrEqual(33);
    }
  });
});

describe('from the user career', () => {
  const lineup = autoPickLineup(selectSquadCandidates(base, USER), '4-4-2');
  const career: TransferCareer = { db: base, userClubId: USER, date: '2027-07-01', lineup, transferListed: [], offers: [], inbox: [], transferHistory: [] };

  it('reports the intake in the inbox', () => {
    const next = admitIntakeToCareer(career, FICTIONAL_SEED, FIRST_INTAKE_YEAR);
    expect(next.inbox[0].from).toBe('Head of Youth Development');
    expect(next.inbox[0].title).toMatch(/Youth intake: \d academy player/);
    expect(next.inbox[0].body).toMatch(/potential/);
  });

  it("refills the lineup when the user's players retire", () => {
    // Fifteen summers on, almost everyone in the original squad has retired.
    const later = retireFromCareer(career, FICTIONAL_SEED, 2041);
    const own = new Set(later.career.db.contracts.filter((c) => c.clubId === USER).map((c) => c.playerId));
    for (const id of [...starterIds(later.career.lineup), ...later.career.lineup.substitutes]) if (id) expect(own.has(id)).toBe(true);
  });
});
