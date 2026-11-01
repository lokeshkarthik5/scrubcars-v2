import {
  AADHAAR_MASK_NOTE,
  DOCUMENT_HINTS,
  DOCUMENT_STATUS_LABELS,
  fileLine,
  garageCanRemove,
} from '@repo/core/vendor-documents';
import * as DocumentPicker from 'expo-document-picker';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Pressable, View } from 'react-native';

import {
  getGarageDocumentLink,
  type GarageDocument,
  type GarageDocuments,
  removeGarageDocument,
  uploadGarageDocument,
} from '@/lib/documents-api';
import { prepareDocumentFiles } from '@/lib/documents-upload';
import {
  chosenFilesProblem,
  dayLabel,
  fileSideLabel,
  inSentence,
  OPEN_FAILED,
  type PickedDocument,
  pickedLine,
  REMOVE_FAILED,
  removePrompt,
  sideOrdered,
  STATUS_TONE,
  UPLOAD_FAILED,
  uploadHint,
  viewLabel,
} from '@/lib/documents-view';
import { errorText } from '@/lib/error-text';
import { discardAfterShare, discardCached, newPrivateFile } from '@/lib/private-cache';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { Label, ScButton } from '@repo/native-ui/button';
import { DateField } from './form-controls';
import { IconCamera } from '@repo/native-ui/icons';
import { IconEye, IconFileText, IconPhoto, IconShieldCheckFilled, IconUpload } from './owner-icons';
import { Notice, ScCard } from '@repo/native-ui/primitives';
import { AFTER_SHEET_MS, ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';

/** The status chip: a dot, but an approved one has the shield instead. */
function DocumentChip({ status }: { status: GarageDocument['status'] }) {
  const colors = useColors();
  const styles = useStyles();
  const tone = colors.tones[STATUS_TONE[status]];
  return (
    <View style={[styles.chip, { backgroundColor: tone.tint }]}>
      {status === 'approved' ? (
        <IconShieldCheckFilled size={12} color={tone.text} />
      ) : (
        <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      )}
      <T size={12} weight={500} lh={16} color={tone.text} numberOfLines={1}>
        {DOCUMENT_STATUS_LABELS[status]}
      </T>
    </View>
  );
}

const LIBRARY_LIMIT = 2;

/** From the Files app: a PDF or a photo, one or two. */
async function fromFiles(): Promise<PickedDocument[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
  }));
}

/** From the photo library, up to two. */
async function fromLibrary(): Promise<PickedDocument[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsMultipleSelection: true,
    selectionLimit: LIBRARY_LIMIT,
    exif: false,
  });
  if (result.canceled) return [];
  return result.assets.map((asset, index) => ({
    uri: asset.uri,
    name: asset.fileName ?? `Photo ${index + 1}`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    size: asset.fileSize,
  }));
}

/** One photo from the camera. */
async function fromCamera(): Promise<PickedDocument[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Allow the camera in Settings to take a photo.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', exif: false });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.fileName ?? 'Photo',
    mimeType: asset.mimeType ?? 'image/jpeg',
    size: asset.fileSize,
  }));
}

function SourceRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.source}>
      {icon}
      <T size={15} weight={500}>
        {label}
      </T>
    </Pressable>
  );
}

/**
 * One document of Settings > Documents (DocumentCard in apps/vendors/app/settings/documents/page.tsx):
 * its status, what to upload, what to fix, its files (each opened through a five-minute signed
 * link, never kept), and Upload / Replace / Remove. The web opens a file chooser; here a sheet
 * offers the Files app, the photo library and (on a phone) the camera. A photo is re-encoded as
 * JPEG by photo-prepare.ts, which drops its location; a PDF is sent as it is.
 */
