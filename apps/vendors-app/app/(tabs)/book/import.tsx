import type { ImportExtract, ImportRow, ImportSource } from '@repo/core/api/garage-book';
import { useCommitBookImport, useExtractBookImport } from '@repo/core/api/hooks/use-garage-book';
import { GARAGE_BOOK_2_LIMITS, GARAGE_BOOK_LIMITS } from '@repo/core/garage-book';
import { msg, useT, useTn } from '@repo/core/i18n';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { Edge, Raised, RedButton } from '@repo/native-ui/finish';
import { IconCamera, IconCheck, IconFileInvoice } from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { Spinner } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { AMBER, BackHeader, BookInput, Empty, FieldLabel, Footnote, go, OK, RaisedButton, Row, Seg } from '@/components/book/parts';
import { useIsVendorAdmin } from '@/lib/auth';
import { importFlag, importKind, importLine, importPayload } from '@/lib/garage-book-2';
import { prepareForUpload } from '@/lib/photo-prepare';
import { discardCached } from '@/lib/private-cache';

type From = 'photos' | 'sheet';
type Page = { uri: string; dataBase64: string };

/**
 * Bring in your book (I1, the owner's; the web's app/book/import/page.tsx): photos of the paper
 * book, or an Excel or Tally file, read into rows the owner checks. Nothing is added until
 * "Add to my book", and the files are never kept, on the phone or the server.
 */
