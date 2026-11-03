import { getBooking } from '@repo/core/api/bookings';
import { ApiError } from '@repo/core/api/client';
import type { CustomerClaim } from '@repo/core/api/guarantee';
import { guaranteeKeys, useBookingGuarantee, useBookRedo, useCreateClaim, useGuaranteeConfig, useRedoSlots } from '@repo/core/api/hooks/use-guarantee';
import {
  claimFormProblem,
  GUARANTEE_HOW_IT_WORKS,
  GUARANTEE_ISSUES,
  GUARANTEE_NAME,
  GUARANTEE_RULES,
  type GuaranteeIssue,
  ISSUE_LABELS,
} from '@repo/core/guarantee';
import { formatStepTime } from '@repo/core/job-records';
import type { Booking } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { ScCheckbox } from '@repo/native-ui/chip';
import { IconCamera, IconCircleX, IconShieldCheck } from '@repo/native-ui/icons';
import { ScTextarea } from '@repo/native-ui/inputs';
import { ScCard, Spinner } from '@repo/native-ui/primitives';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GuaranteeEvidence } from '@/components/guarantee/guarantee-evidence';
import { PageHeader } from '@/components/page-header';
import { errorText } from '@/lib/error-text';
import { pickPhoto, uploadClaimPhoto } from '@/lib/photo-upload';
import { istToday } from '@/lib/when-picker';

const dayLabel = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });

function Unavailable({ id, message }: { id: string; message: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.unavailable}>
      <T size={13} lh={18} color={colors.textSecondary}>
        {message}
      </T>
      <ScButton variant="outline" height={44} onPress={() => router.replace(`/bookings/${id}` as Href)}>
        Back to booking
      </ScButton>
    </View>
  );
}

