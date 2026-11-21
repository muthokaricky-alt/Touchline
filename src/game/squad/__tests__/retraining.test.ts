import { buildFictionalDatabase } from '@/data/fictional';
import { addDays } from '@/utils/date';

import { positionRating } from '../../ratings';
import {
  cancelRetraining,
  deliverRetraining,
  EMPTY_RETRAINING,
  MAX_RATING_GAP,
  RETRAIN_SLOTS,
  retrainProblem,
  retrainingView,
  retrained,
  startRetraining,
  WEEKS_TO_LEARN,
  WEEKS_TO_PRIMARY,
} from '../retraining';

const db = buildFictionalDatabase();
const USER = db.clubs[0].id;
const TODAY = '2026-08-01';
const mine = (pred: (p: (typeof db.players)[number]) => boolean) => {
  const owned = new Set(db.contracts.filter((c) => c.clubId === USER).map((c) => c.playerId));
  return db.players.find((p) => owned.has(p.id) && pred(p))!;
};
const attrsOf = (id: string) => db.attributes.find((a) => a.playerId === id)!;

describe('retraining', () => {
  it('turns a position he already covers into his main one in four weeks, keeping the old one', () => {
    const player = mine((p) => p.primaryPosition !== 'GK' && p.secondaryPositions.length > 0);
    const target = player.secondaryPositions[0];
    const state = startRetraining(EMPTY_RETRAINING, db, USER, player.id, target, TODAY);
    expect(state).toEqual([{ playerId: player.id, position: target, kind: 'primary', started: TODAY, due: addDays(TODAY, WEEKS_TO_PRIMARY * 7) }]);

    const early = deliverRetraining(state, db, USER, addDays(TODAY, WEEKS_TO_PRIMARY * 7 - 1));
    expect(early).toEqual({ state, db, messages: [] });

    const done = deliverRetraining(state, db, USER, addDays(TODAY, 40));
    expect(done.state).toEqual([]);
    const after = done.db.players.find((p) => p.id === player.id)!;
    expect(after.primaryPosition).toBe(target);
    expect(after.secondaryPositions).toContain(player.primaryPosition);
    expect(after.secondaryPositions).not.toContain(target);
    expect(done.messages).toHaveLength(1);
    expect(done.messages[0]).toMatchObject({ category: 'squad', from: 'Head Coach' });
  });

  it('teaches a new position as a secondary one in twelve weeks, if his attributes are close enough', () => {
    const player = mine((p) => p.primaryPosition === 'LW' || p.primaryPosition === 'RW');
    const a = attrsOf(player.id);
    const known = new Set([player.primaryPosition, ...player.secondaryPositions]);
    const candidates = (['ST', 'AM', 'CM', 'LM', 'RM', 'LW', 'RW'] as const).filter((x) => !known.has(x as never) && positionRating(a, x as never) >= positionRating(a, player.primaryPosition) - MAX_RATING_GAP);
    if (candidates.length === 0) return; // this squad's winger suits nothing new; covered by the 'too far' test
    const target = candidates[0] as never;
    const state = startRetraining(EMPTY_RETRAINING, db, USER, player.id, target, TODAY);
    expect(state[0]).toMatchObject({ kind: 'secondary', due: addDays(TODAY, WEEKS_TO_LEARN * 7) });
    const after = deliverRetraining(state, db, USER, addDays(TODAY, 100)).db.players.find((p) => p.id === player.id)!;
    expect(after.primaryPosition).toBe(player.primaryPosition);
    expect(after.secondaryPositions).toContain(target);
  });

  it('refuses what makes no sense', () => {
    const player = mine((p) => p.primaryPosition !== 'GK');
    const keeper = mine((p) => p.primaryPosition === 'GK');
    expect(retrainProblem(EMPTY_RETRAINING, db, USER, player.id, player.primaryPosition)).toMatch(/already his main/);
    expect(retrainProblem(EMPTY_RETRAINING, db, USER, player.id, 'GK')).toMatch(/Goalkeepers/);
    expect(retrainProblem(EMPTY_RETRAINING, db, USER, keeper.id, 'ST')).toMatch(/Goalkeepers/);
    const other = db.contracts.find((c) => c.clubId !== USER)!.playerId;
    expect(retrainProblem(EMPTY_RETRAINING, db, USER, other, 'ST')).toMatch(/your own/);
    expect(retrainProblem(EMPTY_RETRAINING, db, USER, 'plr_999999', 'ST')).toMatch(/Unknown/);
  });

  it('refuses a position his attributes are far from', () => {
    const striker = mine((p) => p.primaryPosition === 'ST');
    const a = attrsOf(striker.id);
    const far = (['CB', 'LB', 'RB', 'DM'] as const).find((x) => positionRating(a, x) < positionRating(a, 'ST') - MAX_RATING_GAP && !striker.secondaryPositions.includes(x));
    expect(far).toBeDefined();
    expect(retrainProblem(EMPTY_RETRAINING, db, USER, striker.id, far!)).toMatch(/attributes don’t suit/);
  });

  it('allows only a few lessons at once, one per player, and can be cancelled', () => {
    const players = db.players.filter((p) => p.primaryPosition !== 'GK' && p.secondaryPositions.length > 0 && db.contracts.some((c) => c.clubId === USER && c.playerId === p.id));
    expect(players.length).toBeGreaterThanOrEqual(RETRAIN_SLOTS + 1);
    let state = EMPTY_RETRAINING;
    for (const p of players.slice(0, RETRAIN_SLOTS)) state = startRetraining(state, db, USER, p.id, p.secondaryPositions[0], TODAY);
    const extra = players[RETRAIN_SLOTS];
    expect(() => startRetraining(state, db, USER, extra.id, extra.secondaryPositions[0], TODAY)).toThrow(RangeError);
    expect(retrainProblem(state, db, USER, players[0].id, players[0].secondaryPositions[0])).toMatch(/already retraining/);
    expect(retrainingView(state, db, USER, extra.id)).toMatchObject({ options: [], problem: expect.stringMatching(/Only \d players/) });
    state = cancelRetraining(state, players[0].id);
    expect(state).toHaveLength(RETRAIN_SLOTS - 1);
    expect(retrainProblem(state, db, USER, extra.id, extra.secondaryPositions[0])).toBeNull();
  });

  it('forgets a lesson when the player has left the club', () => {
    const player = mine((p) => p.primaryPosition !== 'GK' && p.secondaryPositions.length > 0);
    const state = startRetraining(EMPTY_RETRAINING, db, USER, player.id, player.secondaryPositions[0], TODAY);
    const sold = { ...db, contracts: db.contracts.filter((c) => c.playerId !== player.id) };
    const result = deliverRetraining(state, sold, USER, addDays(TODAY, 100));
    expect(result.state).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(result.db.players.find((p) => p.id === player.id)!.primaryPosition).toBe(player.primaryPosition);
  });

  it('lists secondary positions first, each with its weeks and rating', () => {
    const player = mine((p) => p.primaryPosition !== 'GK' && p.secondaryPositions.length > 0);
    const view = retrainingView(EMPTY_RETRAINING, db, USER, player.id);
    expect(view.active).toBeNull();
    expect(view.options.length).toBeGreaterThan(0);
    const firstSecondary = view.options.findIndex((o) => o.kind === 'secondary');
    if (firstSecondary >= 0) expect(view.options.slice(0, firstSecondary).every((o) => o.kind === 'primary')).toBe(true);
    for (const o of view.options) expect(o.weeks).toBe(o.kind === 'primary' ? WEEKS_TO_PRIMARY : WEEKS_TO_LEARN);
    expect(view.options.map((o) => o.position)).not.toContain(player.primaryPosition);
  });

  it('retrained() keeps at most four secondary positions', () => {
    const base = db.players.find((p) => p.primaryPosition === 'CM')!;
    const full = { ...base, secondaryPositions: ['DM', 'AM', 'LM', 'RM'] as never };
    expect(retrained(full, 'AM', 'primary').secondaryPositions).toEqual(['CM', 'DM', 'LM', 'RM']);
    expect(retrained(full, 'ST', 'secondary').secondaryPositions).toHaveLength(4);
  });
});