function ImportScreen() {
  const t = useT();
  const tn = useTn();
  const styles = useStyles();
  const colors = useColors();
  const isOwner = useIsVendorAdmin();
  const extract = useExtractBookImport();
  const commit = useCommitBookImport();
  const [from, setFrom] = useState<From>('photos');
  const [pages, setPages] = useState<Page[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [read, setRead] = useState<ImportExtract | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [dropped, setDropped] = useState<ReadonlySet<number>>(new Set());
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const [checking, setChecking] = useState<number | null>(null);
  const [done, setDone] = useState<{ added: number; merged: number; skipped: number } | null>(null);
  const failed = (error: unknown) => toast.error(error instanceof Error ? error.message : t("Couldn't read that. Try again."));

  const start = (next: ImportExtract) => {
    setRead(next);
    setRows(next.rows);
    setDropped(new Set());
    setChecked(new Set());
  };
  const readNow = (source: ImportSource) => extract.mutate(source, { onSuccess: start, onError: failed });

  const addPage = async () => {
    const room = GARAGE_BOOK_2_LIMITS.importPhotosMax - pages.length;
    if (room <= 0) return;
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', exif: false });
    } catch {
      // No camera (a simulator): the photo library instead.
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', exif: false, allowsMultipleSelection: room > 1, selectionLimit: room });
    }
    if (result.canceled) return;
    setPreparing(true);
    try {
      const added: Page[] = [];
      for (const asset of result.assets.slice(0, room)) {
        const photo = await prepareForUpload(asset.uri, t('This page'));
        added.push({ uri: photo.uri, dataBase64: await new File(photo.uri).base64() });
      }
      setPages((current) => [...current, ...added].slice(0, GARAGE_BOOK_2_LIMITS.importPhotosMax));
      setRead(null);
    } catch (error) {
      failed(error);
    } finally {
      setPreparing(false);
    }
  };

  const pickSheet = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    try {
      if (importKind(asset.name, asset.mimeType) !== 'sheet') throw new Error(t('Choose an Excel (.xlsx) or CSV file, or a Tally export.'));
      const dataBase64 = await new File(asset.uri).base64();
      readNow({ source: 'sheet', name: asset.name, dataBase64 });
    } catch (error) {
      failed(error);
    } finally {
      discardCached([asset.uri]);
    }
  };

  const add = () => {
    const payload = importPayload(rows, dropped);
    if (payload.length === 0) return;
    commit.mutate(payload, {
      onSuccess: (counts) => {
        discardCached(pages.map((page) => page.uri));
        setPages([]);
        setDone(counts);
      },
      onError: failed,
    });
  };

  const kept = importPayload(rows, dropped).length;
  const needLook = rows.filter((row, index) => !dropped.has(index) && !checked.has(index) && importFlag(row)).length;
  const editing = checking === null ? null : (rows[checking] ?? null);

  return (
    <BookScreen
      gap={14}
      hasNav={!read || done !== null}
      footer={
        read && !done && isOwner ? (
          <View style={styles.bar}>
            <View style={styles.flex}>
              <T variant="over" color={colors.textMuted}>
                {t('Ready')}
              </T>
              <T num size={18} weight={600}>
                {tn(kept, '{count} customer', '{count} customers')}
              </T>
            </View>
            <RedButton onPress={add} disabled={kept === 0 || commit.isPending} height={52} radius={18} style={styles.addButton}>
              {commit.isPending ? t('Adding…') : t('Add to my book')}
            </RedButton>
          </View>
        ) : undefined
      }
    >
      <BackHeader title={t('Bring in your book')} />
      {!isOwner ? (
        <Empty>{t('Only the garage’s owner can bring in a book.')}</Empty>
      ) : done ? (
        <>
          <Edge radius={20} innerStyle={styles.summary}>
            <T size={15} weight={600}>
              {tn(done.added, '{count} customer added to your book', '{count} customers added to your book')}
            </T>
            <T size={12} color={colors.textSecondary} style={styles.subLine}>
              {[
                done.merged ? tn(done.merged, '{count} already there, brought up to date', '{count} already there, brought up to date') : null,
                done.skipped ? tn(done.skipped, '{count} left out', '{count} left out') : null,
              ]
                .filter(Boolean)
                .join(' · ') || t('Everything went in.')}
            </T>
          </Edge>
          <RaisedButton label={t('See my customers')} onPress={() => go('/book/customers')} />
        </>
      ) : (
        <>
          <Seg<From>
            label={msg('From')}
            value={from}
            onChange={(next) => {
              setFrom(next);
              setRead(null);
            }}
            options={[
              { value: 'photos', label: msg('Photo of my book') },
              { value: 'sheet', label: msg('Excel or Tally') },
            ]}
          />
          {from === 'photos' ? (
            <>
              <View style={styles.pages}>
                {pages.map((page, index) => (
                  <Image
                    key={page.uri}
                    source={{ uri: page.uri }}
                    accessibilityLabel={t('Page {n}', { n: index + 1 })}
                    style={[styles.page, { transform: [{ rotate: `${(index - 1) * 3}deg` }] }]}
                  />
                ))}
                {pages.length < GARAGE_BOOK_2_LIMITS.importPhotosMax ? (
                  <PressScale accessibilityRole="button" accessibilityLabel={t('Add page')} disabled={preparing} onPress={() => void addPage()}>
                    <Raised radius={10} style={styles.page} innerStyle={styles.addPage}>
                      {preparing ? <Spinner size={18} /> : <IconCamera size={20} />}
                      <T size={11} weight={600} align="center">
                        {t('Add page')}
                      </T>
                    </Raised>
                  </PressScale>
                ) : null}
              </View>
              {pages.length > 0 && !read ? (
                <RaisedButton
                  label={extract.isPending ? t('Reading your book…') : tn(pages.length, 'Read {count} page', 'Read {count} pages')}
                  disabled={extract.isPending || preparing}
                  onPress={() => readNow({ source: 'photos', files: pages.map((page, index) => ({ name: `page-${index + 1}.jpg`, mimeType: 'image/jpeg', dataBase64: page.dataBase64 })) })}
                />
              ) : null}
              {pages.length === 0 ? <Footnote>{t('Take a clear photo of each page of your customer book, up to 5 pages. We read the names, phones and cars.')}</Footnote> : null}
            </>
          ) : (
            <>
              <RaisedButton
                label={extract.isPending ? t('Reading your file…') : t('Choose the file')}
                icon={<IconFileInvoice size={18} />}
                disabled={extract.isPending}
                onPress={() => void pickSheet()}
              />
              {!read ? <Footnote>{t('An Excel or CSV file with your customers, or a Tally export. Names, phones, cars and money owed come in.')}</Footnote> : null}
            </>
          )}
          {read ? (
            <>
              <Edge radius={20} innerStyle={styles.summary}>
                <T size={15} weight={600}>
                  {t('We read {customers} and {cars}', {
                    customers: tn(read.counts.customers, '{count} customer', '{count} customers'),
                    cars: tn(read.counts.cars, '{count} car', '{count} cars'),
                  })}
                </T>
                <T size={12} color={colors.textSecondary} style={styles.subLine}>
                  {needLook > 0
                    ? t('{count} need a look. Nothing is added until you say so.', { count: needLook })
                    : t('Nothing is added until you say so.')}
                </T>
              </Edge>
              {rows.length === 0 ? (
                <Empty>{t('We found no customers in that. Try clearer photos or another file.')}</Empty>
              ) : (
                <View>
                  {rows.map((row, index) => {
                    const out = dropped.has(index);
                    const flag = checked.has(index) ? null : importFlag(row);
                    return (
                      <Row key={index} style={out && styles.out}>
                        <View style={styles.flex}>
                          <T size={14} weight={600} numberOfLines={1}>
                            {row.name ?? t('No name')}
                          </T>
                          <T size={12} color={out ? colors.textMuted : flag ? AMBER : colors.textSecondary} numberOfLines={2} style={styles.subLine}>
                            {out ? t('Left out') : (flag ?? importLine(row))}
                          </T>
                        </View>
                        {flag || out ? (
                          <PressScale accessibilityRole="button" accessibilityLabel={t('Check {name}', { name: row.name ?? '' })} onPress={() => setChecking(index)}>
                            <Raised radius={10} style={styles.check} innerStyle={styles.checkInner}>
                              <T size={13} weight={600} color={out ? colors.textSecondary : AMBER}>
                                {t('Check')}
                              </T>
                            </Raised>
                          </PressScale>
                        ) : (
                          <PressScale accessibilityRole="button" accessibilityLabel={t('Change {name}', { name: row.name ?? '' })} onPress={() => setChecking(index)} style={styles.ok}>
                            <IconCheck size={18} color={OK} />
                          </PressScale>
                        )}
                      </Row>
                    );
                  })}
                </View>
              )}
            </>
          ) : null}
        </>
      )}
      {editing && checking !== null ? (
        <CheckSheet
          row={editing}
          out={dropped.has(checking)}
          onClose={() => setChecking(null)}
          onSave={(next) => {
            setRows((current) => current.map((row, index) => (index === checking ? next : row)));
            setChecked((current) => new Set([...current, checking]));
            setDropped((current) => new Set([...current].filter((index) => index !== checking)));
            setChecking(null);
          }}
          onLeaveOut={() => {
            setDropped((current) => new Set([...current, checking]));
            setChecking(null);
          }}
        />
      ) : null}
    </BookScreen>
  );
}

