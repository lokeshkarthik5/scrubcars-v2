import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * The CSV button on a phone. The web saves a Blob through a link, which has no native
 * twin: the file is written to the cache and the share sheet offers it (Save to Files,
 * Mail, Sheets...). Returns false when this phone has no share sheet.
 */
export async function shareCsv(text: string, fileName: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  await file.write(text);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Your earnings',
  });
  return true;
}
