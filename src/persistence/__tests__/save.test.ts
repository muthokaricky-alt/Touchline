import { buildFictionalDatabase, FICTIONAL_SEED } from '@/data/fictional';
import { autoPickLineup } from '@/game/lineup';
import { advanceToUserFixture, createSeason } from '@/game/season/season-flow';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { completeTransfer } from '@/game/transfers/complete';

import { applyWorldChanges, checkSave, migrateSave, worldChanges, type GameSave } from '../save';

const db = buildFictionalDatabase();
const USER = 'club_greywater_town';
const lineup = autoPickLineup(selectSquadCandidates(db, USER), '4-4-2');
const played = advanceToUserFixture(db, createSeason(db, 2026, 3), { clubId: USER, lineup, tactics: DEFAULT_TACTICS });
const { season, condition } = played;
const valid: GameSave = {
  worldSeed: FICTIONAL_SEED,
  userClubId: USER,
  currentDate: '2026-08-08',
  lineup,
  tactics: DEFAULT_TACTICS,
  season,
  ...worldChanges(db),
  transferHistory: [],
  transferListed: [],
  offers: [],
  inbox: [],
  condition,
};

/** The same save as it comes back from storage: through JSON. */
const roundTrip = (save: unknown): unknown => JSON.parse(JSON.stringify(save));

describe('checkSave', () => {
  it('accepts a valid save after a JSON round-trip, unchanged', () => {
    const check = checkSave(roundTrip(valid), db, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save).toEqual(valid);
  });

  it.each([
    ['nothing at all', null, /damaged/],
    ['the wrong shape', { hello: 'world' }, /damaged/],
    ['an unsupported save format', { incompatibleVersion: 0 }, /unsupported version/],
    ['a different world', { ...valid, worldSeed: 1 }, /different game world/],
    ['an unknown club', { ...valid, userClubId: 'club_nowhere' }, /no longer exists/],
    ['a bad date', { ...valid, currentDate: '2026-02-30' }, /damaged/],
    ['an extra field (strict)', { ...valid, cheats: true }, /damaged/],
  ])('rejects %s', (_label, raw, reason) => {
    const check = checkSave(roundTrip(raw), db, FICTIONAL_SEED);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(reason);
  });

  it("rejects a lineup with another club's player", () => {
    const outsider = db.contracts.find((c) => c.clubId === 'club_kestrel_bay')!.playerId;
    const tampered = { ...valid, lineup: { ...lineup, substitutes: [outsider] } };
    const check = checkSave(roundTrip(tampered), db, FICTIONAL_SEED);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/aren't at your club/);
  });

  it('rejects a season referring to a club that does not exist', () => {
    const tampered = { ...valid, season: { ...season, fixtures: [{ ...season.fixtures[0], homeId: 'club_ghost' }, ...season.fixtures.slice(1)] } };
    expect(checkSave(roundTrip(tampered), db, FICTIONAL_SEED).ok).toBe(false);
  });

  it('rejects inconsistent contracts (a player at two clubs)', () => {
    const doubled = [...valid.contracts, { ...valid.contracts[0], id: 'con_dupe' }];
    const check = checkSave(roundTrip({ ...valid, contracts: doubled }), db, FICTIONAL_SEED);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/contracts are inconsistent/);
  });

  it('rejects condition records for unknown players or from the future', () => {
    expect(Object.keys(condition.players).length).toBeGreaterThan(0); // a played matchday leaves players tired
    const ghost = { ...valid, condition: { ...condition, players: { ...condition.players, plr_9999: { fitness: 50, morale: 60, injury: null } } } };
    expect(checkSave(roundTrip(ghost), db, FICTIONAL_SEED).ok).toBe(false);
    const future = { ...valid, condition: { ...condition, date: '2027-01-01' } };
    expect(checkSave(roundTrip(future), db, FICTIONAL_SEED).ok).toBe(false);
  });

  it("rejects a season where the user's club is in no league", () => {
    const leagues = season.leagues.map((l) => ({ ...l, clubIds: l.clubIds.filter((id) => id !== USER) }));
    expect(checkSave(roundTrip({ ...valid, season: { ...season, leagues } }), db, FICTIONAL_SEED).ok).toBe(false);
  });
});

describe('world changes', () => {
  it('a transferred world survives save → load', () => {
    const reserve = db.contracts.find((c) => c.clubId === 'club_westhaven_albion' && c.squadNumber === 31)!.playerId;
    const { db: changed } = completeTransfer(db, { playerId: reserve, buyerId: USER, fee: 100_000, weeklyWage: 2000, years: 2, date: '2026-07-01' });
    const check = checkSave(roundTrip({ ...valid, ...worldChanges(changed) }), db, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.database.contracts.find((c) => c.playerId === reserve)!.clubId).toBe(USER);
    expect(check.database.clubs.find((c) => c.id === USER)!.finances).toEqual(changed.clubs.find((c) => c.id === USER)!.finances);
    expect(check.database).toEqual(applyWorldChanges(db, worldChanges(changed)));
  });
});

describe('migrateSave', () => {
  const v3 = (({ condition: _c, ...rest }) => rest)(valid);
  const v2 = (({ transferListed: _l, offers: _o, inbox: _i, ...rest }) => rest)(v3);
  const v1 = (({ contracts: _c, clubFinances: _f, transferHistory: _t, ...rest }) => rest)(v2);

  it('upgrades a version 1 save using the generated world (1 → 2 → 3)', () => {
    const upgraded = migrateSave(roundTrip(v1), 1);
    const check = checkSave(upgraded, db, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.save.transferHistory).toEqual([]);
      expect(check.save.inbox).toEqual([]);
      expect(check.database.contracts).toEqual(db.contracts);
    }
  });

  it('upgrades a version 2 save with an empty transfer list, offers and inbox', () => {
    const check = checkSave(migrateSave(roundTrip(v2), 2), db, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save).toEqual({ ...valid, condition: { date: valid.currentDate, players: {} } });
  });

  it('upgrades a version 3 save with everyone fully fit', () => {
    const check = checkSave(migrateSave(roundTrip(v3), 3), db, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save.condition).toEqual({ date: valid.currentDate, players: {} });
  });

  it('rejects a current-version save passed to migrate', () => {
    expect(migrateSave(roundTrip(valid), 4)).toEqual({ incompatibleVersion: 4 });
  });

  it('marks unknown versions as incompatible', () => {
    expect(migrateSave(roundTrip(v1), 99)).toEqual({ incompatibleVersion: 99 });
    expect(migrateSave('nonsense', 1)).toEqual({ incompatibleVersion: 1 });
  });
});
