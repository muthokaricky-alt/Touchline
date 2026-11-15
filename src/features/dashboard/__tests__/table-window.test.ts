import { getTableWindow } from '../table-window';

const table = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((clubId) => ({ clubId }));
const ids = (rows: { clubId: string }[]) => rows.map((r) => r.clubId).join('');

describe('getTableWindow', () => {
  it('centres the window on the club', () => {
    expect(ids(getTableWindow(table, 'd', 5))).toBe('bcdef');
  });

  it('does not run past the top of the table', () => {
    expect(ids(getTableWindow(table, 'a', 5))).toBe('abcde');
    expect(ids(getTableWindow(table, 'b', 5))).toBe('abcde');
  });

  it('does not run past the bottom of the table', () => {
    expect(ids(getTableWindow(table, 'h', 5))).toBe('defgh');
  });

  it('returns the whole table when it is smaller than the window', () => {
    expect(ids(getTableWindow(table.slice(0, 3), 'b', 5))).toBe('abc');
  });

  it('falls back to the top rows when the club is missing', () => {
    expect(ids(getTableWindow(table, 'zz', 3))).toBe('abc');
  });

  it('handles empty input and non-positive sizes', () => {
    expect(getTableWindow([], 'a', 5)).toEqual([]);
    expect(getTableWindow(table, 'a', 0)).toEqual([]);
  });
});
