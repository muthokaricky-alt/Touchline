import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * NATIVE save files (iOS/Android): export writes the file to the cache
 * directory and opens the share sheet (save to Files, Drive, email…);
 * import opens the system file picker. All three modules are in Expo Go.
 *
 * Web uses plain browser APIs instead (save-file.web.ts): Metro picks the
 * right file per platform, callers just import './save-file'.
 */

export async function shareSaveFile(fileName: string, contents: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.writeSync(contents); // must be on disk before the share sheet opens
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export Touchline save', UTI: 'public.json' });
}

/** The chosen file's text, or null if the user cancelled. */
export async function pickSaveFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  return new File(result.assets[0].uri).text();
}
