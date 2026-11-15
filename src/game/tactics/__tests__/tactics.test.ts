import { matchPlayingStyle, PLAYING_STYLE_IDS, PLAYING_STYLE_LIST, PLAYING_STYLES } from '../presets';
import {
  DEFAULT_TACTICS,
  INSTRUCTION_OPTIONS,
  INSTRUCTION_ORDER,
  setInstruction,
  TacticsSchema,
  tacticsEqual,
} from '../tactics';

describe('TacticsSchema', () => {
  it('accepts the defaults', () => {
    expect(TacticsSchema.safeParse(DEFAULT_TACTICS).success).toBe(true);
  });

  it.each([
    ['an unknown option', { pressing: 'extreme' }],
    ['an option from another instruction', { width: 'high' }],
    ['an unknown instruction', { tikiTaka: true }],
  ])('rejects %s', (_label, change) => {
    expect(TacticsSchema.safeParse({ ...DEFAULT_TACTICS, ...change }).success).toBe(false);
  });

  it('lists every instruction once in the display order', () => {
    expect([...INSTRUCTION_ORDER].sort()).toEqual(Object.keys(INSTRUCTION_OPTIONS).sort());
    expect([...INSTRUCTION_ORDER].sort()).toEqual(Object.keys(DEFAULT_TACTICS).sort());
  });
});

describe('setInstruction', () => {
  it('changes one instruction and leaves the rest', () => {
    const next = setInstruction(DEFAULT_TACTICS, 'pressing', 'high');
    expect(next.pressing).toBe('high');
    expect({ ...next, pressing: DEFAULT_TACTICS.pressing }).toEqual(DEFAULT_TACTICS);
  });

  it('does not mutate the input', () => {
    const before = { ...DEFAULT_TACTICS };
    setInstruction(DEFAULT_TACTICS, 'width', 'wide');
    expect(DEFAULT_TACTICS).toEqual(before);
  });

  it('returns the same object when nothing changes', () => {
    expect(setInstruction(DEFAULT_TACTICS, 'tempo', 'normal')).toBe(DEFAULT_TACTICS);
  });
});

describe('playing styles', () => {
  it.each(PLAYING_STYLE_IDS)('%s has valid tactics and matches itself', (id) => {
    const style = PLAYING_STYLES[id];
    expect(style.id).toBe(id);
    expect(TacticsSchema.safeParse(style.tactics).success).toBe(true);
    expect(matchPlayingStyle(style.tactics)?.id).toBe(id);
  });

  it('are all different from each other', () => {
    for (const a of PLAYING_STYLE_LIST) {
      for (const b of PLAYING_STYLE_LIST) {
        if (a.id !== b.id) expect(tacticsEqual(a.tactics, b.tactics)).toBe(false);
      }
    }
  });

  it('becomes custom (null) when one instruction changes', () => {
    const tweaked = setInstruction(PLAYING_STYLES.counter.tactics, 'width', 'wide');
    expect(matchPlayingStyle(tweaked)).toBeNull();
  });

  it('defaults to Balanced', () => {
    expect(matchPlayingStyle(DEFAULT_TACTICS)?.id).toBe('balanced');
  });
});
