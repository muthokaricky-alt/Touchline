/**
 * WEB save files: export is a normal browser download; import is a hidden
 * file input. No libraries needed (expo-sharing can't share local files on
 * the web).
 */

export async function shareSaveFile(fileName: string, contents: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before freeing the data.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The chosen file's text, or null if the user cancelled (browsers may never report a cancel). */
export function pickSaveFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}
