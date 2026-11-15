import { buildFictionalDatabase } from '@/data/fictional';
import { simulateMatch } from '@/engine/simulate';
import { autoPickLineup } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { DEFAULT_TACTICS } from '@/game/tactics/tactics';

import { newMatchSeed, prepareFriendly } from '../friendly';

const db = buildFictionalDatabase();
const USER = 'club_greywater_town';
const lineup = autoPickLineup(selectSquadCandidates(db, USER), '4-3-3');
const setup = { db, userClubId: USER, lineup, tactics: DEFAULT_TACTICS, opponentId: 'club_kestrel_bay', seed: 3 };

describe('prepareFriendly', () => {
  it('puts the user at home or away as chosen, with their own lineup and tactics', () => {
    const home = prepareFriendly({ ...setup, venue: 'home' });
    expect(home.home.clubId).toBe(USER);
    expect(home.home.lineup).toBe(lineup);
    expect(home.away.clubId).toBe('club_kestrel_bay');

    const away = prepareFriendly({ ...setup, venue: 'away' });
    expect(away.away.clubId).toBe(USER);
    expect(away.home.clubId).toBe('club_kestrel_bay');
  });

  it('produces a playable match', () => {
    const result = simulateMatch(prepareFriendly({ ...setup, venue: 'home' }));
    expect(result.home.name).toBe('Greywater Town');
    expect(result.away.name).toBe('Kestrel Bay');
  });

  it('refuses a club playing itself', () => {
    expect(() => prepareFriendly({ ...setup, opponentId: USER, venue: 'home' })).toThrow(RangeError);
  });
});

describe('newMatchSeed', () => {
  it('turns a timestamp into a valid 31-bit seed', () => {
    const seed = newMatchSeed(1_763_200_000_123);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2_147_483_647);
  });
});
