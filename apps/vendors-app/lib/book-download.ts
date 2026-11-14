import { downloadBook } from '@repo/core/api/garage-book';
import { t } from '@repo/core/i18n';
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
    await Sharing.shareAsync(file.uri, { mimeType: XLSX, UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: t('Your book') });
  } finally {
    discardAfterShare(file);
  }
  return true;
}

/**
 * The booking link's poster (Stage 2): no PDF printer is built into the app, so the poster is
 * a one-page HTML file offered through the share sheet, where Print, Save to Files and the
 * rest are. Deleted once shared. False when the phone has no share sheet.
 */
export async function sharePoster(html: string, fileName: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const file = newPrivateFile('text/html', fileName);
  try {
    file.write(html);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/html', UTI: 'public.html', dialogTitle: t('Your poster') });
  } finally {
    discardAfterShare(file);
  }
  return true;
}
