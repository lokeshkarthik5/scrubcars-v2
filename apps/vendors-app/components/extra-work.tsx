import { formatINR } from '@repo/core/format';
import type { Booking, ExtraWork } from '@repo/core/types';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useIsVendorAdmin } from '@/lib/auth';
import { askExtraWork, withdrawExtraWork } from '@/lib/job-records-api';
import { type PreparedPhoto, prepareForUpload } from '@/lib/photo-prepare';
import { colors } from '@/lib/theme';

import { ScButton } from './button';
import { IconCameraPlus, IconTool, IconX } from './icons';
import { ScInput, ScTextarea } from './inputs';
import { JobSheetRow } from './job-sheet-row';
import { type StatusTone, StatusChip } from './primitives';
import { AFTER_SHEET_MS, ScSheet } from './sheet';
import { T } from './text';
import { toast } from './toast';
import { errorText } from '@/lib/error-text';

const MAX_DESCRIPTION = 80;
const MAX_NOTE = 500;
const MAX_PHOTOS = 3;

const STATE: Record<ExtraWork['state'], { label: string; tone: StatusTone }> = {
  awaiting: { label: 'Waiting for customer', tone: 'progress' },
  paid: { label: 'Approved & paid — go ahead', tone: 'done' },
  declined: { label: 'Declined by customer', tone: 'closed' },
  withdrawn: { label: 'Withdrawn', tone: 'closed' },
  closed: { label: 'Closed with the booking', tone: 'closed' },
};

function formProblem(description: string, amount: string): string | null {
  if (!description.trim()) return 'Say what the extra work is.';
  const n = Number(amount);
  if (!amount || !Number.isFinite(n) || n < 1) return 'Give a price of at least ₹1.';
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return 'Use at most two decimals.';
  return null;
}

