import { buildFictionalDatabase } from '@/data/fictional';
import { FORMATION_IDS } from '@/game/formations';
import { autoPickLineup, validateLineup } from '@/game/lineup';
import { lineupStrength } from '@/game/match/build-match-team';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { matchPlayingStyle } from '@/game/tactics/presets';

import { buildAiTeam, chooseAiLineup, chooseAiTactics, stylesForStrengthGap } from '../opponent';

const db = buildFictionalDatabase();

describe('AI opponent', () => {
  it.each(db.clubs.map((c) => c.id))('builds a playable team for %s', (clubId) => {
    const t = buildAiTeam(db, clubId, 13);
    const errors = validateLineup(t.lineup, t.squad).filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
    expect(t.name).toBe(db.clubs.find((c) => c.id === clubId)!.name);
    expect(matchPlayingStyle(t.tactics)).not.toBeNull();
  });

  it('chooses the formation with the strongest XI', () => {
    const squad = selectSquadCandidates(db, 'club_greywater_town');
    const strength = lineupStrength(chooseAiLineup(squad), squad);
    for (const formationId of FORMATION_IDS) {
      expect(strength).toBeGreaterThanOrEqual(lineupStrength(autoPickLineup(squad, formationId), squad) - 1e-9);
    }
  });

  it('attacks as favourite and sits deep as underdog', () => {
    const squad = selectSquadCandidates(db, 'club_greywater_town');
    const lineup = chooseAiLineup(squad);
    const own = lineupStrength(lineup, squad);
    const asFavourite = matchPlayingStyle(chooseAiTactics(squad, lineup, own - 3))!.id;
    const asUnderdog = matchPlayingStyle(chooseAiTactics(squad, lineup, own + 4))!.id;
    expect(stylesForStrengthGap(3)).toContain(asFavourite);
    expect(['low-block', 'counter']).toContain(asUnderdog);
  });

  it('is deterministic', () => {
    expect(buildAiTeam(db, 'club_kestrel_bay', 12)).toEqual(buildAiTeam(db, 'club_kestrel_bay', 12));
  });
});
