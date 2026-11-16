import { buildFictionalDatabase } from '@/data/fictional';
import { domesticWorld } from '@/data/fictional/__fixtures__/domestic';

import { autoPickLineup } from '../../lineup';
import { createSeason, leagueOfClub } from '../../season/season-flow';
import { selectSquadCandidates } from '../../squad/squad-selectors';
import { matchComparison } from '../comparison';

const db = domesticWorld(buildFictionalDatabase());
const season = createSeason(db, 2026, 77);
const USER = 'club_greywater_town';
const lineup = autoPickLineup(selectSquadCandidates(db, USER), '4-4-2');

describe('matchComparison', () => {
  it('rates both expected XIs on the same scale, with no position or form before a ball is kicked', () => {
    const { user, opponent } = matchComparison(db, season, USER, lineup, 'club_kestrel_bay');
    expect(user.averageRating).toBeGreaterThan(8);
    expect(opponent.averageRating).toBeGreaterThan(user.averageRating!); // Kestrel Bay are much stronger
    expect([user.position, opponent.position, user.form, opponent.form]).toEqual([null, null, [], []]);
    expect(opponent.otherLeagueName).toBeNull();
  });

  it('names the league of a cup opponent from another division, and places clubs once they have played', () => {
    const otherDivision = db.clubs.find((c) => leagueOfClub(season, c.id) !== leagueOfClub(season, USER))!;
    expect(matchComparison(db, season, USER, lineup, otherDivision.id).opponent.otherLeagueName).toBe('Second Division');

    const league = leagueOfClub(season, USER)!;
    const first = season.fixtures.find((f) => f.competitionId === league && f.matchday === 1 && (f.homeId === USER || f.awayId === USER))!;
    const played = {
      ...season,
      fixtures: season.fixtures.map((f) =>
        f.id === first.id ? { ...f, result: { score: { home: 2, away: 0 }, goals: [], cards: [], players: [], playerOfTheMatch: null } } : f,
      ),
    };
    const after = matchComparison(db, played as typeof season, USER, lineup, 'club_kestrel_bay').user;
    expect(after.form).toEqual([first.homeId === USER ? 'W' : 'L']);
    expect(after.position).not.toBeNull();
  });
});
