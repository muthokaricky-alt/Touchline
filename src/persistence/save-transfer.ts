import { summarise, type SlotSummary } from './slot-storage';

/**
 * Exported save files (Milestone 10a): a small JSON wrapper around the save
 * exactly as it's stored (uncompressed, so the file is readable and future
 * versions can still migrate it). Importing goes through the same checks as
 * loading (the store's `validatePersisted`) before anything is written.
 */

export const EXPORT_FORMAT = 'touchline-save';

export type ExportFile = { fileName: string; contents: string };

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'career';

/** Wraps a persisted save (`{ state, version }` JSON) as a file. Null if it isn't a save. */
export function exportFile(persistedJson: string, now: Date): ExportFile | null {
  const summary = summarise(persistedJson, now.getTime());
  if (!summary) return null;
  const date = now.toISOString().slice(0, 10);
  return {
    fileName: `touchline-${slug(summary.managerName ?? 'career')}-${slug(summary.seasonLabel)}-${date}.json`,
    contents: JSON.stringify({ format: EXPORT_FORMAT, exportedAt: now.toISOString(), summary, save: JSON.parse(persistedJson) }),
  };
}

export type ParsedImport = { ok: true; save: { state: unknown; version: number }; summary: SlotSummary | null } | { ok: false; reason: string };

/** Reads an exported file's text. Only checks the wrapper; the save itself is validated by the store. */
export function parseImportFile(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file isn't a Touchline save (it isn't valid JSON)." };
  }
  if (typeof data !== 'object' || data === null || (data as { format?: unknown }).format !== EXPORT_FORMAT) {
    return { ok: false, reason: "That file isn't a Touchline save." };
  }
  const save = (data as { save?: unknown }).save;
  if (typeof save !== 'object' || save === null || !('state' in save) || typeof (save as { version?: unknown }).version !== 'number') {
    return { ok: false, reason: 'That save file is damaged.' };
  }
  const typed = save as { state: unknown; version: number };
  return { ok: true, save: typed, summary: summarise(JSON.stringify(typed), Date.now()) };
}
