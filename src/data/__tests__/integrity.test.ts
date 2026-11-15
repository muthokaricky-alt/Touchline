import { buildFictionalDatabase } from '../fictional';
import { checkIntegrity, type IntegrityRule } from '../integrity';
import { parseDatabase } from '../load';
import { isLeague, type GameDatabase } from '../schemas';

/** A fresh, valid database for each test to break in one specific way. */
function freshDatabase(): GameDatabase {
  return buildFictionalDatabase();
}

function rulesBroken(db: GameDatabase): IntegrityRule[] {
  return [...new Set(checkIntegrity(db).map((issue) => issue.rule))];
}

describe('checkIntegrity', () => {
  it('finds no issues in a consistent database', () => {
    expect(checkIntegrity(freshDatabase())).toEqual([]);
  });

  it('detects duplicate player ids', () => {
    const db = freshDatabase();
    db.players[1] = { ...db.players[1], id: db.players[0].id };
    expect(rulesBroken(db)).toContain('duplicate-id');
  });

  it('detects a contract for an unknown player', () => {
    const db = freshDatabase();
    db.contracts[0] = { ...db.contracts[0], playerId: 'plr_9999' };
    expect(rulesBroken(db)).toContain('unknown-player');
  });

  it('detects a contract for an unknown club', () => {
    const db = freshDatabase();
    db.contracts[0] = { ...db.contracts[0], clubId: 'club_nowhere' };
    expect(rulesBroken(db)).toEqual(['unknown-club']);
  });

  it('detects a player with no attributes', () => {
    const db = freshDatabase();
    db.attributes.shift();
    expect(rulesBroken(db)).toEqual(['missing-attributes']);
  });

  it('detects a player with two attributes records', () => {
    const db = freshDatabase();
    db.attributes.push({ ...db.attributes[0] });
    expect(rulesBroken(db)).toEqual(['duplicate-attributes']);
  });

  it('detects a player with two contracts', () => {
    const db = freshDatabase();
    const otherClub = db.clubs[1].id;
    db.contracts.push({ ...db.contracts[0], id: 'con_9999', clubId: otherClub, squadNumber: 99 });
    expect(rulesBroken(db)).toEqual(['multiple-contracts']);
  });

  it('detects a squad number used twice at one club', () => {
    const db = freshDatabase();
    db.contracts[1] = { ...db.contracts[1], squadNumber: db.contracts[0].squadNumber };
    expect(rulesBroken(db)).toEqual(['duplicate-squad-number']);
  });

  it('allows the same squad number at different clubs', () => {
    const db = freshDatabase();
    const numberOnes = db.contracts.filter((c) => c.squadNumber === 1);
    expect(numberOnes.length).toBe(db.clubs.length);
    expect(checkIntegrity(db)).toEqual([]);
  });

  /** The first league (narrowed: `competitions` also contains the cup). */
  const firstLeague = (db: GameDatabase) => db.competitions.filter(isLeague)[0];

  it('detects a league containing an unknown club', () => {
    const db = freshDatabase();
    const league = firstLeague(db);
    db.competitions[db.competitions.indexOf(league)] = { ...league, clubIds: [...league.clubIds, 'club_ghost'] };
    expect(rulesBroken(db)).toEqual(['unknown-club']);
  });

  it('detects a club in two leagues', () => {
    const db = freshDatabase();
    db.competitions.push({ ...firstLeague(db), id: 'comp_extra_league' });
    expect(rulesBroken(db)).toEqual(['club-in-multiple-leagues']);
  });

  it('allows a player without a contract (free agent)', () => {
    const db = freshDatabase();
    db.contracts.shift();
    expect(checkIntegrity(db)).toEqual([]);
  });
});

describe('parseDatabase', () => {
  it('accepts the fictional database after a JSON round-trip', () => {
    // Simulates loading from a file: the data arrives as `unknown`.
    const raw: unknown = JSON.parse(JSON.stringify(freshDatabase()));
    const result = parseDatabase(raw);
    expect(result.ok).toBe(true);
  });

  it('reports schema errors with a readable path', () => {
    const raw = JSON.parse(JSON.stringify(freshDatabase()));
    raw.attributes[3].physical.pace = 25;
    const result = parseDatabase(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual([expect.stringMatching(/^attributes\.3\.physical\.pace: /)]);
  });

  it('reports integrity errors when every record is valid on its own', () => {
    const raw = JSON.parse(JSON.stringify(freshDatabase()));
    raw.contracts[0].clubId = 'club_nowhere';
    const result = parseDatabase(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^\[unknown-club\]/);
  });

  it('rejects data with the wrong version', () => {
    const raw = { ...freshDatabase(), version: 2 };
    expect(parseDatabase(raw).ok).toBe(false);
  });

  it('rejects something that is not a database at all', () => {
    expect(parseDatabase('hello').ok).toBe(false);
    expect(parseDatabase(null).ok).toBe(false);
  });
});
