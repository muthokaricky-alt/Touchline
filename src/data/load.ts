import { checkIntegrity } from './integrity';
import { GameDatabaseSchema, type GameDatabase } from './schemas';

/**
 * Result type instead of throwing: the caller *has* to check `ok` before
 * touching `database`, and gets every problem at once rather than the first.
 */
export type DatabaseLoadResult =
  | { ok: true; database: GameDatabase }
  | { ok: false; errors: string[] };

/**
 * The single entry point for data from outside our code (JSON imports, save
 * files, future cloud data). Two stages:
 *   1. Zod: is every record the right shape?
 *   2. Integrity: do the records reference each other correctly?
 */
export function parseDatabase(raw: unknown): DatabaseLoadResult {
  const parsed = GameDatabaseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.map(String).join('.') || '(root)';
        return `${path}: ${issue.message}`;
      }),
    };
  }

  const issues = checkIntegrity(parsed.data);
  if (issues.length > 0) {
    return { ok: false, errors: issues.map((i) => `[${i.rule}] ${i.message}`) };
  }

  return { ok: true, database: parsed.data };
}
