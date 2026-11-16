import { buildFictionalDatabase } from '@/data/fictional';
import { autoPickLineup, clearSlot, swapPlaces, type Lineup, type LineupPlace } from '@/game/lineup';
import { selectSquadCandidates } from '@/game/squad/squad-selectors';
import { selectTeamSheet } from '@/game/squad/team-sheet';

import { currentSelection, tapOutcome } from '../swap';

const db = buildFictionalDatabase();
const CLUB = 'club_greywater_town';
const lineup = autoPickLineup(selectSquadCandidates(db, CLUB), '4-4-2');
const sheetFor = (l: Lineup) => selectTeamSheet(db, CLUB, l);
const slot = (slotId: string): LineupPlace => ({ kind: 'slot', slotId });
const bench = (playerId: string): LineupPlace => ({ kind: 'bench', playerId });

describe('tap one, tap another', () => {
  const sheet = sheetFor(lineup);

  it('the first tap on a player selects him; a tap on the same place cancels', () => {
    expect(tapOutcome(sheet, null, slot('GK'))).toEqual({ kind: 'select', place: slot('GK') });
    expect(tapOutcome(sheet, null, bench(lineup.substitutes[0]))).toEqual({ kind: 'select', place: bench(lineup.substitutes[0]) });
    expect(tapOutcome(sheet, slot('GK'), slot('GK'))).toEqual({ kind: 'deselect' });
  });

  it('the second tap swaps, with a position or a substitute', () => {
    expect(tapOutcome(sheet, slot('LB'), slot('RB'))).toEqual({ kind: 'swap', a: slot('LB'), b: slot('RB') });
    expect(tapOutcome(sheet, bench(lineup.substitutes[2]), slot('RM'))).toEqual({ kind: 'swap', a: bench(lineup.substitutes[2]), b: slot('RM') });
  });

  it('an empty position opens the squad list when nothing is selected, and takes the selected player otherwise', () => {
    const gap = sheetFor(clearSlot(lineup, 'LM'));
    expect(tapOutcome(gap, null, slot('LM'))).toEqual({ kind: 'choose', slotId: 'LM' });
    expect(tapOutcome(gap, slot('RM'), slot('LM'))).toEqual({ kind: 'swap', a: slot('RM'), b: slot('LM') });
  });

  it('forgets a selection whose player has gone, so a stale tap never swaps the wrong player', () => {
    const sub = lineup.substitutes[1];
    const after = sheetFor(swapPlaces(lineup, bench(sub), slot('GK'))); // he's now starting, no longer on the bench
    expect(currentSelection(after, bench(sub))).toBeNull();
    expect(tapOutcome(after, bench(sub), slot('LB'))).toEqual({ kind: 'select', place: slot('LB') });
    expect(currentSelection(sheetFor(clearSlot(lineup, 'GK')), slot('GK'))).toBeNull(); // an emptied slot
  });
});
