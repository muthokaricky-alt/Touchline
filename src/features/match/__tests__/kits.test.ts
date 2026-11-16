import { CLASH_DISTANCE, colourDistance, matchKits } from '../kits';

describe('matchKits', () => {
  it('gives home its primary colour and away its primary when they differ', () => {
    const kits = matchKits({ primary: '#1E4FA3', secondary: '#FFFFFF' }, { primary: '#C8102E', secondary: '#111111' });
    expect(kits.home.fill).toBe('#1E4FA3');
    expect(kits.away.fill).toBe('#C8102E');
  });

  it('switches the away side to its second colour when the main colours clash', () => {
    const kits = matchKits({ primary: '#C8102E', secondary: '#FFFFFF' }, { primary: '#B5462F', secondary: '#1B1B1B' });
    expect(colourDistance('#C8102E', '#B5462F')).toBeLessThan(CLASH_DISTANCE);
    expect(kits.away.fill).toBe('#1B1B1B');
  });

  it('picks a readable shirt-number colour', () => {
    expect(matchKits({ primary: '#FFFFFF', secondary: '#000000' }, { primary: '#101820', secondary: '#FFFFFF' })).toEqual({
      home: { fill: '#FFFFFF', text: '#101820' },
      away: { fill: '#101820', text: '#FFFFFF' },
    });
  });
});