export function DocumentCard({
  doc,
  onUploaded,
  onRemoved,
}: {
  doc: GarageDocument;
  onUploaded: (doc: GarageDocument) => void;
  /** Removed (0065): the documents as they are now. */
  onRemoved: (documents: GarageDocuments) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const [picked, setPicked] = useState<PickedDocument[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [expiresOn, setExpiresOn] = useState(doc.expiresOn ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const problem = picked.length > 0 ? chosenFilesProblem(picked) : null;

  const choose = async (source: () => Promise<PickedDocument[]>) => {
    setChoosing(false);
    setError('');
    try {
      // The sheet is still going away; the system picker waits for it.
      await new Promise((resolve) => setTimeout(resolve, AFTER_SHEET_MS));
      setPicked(await source());
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t open that.'));
    }
  };

  const send = async () => {
    if (problem || picked.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const files = await prepareDocumentFiles(picked);
      const next = await uploadGarageDocument({ type: doc.type, files, expiresOn: expiresOn || null });
      discardCached(picked.map((p) => p.uri));
      setPicked([]);
      toast.success(`${doc.label} sent for review`);
      onUploaded(next);
    } catch (err) {
      setError(errorText(err, UPLOAD_FAILED));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!doc.id) return;
    setBusy(true);
    setError('');
    try {
      const next = await removeGarageDocument(doc.id);
      setConfirmRemove(false);
      toast.success(`${doc.label} removed`);
      onRemoved(next);
    } catch (err) {
      setError(errorText(err, REMOVE_FAILED));
    } finally {
      setBusy(false);
    }
  };

  // The link works for five minutes; it is opened once and not kept anywhere. iOS shows it in the
  // in-app Safari view. Android's browser (Chrome) tends to download a PDF into shared storage
  // (Downloads), where any app can read an ID, so there the file is fetched into the app's private
  // cache, handed to the person's chosen viewer, and deleted.
  const view = async (fileId: string) => {
    if (!doc.id) return;
    try {
      const { url } = await getGarageDocumentLink(doc.id, fileId);
      if (Platform.OS !== 'android') {
        await WebBrowser.openBrowserAsync(url);
        return;
      }
      const contentType = doc.files.find((f) => f.id === fileId)?.contentType ?? 'application/pdf';
      const file = newPrivateFile(contentType);
      try {
        await File.downloadFileAsync(url, file, { idempotent: true });
        await Sharing.shareAsync(file.uri, { mimeType: contentType, dialogTitle: doc.label });
      } finally {
        discardAfterShare(file);
      }
    } catch (err) {
      toast.error(errorText(err, OPEN_FAILED));
    }
  };

  const cameraOn = Device.isDevice;

  return (
    <ScCard accessibilityLabel={doc.label} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <T size={13} weight={600}>
            {doc.label}
          </T>
          <T size={11} color={colors.textMuted}>
            {doc.required ? 'Required' : 'Optional'}
          </T>
        </View>
        <DocumentChip status={doc.status} />
      </View>

      <T size={12} color={colors.textSecondary} lh={20}>
        {DOCUMENT_HINTS[doc.type]}
      </T>
      {doc.type === 'owner_id' ? (
        <T size={12} weight={500}>{`${AADHAAR_MASK_NOTE}.`}</T>
      ) : null}

      {doc.status === 'rejected' && doc.rejectionReason ? (
        <Notice title="What to fix">{doc.rejectionReason}</Notice>
      ) : null}

      {doc.files.length > 0 ? (
        <View style={styles.files}>
          {sideOrdered(doc.files).map((file) => (
            <View key={file.id} style={styles.file}>
              <View style={[styles.fileName, styles.flex]}>
                <IconFileText size={14} color={colors.textSecondary} />
                <T size={12} color={colors.textSecondary} numberOfLines={1} style={styles.flex}>
                  {`${fileSideLabel(doc.files.length, file.side)} · `}
                  <T num size={12} color={colors.textSecondary}>
                    {fileLine(file)}
                  </T>
                </T>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={viewLabel(doc.label, doc.files.length, file.side)}
                onPress={() => void view(file.id)}
                style={styles.view}
              >
                <IconEye size={14} />
                <T size={12} weight={500}>
                  View
                </T>
              </Pressable>
            </View>
          ))}
          {doc.expiresOn ? (
            <T size={12} color={colors.textSecondary}>
              {'Expires '}
              <T num size={12} color={colors.textSecondary}>
                {dayLabel(doc.expiresOn)}
              </T>
            </T>
          ) : null}
          {doc.uploadedByDetlio ? (
            <T size={11} color={colors.textMuted}>
              Uploaded by Detlio
            </T>
          ) : null}
        </View>
      ) : null}

      {confirmRemove ? (
        <View accessibilityLabel={`Remove ${doc.label}?`} style={styles.section}>
          <T size={13}>{removePrompt(doc.label)}</T>
          {error ? (
            <T accessibilityRole="alert" size={12} color={colors.error}>
              {error}
            </T>
          ) : null}
          <View style={styles.buttons}>
            <ScButton variant="outline" fullWidth={false} style={styles.flex} onPress={() => void remove()} disabled={busy}>
              {busy ? 'Removing…' : `Remove ${inSentence(doc.label)}`}
            </ScButton>
            <ScButton
              variant="outline"
              fullWidth={false}
              paddingX={16}
              disabled={busy}
              onPress={() => setConfirmRemove(false)}
            >
              Keep it
            </ScButton>
          </View>
        </View>
      ) : picked.length === 0 ? (
        <View style={styles.gap4}>
          <ScButton variant="outline" onPress={() => setChoosing(true)}>
            <IconUpload size={16} />
            <Label>
              {doc.status === 'missing' ? `Upload ${inSentence(doc.label)}` : `Replace ${inSentence(doc.label)}`}
            </Label>
          </ScButton>
          <T size={13} color={colors.textSecondary}>
            {uploadHint(doc)}
          </T>
          {garageCanRemove(doc) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${doc.label}`}
              onPress={() => {
                setError('');
                setConfirmRemove(true);
              }}
              style={styles.removeLink}
            >
              <T size={12} weight={500} color={colors.textSecondary} style={styles.underline}>
                Remove
              </T>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.gap4}>
            {picked.map((file, index) => (
              <T key={`${file.name}-${index}`} size={12} color={colors.textSecondary} numberOfLines={1}>
                {pickedLine(index, picked.length, file.name)}
              </T>
            ))}
          </View>
          {doc.takesExpiry ? (
            <View style={styles.gap4}>
              <DateField label="Expiry date (optional)" value={expiresOn} onChange={setExpiresOn} placeholder="" />
              {expiresOn ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear the expiry date"
                  onPress={() => setExpiresOn('')}
                  style={styles.removeLink}
                >
                  <T size={12} weight={500} color={colors.textSecondary} style={styles.underline}>
                    Clear date
                  </T>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {problem ? (
            <T size={12} color={colors.error}>
              {problem}
            </T>
          ) : null}
          {error ? (
            <T accessibilityRole="alert" size={12} color={colors.error}>
              {error}
            </T>
          ) : null}
          <View style={styles.buttons}>
            <ScButton
              variant="main"
              size="lg"
              fullWidth={false}
              style={styles.flex}
              onPress={() => void send()}
              disabled={busy || Boolean(problem)}
            >
              {busy ? 'Sending…' : 'Send for review'}
            </ScButton>
            <ScButton
              variant="outline"
              fullWidth={false}
              paddingX={16}
              disabled={busy}
              onPress={() => {
                discardCached(picked.map((p) => p.uri));
                setPicked([]);
              }}
            >
              Cancel
            </ScButton>
          </View>
        </View>
      )}

      <ScSheet open={choosing} onClose={() => setChoosing(false)} accessibilityLabel={`Choose files for ${doc.label}`}>
        <View style={styles.sources}>
          <SourceRow icon={<IconFileText size={20} />} label="Choose a file (PDF or photo)" onPress={() => void choose(fromFiles)} />
          <SourceRow icon={<IconPhoto size={20} />} label="Photo library" onPress={() => void choose(fromLibrary)} />
          {cameraOn ? (
            <SourceRow icon={<IconCamera size={20} />} label="Take a photo" onPress={() => void choose(fromCamera)} />
          ) : null}
        </View>
      </ScSheet>
    </ScCard>
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  chip: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  files: { gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  file: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fileName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  view: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  section: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  gap4: { gap: 4 },
  buttons: { flexDirection: 'row', gap: 8 },
  removeLink: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  sources: { paddingHorizontal: 16 },
  source: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
}));
