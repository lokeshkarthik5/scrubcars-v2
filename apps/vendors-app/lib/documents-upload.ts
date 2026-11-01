import { MAX_DOCUMENT_BYTES } from '@repo/core/vendor-documents';
import { File } from 'expo-file-system';

import type { PreparedDocumentFile } from './documents-api';
import { contentTypeOf, type PickedDocument } from './documents-view';
import { prepareForUpload } from './photo-prepare';

/**
 * The phone's half of apps/vendors' document upload (core api/documents.ts `cleaned`): a
 * photo is re-encoded as JPEG by photo-prepare.ts, which drops its location and EXIF
 * (never core's stripImageMetadata); a PDF is sent as it is. The sizes are checked on
 * the real bytes, since a picker may not know them.
 */
export async function prepareDocumentFiles(files: PickedDocument[]): Promise<PreparedDocumentFile[]> {
  const prepared: PreparedDocumentFile[] = [];
  for (const file of files) {
    if (contentTypeOf(file) === 'application/pdf') {
      const bytes = await new File(file.uri).bytes();
      if (bytes.length === 0) throw new Error(`${file.name} is empty.`);
      if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error('Files can be up to 10 MB.');
      prepared.push({ bytes, contentType: 'application/pdf' });
    } else {
      const photo = await prepareForUpload(file.uri, file.name);
      prepared.push({ bytes: photo.bytes, contentType: 'image/jpeg' });
    }
  }
  return prepared;
}
