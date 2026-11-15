import { starterIds, validateLineup } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { PLAYING_STYLES } from '@/game/tactics/presets';

import { createInitialGameState, DEFAULT_USER_CLUB_ID, useGameStore } from '../game-store';

// The store works without React: getState() reads it, actions update it.
beforeEach(() => {
  useGameStore.setState(createInitialGameState());
});

const state = () => useGameStore.getState();
const candidates = () => selectSquadCandidates(state().database, state().userClubId);

describe('game store', () => {
  it('starts with the default club and a playable auto-picked lineup', () => {
    expect(state().userClubId).toBe(DEFAULT_USER_CLUB_ID);
    expect(starterIds(state().lineup)).toHaveLength(11);
    expect(validateLineup(state().lineup, candidates()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('changes formation and keeps the same starters', () => {
    const before = starterIds(state().lineup).sort();
    state().changeFormation('4-2-3-1');
    expect(state().lineup.formationId).toBe('4-2-3-1');
    expect(starterIds(state().lineup).sort()).toEqual(before);
  });

  it('assigns, clears and removes players', () => {
    const rb = state().lineup.starters.RB!;
    state().assignToSlot('LB', rb);
    expect(state().lineup.starters.LB).toBe(rb);

    state().clearSlot('LB');
    expect(state().lineup.starters.LB).toBeNull();

    const sub = state().lineup.substitutes[0];
    state().removeFromLineup(sub);
    expect(state().lineup.substitutes).not.toContain(sub);

    state().addSubstitute(sub);
    expect(state().lineup.substitutes).toContain(sub);
  });

  it('auto pick repairs a broken lineup', () => {
    state().clearSlot('GK');
    state().autoPick();
    expect(state().lineup.starters.GK).not.toBeNull();
  });

  it('starts with balanced tactics, applies a style and changes single instructions', () => {
    expect(state().tactics).toEqual(PLAYING_STYLES.balanced.tactics);

    state().applyPlayingStyle('counter');
    expect(state().tactics).toEqual(PLAYING_STYLES.counter.tactics);

    state().setInstruction('width', 'wide');
    expect(state().tactics.width).toBe('wide');
    expect(state().tactics.passing).toBe(PLAYING_STYLES.counter.tactics.passing);
  });

  it('replaces the lineup object on change (so React re-renders)', () => {
    const before = state().lineup;
    state().clearSlot('LM');
    expect(state().lineup).not.toBe(before);
  });
});
