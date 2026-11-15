/**
 * Returns a slice of `rows` of length `size` centred on the row whose
 * `clubId` matches, shifted so it never runs past either end of the table.
 * Used for the "your position" mini league table on the dashboard.
 *
 * If the club isn't in the table, the top `size` rows are returned.
 */
export function getTableWindow<T extends { clubId: string }>(
  rows: readonly T[],
  clubId: string,
  size: number,
): T[] {
  if (size <= 0 || rows.length === 0) return [];
  if (rows.length <= size) return [...rows];

  const index = rows.findIndex((row) => row.clubId === clubId);
  if (index === -1) return rows.slice(0, size);

  const half = Math.floor(size / 2);
  const start = Math.min(Math.max(index - half, 0), rows.length - size);
  return rows.slice(start, start + size);
}
