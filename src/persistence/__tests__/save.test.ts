import { buildFictionalDatabase, FICTIONAL_SEED } from '@/data/fictional';
import { autoPickLineup } from '@/game/lineup';
import { advanceToUserFixture, createSeason } from '@/game/season/season-flow';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { checkSave, type GameSave } from '../save';

const db = buildFictionalDatabase();
const USER = 'club_greywater_town';
const lineup = autoPickLineup(selectSquadCandidates(db, USER), '4-4-2');
const season = advanceToUserFixture(db, createSeason(db, 2026, 3), { clubId: USER, lineup, tactics: DEFAULT_TACTICS }).season;
const valid: GameSave = { worldSeed: FICTIONAL_SEED, userClubId: USER, currentDate: '2026-08-08', lineup, tactics: DEFAULT_TACTICS, season };

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
    ['an older save format', { incompatibleVersion: 0 }, /older version/],
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

  it("rejects a season where the user's club is in no league", () => {
    const leagues = season.leagues.map((l) => ({ ...l, clubIds: l.clubIds.filter((id) => id !== USER) }));
    expect(checkSave(roundTrip({ ...valid, season: { ...season, leagues } }), db, FICTIONAL_SEED).ok).toBe(false);
  });
});