/** One row as read, to put right or leave out. */
function CheckSheet({ row, out, onClose, onSave, onLeaveOut }: { row: ImportRow; out: boolean; onClose: () => void; onSave: (row: ImportRow) => void; onLeaveOut: () => void }) {
  const t = useT();
  const styles = useStyles();
  const [name, setName] = useState(row.name ?? '');
  const [phone, setPhone] = useState(row.phone ?? '');
  const [plate, setPlate] = useState(row.plate ?? '');
  const flag = importFlag(row);
  return (
    <ScSheet open onClose={onClose} accessibilityLabel={t('Check {name}', { name: row.name ?? '' })} horizontalPadding={16}>
      <View style={styles.sheet}>
        <T variant="t2">{t('Check this one')}</T>
        {flag ? (
          <T size={13} color={AMBER}>
            {flag}
          </T>
        ) : null}
        <FieldLabel>{t('Name')}</FieldLabel>
        <BookInput value={name} onChangeText={setName} maxLength={GARAGE_BOOK_LIMITS.nameMax} accessibilityLabel={t('Name')} />
        <FieldLabel>{t('Phone')}</FieldLabel>
        <BookInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={16} accessibilityLabel={t('Phone')} />
        <FieldLabel>{t('Number plate')}</FieldLabel>
        <BookInput value={plate} onChangeText={(text) => setPlate(text.toUpperCase())} autoCapitalize="characters" maxLength={20} accessibilityLabel={t('Number plate')} />
        <RaisedButton
          label={out ? t('Put it back in') : t('Looks right')}
          disabled={!name.trim() && !phone.trim() && !plate.trim()}
          onPress={() => onSave({ ...row, name: name.trim() || null, phone: phone.trim() || null, plate: plate.trim() || null, unsure: [] })}
        />
        {!out ? (
          <T variant="t4" color="#FF8A95" align="center" style={styles.leave} onPress={onLeaveOut}>
            {t('Leave this one out')}
          </T>
        ) : null}
      </View>
    </ScSheet>
  );
}

export default garageScreen(ImportScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  pages: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  page: { width: 64, height: 84, borderRadius: 8 },
  addPage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  summary: { paddingHorizontal: 14, paddingVertical: 12 },
  subLine: { marginTop: 2 },
  out: { opacity: 0.55 },
  check: { height: 44 },
  checkInner: { flex: 1, justifyContent: 'center', paddingHorizontal: 12 },
  ok: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addButton: { paddingHorizontal: 22 },
  sheet: { gap: 12, paddingBottom: 8 },
  leave: { minHeight: 44, paddingTop: 12 },
}));