/** ExtraWorkPanel (apps/vendors/components/extra-work.tsx). */
export function ExtraWorkPanel({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const [listOpen, setListOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const who = booking.customerName ?? 'the customer';
  const canAsk = booking.extraWorkRefusal === null;
  const isVendorAdmin = useIsVendorAdmin();

  const jobOn = booking.status === 'confirmed' || booking.status === 'in_progress';
  if (booking.extraWork.length === 0 && !jobOn) return null;

  const handleWithdraw = async (work: ExtraWork) => {
    if (withdrawing) return;
    setWithdrawing(work.id);
    try {
      await withdrawExtraWork(booking.id, work.id);
      toast.success('Extra work withdrawn.');
    } catch (error) {
      toast.error(errorText(error, 'Could not withdraw it'));
    } finally {
      setWithdrawing(null);
      onChanged();
    }
  };

  const latest = booking.extraWork[0];
  const live = booking.extraWork.filter((work) => work.state === 'awaiting' || work.state === 'paid');
  const total = live.reduce((sum, work) => sum + Number(work.amount), 0);
  const refusal =
    booking.extraWorkRefusal === 'on_inspection'
      ? 'This job is priced on inspection: add any extra work to its final bill.'
      : booking.extraWorkRefusal === 'too_many_open'
        ? `${who} has 3 requests to answer. Wait for an answer, or withdraw one, to ask for more.`
        : null;

  return (
    <>
      <JobSheetRow
        icon={<IconTool size={22} stroke={1.6} color={colors.textSecondary} />}
        title={
          <>
            Extra work
            {isVendorAdmin && total > 0 ? (
              <T num size={17} weight={600}>{` · ${formatINR(total, { paise: true })}`}</T>
            ) : null}
          </>
        }
        detail={latest ? `${latest.description} · ${STATE[latest.state].label}` : (refusal ?? 'Found more to do? Ask the customer')}
        accessibilityLabel={latest ? `Extra work for ${who}` : canAsk ? `Ask ${who} for extra work` : undefined}
        onOpen={latest ? () => setListOpen(true) : canAsk ? () => setAsking(true) : undefined}
      />

      <ScSheet open={listOpen} onClose={() => setListOpen(false)} accessibilityLabel={`Extra work for ${who}`} horizontalPadding={16}>
        <T accessibilityRole="header" size={20} weight={600}>
          Extra work
        </T>
        <View style={styles.list}>
          {booking.extraWork.map((work) => (
            <View key={work.id} style={styles.request}>
              <View style={styles.requestHead}>
                <T size={16} style={styles.flex}>
                  {work.description}
                </T>
                <T num size={18} weight={600}>
                  {formatINR(Number(work.amount), { paise: true })}
                </T>
              </View>
              <View style={styles.requestState}>
                <StatusChip tone={STATE[work.state].tone}>{STATE[work.state].label}</StatusChip>
                {work.photos.length > 0 ? (
                  <T num size={13} color={colors.textSecondary}>
                    {work.photos.length === 1 ? '1 photo' : `${work.photos.length} photos`}
                  </T>
                ) : null}
              </View>
              {work.state === 'awaiting' ? (
                <ScButton
                  variant="outline"
                  disabled={withdrawing !== null}
                  accessibilityLabel={`Withdraw extra work ${work.description} for ${who}`}
                  onPress={() => void handleWithdraw(work)}
                >
                  {withdrawing === work.id ? 'Withdrawing…' : 'Withdraw'}
                </ScButton>
              ) : null}
            </View>
          ))}
          {refusal ? (
            <T size={14} color={colors.textSecondary}>
              {refusal}
            </T>
          ) : canAsk ? (
            <ScButton
              variant="outline"
              size="lg"
              accessibilityLabel={`Ask ${who} for extra work`}
              onPress={() => {
                setListOpen(false);
                setTimeout(() => setAsking(true), AFTER_SHEET_MS);
              }}
            >
              Ask for extra work
            </ScButton>
          ) : null}
        </View>
      </ScSheet>

      {asking ? (
        <ExtraWorkSheet
          booking={booking}
          onClose={() => setAsking(false)}
          onSent={() => {
            setAsking(false);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function ExtraWorkSheet({ booking, onClose, onSent }: { booking: Booking; onClose: () => void; onSent: () => void }) {
  const who = booking.customerName ?? 'the customer';
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const problem = formProblem(description, amount);

  const addPhotos = async () => {
    const limit = Math.max(0, MAX_PHOTOS - photos.length);
    if (limit === 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
      exif: false,
    });
    if (result.canceled) return;
    setPreparing(true);
    try {
      for (const asset of result.assets) {
        try {
          const prepared = await prepareForUpload(asset.uri);
          setPhotos((current) => (current.length >= MAX_PHOTOS ? current : [...current, prepared]));
        } catch (error) {
          toast.error(errorText(error, 'That photo could not be used'));
        }
      }
    } finally {
      setPreparing(false);
    }
  };

  const handleSend = async () => {
    if (problem || sending) return;
    setSending(true);
    try {
      await askExtraWork(booking.id, {
        description: description.trim(),
        amount: Number(amount),
        note: note.trim() || undefined,
        photos: photos.map((photo) => photo.bytes),
      });
      toast.success(`Sent. ${who} can approve and pay ${formatINR(Number(amount), { paise: true })} in the Detlio app.`);
      onSent();
    } catch (error) {
      toast.error(errorText(error, 'Could not send it'));
    } finally {
      setSending(false);
    }
  };

  return (
    <ScSheet open onClose={onClose} dismissible={!sending} accessibilityLabel={`Extra work for ${who}`} horizontalPadding={16}>
      <T accessibilityRole="header" size={20} weight={600}>
        Ask for extra work
      </T>
      <T size={14} color={colors.textSecondary} style={styles.mt1}>
        {`${who} approves it by paying in the Detlio app. Don't start it until it says Approved & paid.`}
      </T>

      <View style={styles.form}>
        <ScInput
          label="What needs doing"
          placeholder="e.g. Replace front brake pads"
          maxLength={MAX_DESCRIPTION}
          value={description}
          onChangeText={setDescription}
        />
        <ScInput
          label="Price (₹)"
          accessibilityLabel="Price in rupees"
          keyboardType="decimal-pad"
          placeholder="0"
          numeric
          value={amount}
          onChangeText={(text) => setAmount(text.replace(/[^\d.]/g, ''))}
        />

        <View style={styles.photos}>
          <T size={14} weight={500}>
            {'Photos '}
            <T num size={14} weight={500} color={colors.textSecondary}>
              {`${photos.length}/${MAX_PHOTOS}`}
            </T>
          </T>
          <T size={13} color={colors.textSecondary}>
            Optional. Show the customer what you found.
          </T>
          <View style={styles.photoRow}>
            {photos.map((photo, i) => (
              <View key={photo.uri}>
                <Image source={{ uri: photo.uri }} style={styles.preview} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  onPress={() => setPhotos((current) => current.filter((_, j) => j !== i))}
                  style={styles.removePhoto}
                >
                  <IconX size={14} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add photos of the extra work"
                disabled={preparing || sending}
                onPress={() => void addPhotos()}
                style={styles.addPhoto}
              >
                <IconCameraPlus size={20} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScTextarea
          label="Note for the customer (optional)"
          rows={2}
          maxLength={MAX_NOTE}
          value={note}
          onChangeText={setNote}
        />
      </View>

      {problem && (description || amount) ? (
        <T size={13} color={colors.error} style={styles.mt2}>
          {problem}
        </T>
      ) : null}

      <View style={styles.actions}>
        <View style={styles.half}>
          <ScButton variant="outline" size="lg" disabled={sending} onPress={onClose}>
            Cancel
          </ScButton>
        </View>
        <View style={styles.half}>
          <ScButton
            variant="main"
            size="lg"
            disabled={Boolean(problem) || sending || preparing}
            onPress={() => void handleSend()}
          >
            {sending ? 'Sending…' : 'Send to customer'}
          </ScButton>
        </View>
      </View>
    </ScSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  half: { flex: 1, minWidth: 0 },
  list: { marginTop: 16, gap: 12 },
  request: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  requestHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  requestState: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mt1: { marginTop: 4 },
  mt2: { marginTop: 8 },
  form: { marginTop: 16, gap: 12 },
  photos: { gap: 6 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preview: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  removePhoto: {
    position: 'absolute',
    right: -8,
    top: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { marginTop: 20, flexDirection: 'row', gap: 8 },
});
