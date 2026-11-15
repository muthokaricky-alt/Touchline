import { buildFictionalDatabase } from '@/data/fictional';
import type { AttributeKey, PlayerAttributes } from '@/data/schemas';

import { autoPickLineup, type LineupCandidate } from '../../lineup';
import { selectSquadCandidates } from '../../squad/squad-selectors';
import { analyseTactics, STRONG, WEAK } from '../analysis';
import { PLAYING_STYLE_LIST } from '../presets';
import { DEFAULT_TACTICS, type Tactics } from '../tactics';

const db = buildFictionalDatabase();
const squad = selectSquadCandidates(db, 'club_greywater_town');
const lineup = autoPickLineup(squad, '4-4-2');

/** Copy of the squad with the given attributes set to `value` for every player. */
function withAttributes(keys: readonly AttributeKey[], value: number): LineupCandidate[] {
  return squad.map(({ player, attributes }) => {
    const copy: PlayerAttributes = structuredClone(attributes);
    for (const key of keys) {
      for (const group of ['technical', 'mental', 'physical', 'goalkeeping'] as const) {
        if (key in copy[group]) (copy[group] as Record<string, number>)[key] = value;
      }
    }
    return { player, attributes: copy };
  });
}

const notesFor = (tactics: Partial<Tactics>, candidates: readonly LineupCandidate[] = squad) =>
  analyseTactics({ ...DEFAULT_TACTICS, ...tactics }, lineup, candidates);
const find = (notes: ReturnType<typeof notesFor>, id: string) => notes.find((n) => n.id === id);

describe('analyseTactics: consistency rules', () => {
  it.each([
    ['press-deep', { pressing: 'high', defensiveLine: 'deep' }],
    ['attack-deep', { mentality: 'very-attacking', defensiveLine: 'deep' }],
    ['defend-high', { mentality: 'defensive', defensiveLine: 'high' }],
    ['direct-slow', { passing: 'direct', tempo: 'slow' }],
  ] as const)('warns about %s', (id, tactics) => {
    expect(find(notesFor(tactics), id)?.tone).toBe('warning');
  });

  it('has nothing to say about the balanced defaults', () => {
    expect(notesFor({})).toEqual([]);
  });

  it.each(PLAYING_STYLE_LIST.map((s) => [s.name, s.tactics] as const))(
    'the %s preset is internally consistent',
    (_name, tactics) => {
      const ids = analyseTactics(tactics, lineup, squad).map((n) => n.id);
      for (const rule of ['press-deep', 'attack-deep', 'defend-high', 'direct-slow']) expect(ids).not.toContain(rule);
    },
  );
});

describe('analyseTactics: suitability rules', () => {
  it.each([
    ['high-line-pace', { defensiveLine: 'high' }, ['pace', 'acceleration']],
    ['pressing-fitness', { pressing: 'high' }, ['stamina', 'workRate']],
    ['possession-technique', { passing: 'short' }, ['passing', 'firstTouch', 'composure']],
    ['width-crossing', { width: 'wide' }, ['crossing']],
    ['direct-target', { passing: 'direct' }, ['heading', 'strength', 'pace', 'acceleration']],
  ] as const)('%s: warns when weak, praises when strong', (id, tactics, keys) => {
    expect(find(notesFor(tactics, withAttributes(keys, WEAK - 3)), id)?.tone).toBe('warning');
    expect(find(notesFor(tactics, withAttributes(keys, STRONG + 2)), id)?.tone).toBe('positive');
  });

  it('stays quiet when the unit is average', () => {
    const average = withAttributes(['pace', 'acceleration'], 12);
    expect(find(notesFor({ defensiveLine: 'high' }, average), 'high-line-pace')).toBeUndefined();
  });

  it('only checks a rule when its instruction is active', () => {
    const slow = withAttributes(['pace', 'acceleration'], 3);
    expect(find(notesFor({ defensiveLine: 'standard' }, slow), 'high-line-pace')).toBeUndefined();
  });

  it('a slow tempo also triggers the technique check', () => {
    const clumsy = withAttributes(['passing', 'firstTouch', 'composure'], 4);
    expect(find(notesFor({ tempo: 'slow' }, clumsy), 'possession-technique')?.tone).toBe('warning');
  });

  it('includes the unit average in the message', () => {
    const note = find(notesFor({ width: 'wide' }, withAttributes(['crossing'], 6)), 'width-crossing');
    expect(note?.message).toContain('6.0');
  });

  it('judges players by the slot they fill, not their natural position', () => {
    // Put only the centre-backs' pace at 20 and everyone else's at 1.
    const cbIds = new Set([lineup.starters.LCB, lineup.starters.RCB]);
    const candidates = withAttributes(['pace', 'acceleration'], 1).map((c) =>
      cbIds.has(c.player.id)
        ? { ...c, attributes: { ...c.attributes, physical: { ...c.attributes.physical, pace: 20, acceleration: 20 } } }
        : c,
    );
    expect(find(notesFor({ defensiveLine: 'high' }, candidates), 'high-line-pace')?.tone).toBe('positive');
  });

  it('skips unit checks when nobody fills that unit', () => {
    const emptyLineup = { ...lineup, starters: Object.fromEntries(Object.keys(lineup.starters).map((k) => [k, null])) };
    expect(analyseTactics({ ...DEFAULT_TACTICS, width: 'wide' }, emptyLineup, squad)).toEqual([]);
  });

  it('lists warnings before positives', () => {
    const mixed = withAttributes(['crossing'], 18);
    const notes = analyseTactics(
      { ...DEFAULT_TACTICS, width: 'wide', passing: 'direct', tempo: 'slow' },
      lineup,
      mixed,
    );
    const tones = notes.map((n) => n.tone);
    expect(tones).toEqual([...tones].sort((a, b) => (a === b ? 0 : a === 'warning' ? -1 : 1)));
    expect(tones).toContain('positive');
    expect(tones).toContain('warning');
  });
});
