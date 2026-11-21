import { ABROAD_CLUBS, buildFictionalDatabase, clubIdFromName, FICTIONAL_SEED, RENAMED_CLUBS } from '@/data/fictional';
import { autoPickLineup } from '@/game/lineup';
import { advanceToUserFixture, createSeason, nextFixtureFor } from '@/game/season/season-flow';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { DEFAULT_TRAINING, developWorld } from '@/game/development/development';
import { EMPTY_SCOUTING } from '@/game/scouting/scouting';
import { completeTransfer } from '@/game/transfers/complete';
import { admitIntake, FIRST_INTAKE_YEAR, retirePlayers, worldFor } from '@/game/world/renewal';

import { applyWorldChanges, checkSave, migrateSave, SAVE_VERSION, worldChanges, type GameSave } from '../save';

const db = buildFictionalDatabase();
/** The generated world for a season: just the base world before the first youth intake. */
const baseFor = (startYear: number) => (startYear < FIRST_INTAKE_YEAR ? db : worldFor(db, FICTIONAL_SEED, startYear));
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
  ...worldChanges(db, db),
  transferHistory: [],
  transferListed: [],
  offers: [],
  inbox: [],
  condition,
  training: DEFAULT_TRAINING,
  retired: [],
  manager: { name: 'Alex Kamau', reputation: 52, confidence: 60, warned: false, sackedOffers: null, history: [] },
  liveMatch: null,
  scouting: { assignments: [], regionAssignments: [], knowledge: {}, shortlist: [] },
  retraining: [],
};

/** The same save as it comes back from storage: through JSON. */
const roundTrip = (save: unknown): unknown => JSON.parse(JSON.stringify(save));

