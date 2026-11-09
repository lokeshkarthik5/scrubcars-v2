import { downloadBook } from '@repo/core/api/garage-book';
import * as Sharing from 'expo-sharing';

import { discardAfterShare, newPrivateFile } from './private-cache';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Download my book on a phone (the web saves the file through a link): written to the app's
 * private cache folder, offered through the share sheet (Save to Files, Mail, Sheets...), and
 * deleted once shared, as the earnings CSV is. False when the phone has no share sheet.
 */
export async function shareBook(fileName: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const bytes = await downloadBook();
  const file = newPrivateFile(XLSX, fileName);
  try {
    file.write(new Uint8Array(bytes));
    await Sharing.shareAsync(file.uri, { mimeType: XLSX, UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: 'Your book' });
  } finally {
    discardAfterShare(file);
  }
  return true;
}
