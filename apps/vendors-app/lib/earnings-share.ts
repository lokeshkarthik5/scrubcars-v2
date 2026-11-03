import * as Sharing from 'expo-sharing';

import { discardAfterShare, newPrivateFile } from './private-cache';

/**
 * The CSV button on a phone. The web saves a Blob through a link, which has no native
 * twin: the file is written to the app's private cache folder and the share sheet offers it
 * (Save to Files, Mail, Sheets...). It is deleted once shared (private-cache.ts), and anything
 * left is cleared on sign-out. Returns false when this phone has no share sheet.
 */
export async function shareCsv(text: string, fileName: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const file = newPrivateFile('text/csv', fileName);
  try {
    await file.write(text);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Your earnings',
    });
  } finally {
    discardAfterShare(file);
  }
  return true;
}