function ClaimForm({ booking, claimBy }: { booking: Booking; claimBy: string | null }) {
  const colors = useColors();
  const styles = useStyles();
  const create = useCreateClaim();
  const [issues, setIssues] = useState<GuaranteeIssue[]>([]);
  const [otherText, setOtherText] = useState('');
  const [photos, setPhotos] = useState<{ key: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const problem = claimFormProblem({ issues, otherText, photos: photos.length });
  const room = GUARANTEE_RULES.maxPhotos - photos.length;

  const addPhoto = async () => {
    const uri = await pickPhoto();
    if (!uri) return;
    setUploading(true);
    try {
      const uploaded = await uploadClaimPhoto(booking.id, uri);
      setPhotos((current) => [...current, uploaded]);
    } catch (error) {
      toast.error(errorText(error, 'Your photo did not upload. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      await create.mutateAsync({
        bookingId: booking.id,
        issues,
        ...(issues.includes('other') && { otherText: otherText.trim() }),
        photoKeys: photos.map((photo) => photo.key),
      });
      toast.success('Claim sent');
    } catch (error) {
      toast.error(errorText(error, 'Could not send your claim. Please try again.'));
    }
  };

  return (
    <View style={styles.column}>
      <ScCard style={styles.card}>
        <View style={styles.row}>
          <IconShieldCheck size={20} color={colors.textPrimary} />
          <View style={styles.grow}>
            <T size={17} weight={500} lh={24}>
              Not happy with this job?
            </T>
            <T size={13} lh={18} color={colors.textSecondary} style={styles.mt2}>
              <Figures
                size={13}
                color={colors.textSecondary}
                text={`${booking.vendorName} · ${booking.items.map((item) => item.name).join(', ')}${claimBy ? ` · Ask by ${formatStepTime(claimBy)}` : ''}`}
              />
            </T>
          </View>
        </View>
        <View style={styles.how}>
          {GUARANTEE_HOW_IT_WORKS.map((line) => (
            <T key={line} size={12} lh={16} color={colors.textSecondary}>
              {line}
            </T>
          ))}
        </View>
      </ScCard>
      <ScCard style={styles.cardTight}>
        <T size={14} weight={600} lh={20}>
          {"What's wrong?"}
        </T>
        {GUARANTEE_ISSUES.map((issue) => (
          <ScCheckbox
            key={issue}
            label={ISSUE_LABELS[issue]}
            checked={issues.includes(issue)}
            onChange={(checked) => setIssues((current) => (checked ? [...current, issue] : current.filter((value) => value !== issue)))}
          />
        ))}
        {issues.includes('other') ? (
          <ScTextarea label="Tell us what's wrong" rows={3} maxLength={GUARANTEE_RULES.otherTextMax} value={otherText} onChangeText={setOtherText} />
        ) : null}
      </ScCard>
      <ScCard style={styles.card}>
        <View>
          <T size={14} weight={600} lh={20}>
            Photos of the problem
          </T>
          <T size={12} lh={16} color={colors.textSecondary} style={styles.mt2}>
            {`Take at least ${GUARANTEE_RULES.minPhotos} with your camera, close up on what was missed. Location and camera details are removed before upload.`}
          </T>
        </View>
        <View style={styles.photos}>
          {photos.map((photo, index) => (
            <View key={photo.key} style={styles.photoBox}>
              <Image source={{ uri: photo.preview }} accessibilityLabel={`Problem photo ${index + 1}`} style={styles.photo} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
                onPress={() => setPhotos((current) => current.filter((value) => value.key !== photo.key))}
                style={styles.remove}
              >
                <IconCircleX size={20} color={colors.white} />
              </Pressable>
            </View>
          ))}
          {room > 0 ? (
            <Pressable accessibilityRole="button" disabled={uploading} onPress={() => void addPhoto()} style={[styles.add, uploading && styles.dim]}>
              {uploading ? <Spinner size={18} /> : <IconCamera size={20} color={colors.textSecondary} />}
              <T size={11} lh={15} color={colors.textSecondary}>
                {uploading ? 'Uploading' : 'Take photo'}
              </T>
            </Pressable>
          ) : null}
        </View>
      </ScCard>
      <ScCard style={styles.card}>
        <T size={14} weight={600} lh={20}>
          What Detlio compares
        </T>
        <GuaranteeEvidence garagePhotos={booking.jobPhotos} />
      </ScCard>
      <ScButton variant="main" disabled={Boolean(problem) || create.isPending || uploading} onPress={() => void submit()}>
        {create.isPending ? 'Sending…' : 'Ask for a free redo'}
      </ScButton>
      {problem ? (
        <T size={12} lh={16} color={colors.textSecondary} align="center">
          {problem}
        </T>
      ) : null}
    </View>
  );
}

function RedoPicker({ booking, claim }: { booking: Booking; claim: CustomerClaim }) {
  const colors = useColors();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const first = useRedoSlots(claim.id, date ?? istToday(Date.now()));
  const days = first.data?.days ?? [];
  const shownDate = date ?? days[0] ?? null;
  const slots = useRedoSlots(claim.id, shownDate);
  const book = useBookRedo(booking.id);

  const confirm = async () => {
    if (!time) return;
    try {
      const result = await book.mutateAsync({ claimId: claim.id, scheduledAt: time });
      toast.success('Free redo booked');
      void queryClient.invalidateQueries({ queryKey: guaranteeKeys.booking(booking.id) });
      router.replace(`/bookings/${result.bookingId}` as Href);
    } catch (error) {
      setTime(null);
      void slots.refetch();
      toast.error(errorText(error, 'Could not book that time. Pick another one.'));
    }
  };

  return (
    <ScCard style={styles.card}>
      <View>
        <T size={14} weight={600} lh={20}>
          {`Pick a time at ${booking.vendorName}`}
        </T>
        {claim.redoBookBy ? (
          <T size={12} lh={16} color={colors.textSecondary} style={styles.mt2}>
            <Figures size={12} color={colors.textSecondary} text={`Free of charge, by ${formatStepTime(claim.redoBookBy)}.`} />
          </T>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
        {days.map((day) => (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityState={{ selected: day === shownDate }}
            onPress={() => {
              setDate(day);
              setTime(null);
            }}
            style={[styles.day, day === shownDate ? styles.chosen : styles.idle]}
          >
            <T size={12} lh={16} color={day === shownDate ? colors.textPrimary : colors.textSecondary}>
              {dayLabel(day)}
            </T>
          </Pressable>
        ))}
      </ScrollView>
      {slots.isLoading ? (
        <T size={13} lh={18} color={colors.textSecondary}>
          Loading times…
        </T>
      ) : (slots.data?.slots.length ?? 0) === 0 ? (
        <T size={13} lh={18} color={colors.textSecondary}>
          {slots.data?.isClosed ? 'The garage is closed that day.' : 'No free times that day. Try another day.'}
        </T>
      ) : (
        <View style={styles.slots}>
          {slots.data!.slots.map((slot) => (
            <Pressable
              key={slot.time}
              accessibilityRole="button"
              accessibilityState={{ selected: time === slot.time }}
              onPress={() => setTime(slot.time)}
              style={[styles.slot, time === slot.time ? styles.chosen : styles.idle]}
            >
              <T size={13} lh={18} color={time === slot.time ? colors.textPrimary : colors.textSecondary}>
                {slot.label}
              </T>
            </Pressable>
          ))}
        </View>
      )}
      <ScButton variant="main" disabled={!time || book.isPending} onPress={() => void confirm()}>
        {book.isPending ? 'Booking…' : 'Book my free redo'}
      </ScButton>
    </ScCard>
  );
}

function ClaimStatus({ booking, claim }: { booking: Booking; claim: CustomerClaim }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.column}>
      <ScCard style={styles.row}>
        <IconShieldCheck size={20} color={colors.textPrimary} />
        <View style={styles.grow}>
          <T size={17} weight={500} lh={24}>
            {claim.title}
          </T>
          {claim.body ? (
            <T size={13} lh={18} color={colors.textSecondary} style={styles.mt2}>
              {claim.body}
            </T>
          ) : null}
        </View>
      </ScCard>
      {claim.canBookRedo ? <RedoPicker booking={booking} claim={claim} /> : null}
      {claim.redoBooking ? (
        <ScButton variant="outline" height={44} onPress={() => router.push(`/bookings/${claim.redoBooking!.id}` as Href)}>
          See your free redo booking
        </ScButton>
      ) : null}
      <ScCard style={styles.card}>
        <T size={14} weight={600} lh={20}>
          Your claim
        </T>
        <T size={13} lh={18} color={colors.textSecondary}>
          {`${claim.issues.map((issue) => ISSUE_LABELS[issue]).join(', ')}${claim.otherText ? ` — ${claim.otherText}` : ''}`}
        </T>
        <GuaranteeEvidence customerPhotos={claim.photos} garagePhotos={booking.jobPhotos} customerTitle="Your photos" />
      </ScCard>
      <ScButton variant="outline" height={44} onPress={() => router.replace(`/bookings/${booking.id}` as Href)}>
        Back to booking
      </ScButton>
    </View>
  );
}

/** apps/users/app/bookings/[id]/guarantee/page.tsx. */
export default function GuaranteeScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId);
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const config = useGuaranteeConfig();
  const on = config.data?.enabled === true;
  const guarantee = useBookingGuarantee(id, on);
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void getBooking(id)
      .then((found) => live && setBooking(found ?? null))
      .catch((error: unknown) => {
        if (live && error instanceof ApiError) setBooking(null);
      });
    return () => {
      live = false;
    };
  }, [id]);
  const loading = config.isLoading || (on && guarantee.isLoading) || booking === undefined;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={GUARANTEE_NAME} backTo={`/bookings/${id}`} />
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {loading ? (
          <T size={13} lh={18} color={colors.textSecondary}>
            Loading…
          </T>
        ) : !on || !booking || !guarantee.data ? (
          <Unavailable id={id} message="The Detlio Guarantee isn't available for this booking." />
        ) : guarantee.data.claim ? (
          <ClaimStatus booking={booking} claim={guarantee.data.claim} />
        ) : guarantee.data.canClaim ? (
          <ClaimForm booking={booking} claimBy={guarantee.data.claimBy} />
        ) : (
          <Unavailable id={id} message="This booking can't take a free redo claim. Use Help with this booking to raise a complaint instead." />
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  column: { gap: 12 },
  unavailable: { gap: 12, paddingTop: 8 },
  card: { gap: 12 },
  cardTight: { gap: 4 },
  row: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  mt2: { marginTop: 2 },
  how: { gap: 4 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoBox: { height: 80, width: 80 },
  photo: { height: 80, width: 80, borderRadius: 10, borderWidth: 1, borderColor: c.border },
  remove: { position: 'absolute', top: -2, right: -2, height: 44, width: 44, alignItems: 'flex-end' },
  add: { height: 80, width: 80, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dim: { opacity: 0.6 },
  days: { gap: 8 },
  day: { minHeight: 44, justifyContent: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12 },
  chosen: { borderColor: c.chosenBg, backgroundColor: c.surface },
  idle: { borderColor: c.border },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31.8%', minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1 },
}));
