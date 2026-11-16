import { buildFictionalDatabase, FICTIONAL_REFERENCE_DATE, FICTIONAL_SEED } from '@/data/fictional';
import { assignPotential, potentialOf, potentialRange } from '@/game/development/potential';
import { playerAbility } from '@/game/transfers/valuation';
import { addDays } from '@/utils/date';

import {
  assignmentViews,
  cancelAssignment,
  deliverReports,
  EMPTY_SCOUTING,
  knowledgeOf,
  REPORT_DAYS,
  scoutingProblem,
  scoutingStatus,
  SCOUTS,
  startAssignment,
  withoutMissingPlayers,
} from '../scouting';

const db = assignPotential(buildFictionalDatabase(), FICTIONAL_SEED, FICTIONAL_REFERENCE_DATE);
const USER = 'club_greywater_town';
const TODAY = '2026-08-01';
const others = db.contracts.filter((c) => c.clubId !== USER).map((c) => c.playerId);
const own = db.contracts.find((c) => c.clubId === USER)!.playerId;
const target = others[0];

describe('scouting', () => {
  it('starts with nothing known about other clubs’ players, and your own players known to your coaches', () => {
    expect(knowledgeOf(EMPTY_SCOUTING, db, USER, target)).toBe(0);
    expect(knowledgeOf(EMPTY_SCOUTING, db, USER, own)).toBe(1);
    expect(scoutingProblem(EMPTY_SCOUTING, db, USER, own)).toMatch(/one of your players/);
  });

  it('a report arrives REPORT_DAYS later and narrows the range; a second report is exact', () => {
    let state = startAssignment(EMPTY_SCOUTING, db, USER, target, TODAY);
    expect(state.assignments).toEqual([{ playerId: target, started: TODAY, due: addDays(TODAY, REPORT_DAYS) }]);

    // Not yet due: nothing happens.
    expect(deliverReports(state, db, USER, addDays(TODAY, REPORT_DAYS - 1))).toEqual({ state, messages: [] });

    const first = deliverReports(state, db, USER, addDays(TODAY, 20));
    state = first.state;
    expect(state.assignments).toEqual([]);
    expect(knowledgeOf(state, db, USER, target)).toBe(1);
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0]).toMatchObject({ category: 'scouting', from: 'Chief Scout', date: addDays(TODAY, REPORT_DAYS) });
    expect(first.messages[0].body).toMatch(/potential \d+(–\d+)?\. .*Send a scout again for a full report\./);

    state = deliverReports(startAssignment(state, db, USER, target, '2026-09-01'), db, USER, '2026-10-01').state;
    expect(knowledgeOf(state, db, USER, target)).toBe(2);
    expect(scoutingProblem(state, db, USER, target)).toMatch(/full report/);

    // The range the user sees: wide → narrow → exact, always containing the truth.
    const p = db.players.find((x) => x.id === target)!;
    const a = db.attributes.find((x) => x.playerId === target)!;
    const widths = ([0, 1, 2] as const).map((k) => {
      const r = potentialRange(target, potentialOf(p, a), playerAbility(p, a), k);
      return r.high - r.low;
    });
    expect(widths[2]).toBe(0);
    expect(widths[1]).toBeLessThanOrEqual(2);
    expect(widths[0]).toBeGreaterThanOrEqual(widths[1]);
  });

  it(`has ${SCOUTS} scouts, one assignment per player, and lets you call one back`, () => {
    let state = EMPTY_SCOUTING;
    for (const id of others.slice(0, SCOUTS)) state = startAssignment(state, db, USER, id, TODAY);
    expect(scoutingProblem(state, db, USER, others[SCOUTS])).toBe(`All ${SCOUTS} scouts are busy.`);
    expect(() => startAssignment(state, db, USER, others[SCOUTS], TODAY)).toThrow(RangeError);
    expect(scoutingProblem(state, db, USER, others[0])).toMatch(/already watching him/);

    state = cancelAssignment(state, others[0]);
    expect(scoutingProblem(state, db, USER, others[SCOUTS])).toBeNull();
    expect(assignmentViews(state, db).map((v) => v.playerId)).toEqual(others.slice(1, SCOUTS));
    expect(scoutingStatus(state, db, USER, others[1])).toMatchObject({ knowledge: 0, label: 'Not scouted', due: addDays(TODAY, REPORT_DAYS) });
  });

  it('forgets players who have left football, without a report', () => {
    const state = startAssignment({ ...EMPTY_SCOUTING, knowledge: { [others[1]]: 1 } }, db, USER, target, TODAY);
    const world = { ...db, players: db.players.filter((p) => p.id !== target && p.id !== others[1]) };
    const cleaned = withoutMissingPlayers(state, world);
    expect(cleaned).toEqual(EMPTY_SCOUTING);
    expect(deliverReports(state, world, USER, '2026-12-01').messages).toEqual([]);
  });
});