describe('checkSave', () => {
  it('accepts a valid save after a JSON round-trip, unchanged', () => {
    const check = checkSave(roundTrip(valid), baseFor, FICTIONAL_SEED);
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
    const check = checkSave(roundTrip(raw), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(reason);
  });

  it("rejects a lineup with another club's player", () => {
    const outsider = db.contracts.find((c) => c.clubId === 'club_kestrel_bay')!.playerId;
    const tampered = { ...valid, lineup: { ...lineup, substitutes: [outsider] } };
    const check = checkSave(roundTrip(tampered), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/aren't at your club/);
  });

  it('rejects a season referring to a club that does not exist', () => {
    const tampered = { ...valid, season: { ...season, fixtures: [{ ...season.fixtures[0], homeId: 'club_ghost' }, ...season.fixtures.slice(1)] } };
    expect(checkSave(roundTrip(tampered), baseFor, FICTIONAL_SEED).ok).toBe(false);
  });

  it('rejects inconsistent contracts (a player at two clubs)', () => {
    const doubled = [...valid.contracts, { ...valid.contracts[0], id: 'con_dupe' }];
    const check = checkSave(roundTrip({ ...valid, contracts: doubled }), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/contracts are inconsistent/);
  });

  it('rejects condition records for unknown players or from the future', () => {
    expect(Object.keys(condition.players).length).toBeGreaterThan(0); // a played matchday leaves players tired
    const ghost = { ...valid, condition: { ...condition, players: { ...condition.players, plr_9999: { fitness: 50, morale: 60, injury: null } } } };
    expect(checkSave(roundTrip(ghost), baseFor, FICTIONAL_SEED).ok).toBe(false);
    const future = { ...valid, condition: { ...condition, date: '2027-01-01' } };
    expect(checkSave(roundTrip(future), baseFor, FICTIONAL_SEED).ok).toBe(false);
  });

  it("rejects a season where the user's club is in no league", () => {
    const leagues = season.leagues.map((l) => ({ ...l, clubIds: l.clubIds.filter((id) => id !== USER) }));
    expect(checkSave(roundTrip({ ...valid, season: { ...season, leagues } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
  });
});

describe('world changes', () => {
  it('a transferred world survives save → load', () => {
    const reserve = db.contracts.find((c) => c.clubId === 'club_westhaven_albion' && c.squadNumber === 31)!.playerId;
    const { db: changed } = completeTransfer(db, { playerId: reserve, buyerId: USER, fee: 100_000, weeklyWage: 2000, years: 2, date: '2026-07-01' });
    const check = checkSave(roundTrip({ ...valid, ...worldChanges(changed, db) }), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.database.contracts.find((c) => c.playerId === reserve)!.clubId).toBe(USER);
    expect(check.database.clubs.find((c) => c.id === USER)!.finances).toEqual(changed.clubs.find((c) => c.id === USER)!.finances);
    expect(check.database).toEqual(applyWorldChanges(db, worldChanges(changed, db)));
  });
});

describe('development in the save (v5)', () => {
  const developed = developWorld(db, '2026-09-01', season, () => ({ focus: 'balanced', intensity: 'heavy' }), 1).db;
  const changes = worldChanges(developed, db).attributeChanges;

  it('stores only changed attributes, and they survive save → load', () => {
    const changedPlayers = Object.keys(changes);
    expect(changedPlayers.length).toBeGreaterThan(0);
    expect(changedPlayers.length).toBeLessThan(db.players.length);
    const check = checkSave(roundTrip({ ...valid, attributeChanges: changes, training: { focus: 'physical', intensity: 'heavy' } }), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.database.attributes).toEqual(developed.attributes);
      expect(check.save.training).toEqual({ focus: 'physical', intensity: 'heavy' });
    }
  });

  it('rejects changes for unknown players or out-of-range values', () => {
    expect(checkSave(roundTrip({ ...valid, attributeChanges: { plr_9999: { pace: 12 } } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
    expect(checkSave(roundTrip({ ...valid, attributeChanges: { [db.players[0].id]: { pace: 25 } } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
    expect(checkSave(roundTrip({ ...valid, attributeChanges: { [db.players[0].id]: { flying: 12 } } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
  });
});

describe('retirement and youth intakes in the save (v6)', () => {
  it('a retired player stays gone and a regenerated intake player keeps his contract', () => {
    // Season 2027/28: retirements and the 2027 intake have happened.
    const retired = retirePlayers(db, FICTIONAL_SEED, FIRST_INTAKE_YEAR);
    const withIntake = admitIntake(retired.db, FICTIONAL_SEED, FIRST_INTAKE_YEAR, USER).db;
    const base = baseFor(FIRST_INTAKE_YEAR);
    const changes = worldChanges(withIntake, base);
    expect(changes.retired.sort()).toEqual(retired.leavers.map((l) => l.playerId).sort());
    expect(Object.keys(changes.attributeChanges)).toEqual([]); // intake players are regenerated, not stored

    const nextSeason = { ...season, startYear: FIRST_INTAKE_YEAR, label: '2027/28' };
    // As the store does at the rollover: condition records of retired players are dropped.
    const present = new Set(withIntake.players.map((p) => p.id));
    const prunedCondition = { ...condition, players: Object.fromEntries(Object.entries(condition.players).filter(([id]) => present.has(id))) };
    const lineupStillHere = Object.values(lineup.starters).every((id) => id === null || present.has(id)) && lineup.substitutes.every((id) => present.has(id));
    expect(lineupStillHere).toBe(true); // (the store would refill it otherwise)
    const check = checkSave(roundTrip({ ...valid, season: nextSeason, condition: prunedCondition, ...changes }), baseFor, FICTIONAL_SEED);
    expect(check.ok ? 'ok' : check.reason).toBe('ok');
    if (!check.ok) return;
    expect(check.database.players.map((p) => p.id).sort()).toEqual(withIntake.players.map((p) => p.id).sort());
    expect(check.database.contracts).toEqual(withIntake.contracts);
  });

  it('rejects retired ids the world never had', () => {
    expect(checkSave(roundTrip({ ...valid, retired: ['plr_999999'] }), baseFor, FICTIONAL_SEED).ok).toBe(false);
  });
});

describe('migrateSave', () => {
  const v8 = (({ scouting: _s, ...rest }) => rest)(valid);
  const v7 = (({ liveMatch: _l, ...rest }) => rest)(v8);
  const v6 = (({ manager: _m, ...rest }) => rest)(v7);
  const v5 = (({ retired: _r, ...rest }) => rest)(v6);
  const v4 = (({ attributeChanges: _a, training: _t, ...rest }) => rest)(v5);
  const v3 = (({ condition: _c, ...rest }) => rest)(v4);
  const v2 = (({ transferListed: _l, offers: _o, inbox: _i, ...rest }) => rest)(v3);
  const v1 = (({ contracts: _c, clubFinances: _f, transferHistory: _t, ...rest }) => rest)(v2);

  it('upgrades a version 1 save using the generated world (1 → 2 → 3)', () => {
    const upgraded = migrateSave(roundTrip(v1), 1);
    const check = checkSave(upgraded, baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.save.transferHistory).toEqual([]);
      expect(check.save.inbox).toEqual([]);
      expect(check.database.contracts).toEqual(db.contracts);
    }
  });

  it('upgrades a version 2 save with an empty transfer list, offers and inbox', () => {
    const check = checkSave(migrateSave(roundTrip(v2), 2), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save).toEqual({ ...valid, condition: { date: valid.currentDate, players: {} }, manager: defaultManager });
  });

  it('upgrades a version 3 save with everyone fully fit', () => {
    const check = checkSave(migrateSave(roundTrip(v3), 3), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save.condition).toEqual({ date: valid.currentDate, players: {} });
  });

  it('upgrades a version 4 save with no development yet and default training', () => {
    const check = checkSave(migrateSave(roundTrip(v4), 4), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save).toEqual({ ...valid, manager: defaultManager });
  });

  const defaultManager = { name: 'Manager', reputation: 50, confidence: 60, warned: false, sackedOffers: null, history: [] };

  it('upgrades a version 5 save with nobody retired', () => {
    const check = checkSave(migrateSave(roundTrip(v5), 5), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save).toEqual({ ...valid, manager: defaultManager });
  });

  it('upgrades a version 6 save with a default manager, so the career carries on', () => {
    const check = checkSave(migrateSave(roundTrip(v6), 6), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save.manager).toEqual(defaultManager);
  });

  it('upgrades a version 11 save: the renamed Kenyan clubs get their new ids and names', () => {
    // Today's save written the old way: old club ids and names.
    let old = JSON.stringify({ ...valid, inbox: [{ id: 'msg_1', date: '2026-08-01', category: 'transfer', from: 'Director of Football', title: 'Bid from Nakuru Flamingos', body: 'Nakuru Flamingos offer €1M.', read: false }] });
    for (const [from, to] of RENAMED_CLUBS) old = old.split(`"${clubIdFromName(to)}"`).join(`"${clubIdFromName(from)}"`);
    expect(old).toContain('"club_nakuru_flamingos"');
    const check = checkSave(migrateSave(JSON.parse(old), 11), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.save.contracts).toEqual(valid.contracts);
      expect(check.save.inbox[0].title).toBe('Bid from Nguma Leopards');
      expect(check.database.contracts.filter((c) => c.clubId === 'club_nguma_leopards')).toHaveLength(22);
    }
  });

  it('upgrades a version 10 save: its one cup becomes a one-cup list (the cups abroad start next season)', () => {
    const { cups: _cups, ...season10 } = valid.season;
    const v10 = { ...valid, season: { ...season10, cupId: 'comp_national_cup', cupEntrantLeagues: ['comp_first_division', 'comp_second_division'] } };
    const check = checkSave(migrateSave(roundTrip(v10), 10), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save.season.cups).toEqual([{ competitionId: 'comp_national_cup', entrantLeagues: ['comp_first_division', 'comp_second_division'] }]);
    // Before the leagues abroad there was no cupEntrantLeagues: every league entered.
    const old = { ...valid, season: { ...season10, cupId: 'comp_national_cup' } };
    const upgraded = migrateSave(roundTrip(old), 10) as { season: { cups: { entrantLeagues: string[] }[] } };
    expect(upgraded.season.cups[0].entrantLeagues).toEqual(valid.season.leagues.map((l) => l.competitionId));
  });

  it('upgrades a version 9 save from before the leagues abroad: their squads get their generated contracts', () => {
    const abroad = new Set(ABROAD_CLUBS.map((c) => c.id));
    const v9 = { ...valid, contracts: valid.contracts.filter((c) => !abroad.has(c.clubId)) };
    const check = checkSave(migrateSave(roundTrip(v9), 9), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.save.contracts).toHaveLength(valid.contracts.length);
      expect(check.database.contracts.filter((c) => c.clubId === 'club_ndom_fc')).toHaveLength(22);
    }
    // Running it on a save that already has them changes nothing.
    expect((migrateSave(roundTrip(valid), 9) as { contracts: unknown[] }).contracts).toHaveLength(valid.contracts.length);
  });

  it('upgrades a version 8 save with nobody scouted', () => {
    const check = checkSave(migrateSave(roundTrip(v8), 8), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save).toEqual(valid);
  });

  it('rejects scouting records for players the world doesn’t have', () => {
    const ghost = { assignments: [{ playerId: 'plr_999999', started: '2026-08-01', due: '2026-08-15' }], regionAssignments: [], knowledge: {}, shortlist: [] };
    expect(checkSave(roundTrip({ ...valid, scouting: ghost }), baseFor, FICTIONAL_SEED).ok).toBe(false);
    expect(checkSave(roundTrip({ ...valid, scouting: { ...EMPTY_SCOUTING, knowledge: { plr_999999: 1 } } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
    expect(checkSave(roundTrip({ ...valid, scouting: { ...EMPTY_SCOUTING, shortlist: ['plr_999999'] } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
    const someone = db.players[0].id;
    expect(checkSave(roundTrip({ ...valid, scouting: { ...EMPTY_SCOUTING, knowledge: { [someone]: 2 }, shortlist: [someone] } }), baseFor, FICTIONAL_SEED).ok).toBe(true);
  });

  it('saves retrained positions as changes against the generated world, and lays them back over it', () => {
    const player = db.players.find((p) => p.primaryPosition === 'LW')!;
    const changed = { ...db, players: db.players.map((p) => (p.id === player.id ? { ...p, primaryPosition: 'ST' as const, secondaryPositions: ['LW' as const] } : p)) };
    const changes = worldChanges(changed, db).positionChanges;
    expect(changes).toEqual({ [player.id]: { primaryPosition: 'ST', secondaryPositions: ['LW'] } });
    expect(Object.keys(worldChanges(db, db).positionChanges)).toEqual([]);
    const check = checkSave(roundTrip({ ...valid, positionChanges: changes }), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.database.players.find((p) => p.id === player.id)).toMatchObject({ primaryPosition: 'ST', secondaryPositions: ['LW'] });
    expect(checkSave(roundTrip({ ...valid, positionChanges: { plr_999999: { primaryPosition: 'ST', secondaryPositions: [] } } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
  });

  it('rejects retraining records for players who do not exist or that start in the future', () => {
    const someone = db.players[0].id;
    const lesson = { playerId: someone, position: 'ST', kind: 'secondary', started: valid.currentDate, due: '2099-01-01' };
    expect(checkSave(roundTrip({ ...valid, retraining: [lesson] }), baseFor, FICTIONAL_SEED).ok).toBe(true);
    expect(checkSave(roundTrip({ ...valid, retraining: [{ ...lesson, playerId: 'plr_999999' }] }), baseFor, FICTIONAL_SEED).ok).toBe(false);
    expect(checkSave(roundTrip({ ...valid, retraining: [{ ...lesson, started: '2099-01-01' }] }), baseFor, FICTIONAL_SEED).ok).toBe(false);
  });

  it('rejects scouting trips to countries the world doesn’t have, or that start in the future', () => {
    const trip = { nation: 'ENG', group: 'all', started: valid.currentDate, due: '2099-01-01' };
    expect(checkSave(roundTrip({ ...valid, scouting: { ...EMPTY_SCOUTING, regionAssignments: [trip] } }), baseFor, FICTIONAL_SEED).ok).toBe(true);
    expect(checkSave(roundTrip({ ...valid, scouting: { ...EMPTY_SCOUTING, regionAssignments: [{ ...trip, nation: 'XXX' }] } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
    expect(checkSave(roundTrip({ ...valid, scouting: { ...EMPTY_SCOUTING, regionAssignments: [{ ...trip, started: '2099-01-01' }] } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
  });

  it('upgrades a version 12 save: scouting gains no trips and an empty shortlist, and nobody is retraining', () => {
    const { retraining: _r, positionChanges: _p, ...rest } = valid;
    const v12 = { ...rest, scouting: { assignments: [], knowledge: {} } };
    const upgraded = migrateSave(roundTrip(v12), 12) as { scouting: unknown };
    expect(upgraded.scouting).toEqual(EMPTY_SCOUTING);
    const check = checkSave(upgraded, baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save).toEqual(valid);
  });

  it('upgrades a version 7 save with no match in progress', () => {
    const check = checkSave(migrateSave(roundTrip(v7), 7), baseFor, FICTIONAL_SEED);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.save).toEqual(valid);
  });

  it('accepts a match in progress only if it is still the next fixture and its players exist', () => {
    const next = nextFixtureFor(season, USER)!;
    const tactics = { after: { minute: 60 }, side: 'home' as const, kind: 'tactics' as const, tactics: DEFAULT_TACTICS };
    const live = { kind: 'fixture' as const, fixtureId: next.id, changes: [tactics] };
    expect(checkSave(roundTrip({ ...valid, liveMatch: live }), baseFor, FICTIONAL_SEED).ok).toBe(true);
    const played = season.fixtures.find((f) => f.result)!;
    expect(checkSave(roundTrip({ ...valid, liveMatch: { ...live, fixtureId: played.id } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
    const ghostSub = { after: { minute: 60 }, side: 'home', kind: 'substitution', offId: 'plr_999999', onId: lineup.substitutes[0] };
    expect(checkSave(roundTrip({ ...valid, liveMatch: { ...live, changes: [ghostSub] } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
    const friendly = { kind: 'friendly', opponentId: USER, venue: 'home', seed: 1, changes: [] };
    expect(checkSave(roundTrip({ ...valid, liveMatch: friendly }), baseFor, FICTIONAL_SEED).ok).toBe(false);
  });

  it('rejects a career history with unknown clubs', () => {
    const history = [{ season: '2025/26', clubId: 'club_ghost', finished: 3, target: 5, outcome: 'completed', trophies: [] }];
    expect(checkSave(roundTrip({ ...valid, manager: { ...valid.manager, history } }), baseFor, FICTIONAL_SEED).ok).toBe(false);
  });

  it('rejects a current-version save passed to migrate', () => {
    expect(migrateSave(roundTrip(valid), SAVE_VERSION)).toEqual({ incompatibleVersion: SAVE_VERSION });
  });

  it('marks unknown versions as incompatible', () => {
    expect(migrateSave(roundTrip(v1), 99)).toEqual({ incompatibleVersion: 99 });
    expect(migrateSave('nonsense', 1)).toEqual({ incompatibleVersion: 1 });
  });
});
