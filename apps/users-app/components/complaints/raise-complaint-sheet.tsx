import { ApiError } from '@repo/core/api/client';
import type { CustomerComplaint } from '@repo/core/api/complaints';
import { useRaiseComplaint } from '@repo/core/api/hooks/use-complaints';
import {
  COMPLAINT_ACKNOWLEDGE_HOURS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_MESSAGE_MAX,
  COMPLAINT_MESSAGE_MIN,
  COMPLAINT_RESOLVE_DAYS,
  type ComplaintCategory,
  complaintReceivedLine,
} from '@repo/core/complaints';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconCircleCheck, IconCircleX } from '@repo/native-ui/icons';
import { ScTextarea } from '@repo/native-ui/inputs';
import { AFTER_SHEET_MS, ScSheet } from '@repo/native-ui/sheet';
import { Figures, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { track } from '@/lib/shims/analytics';

/** RaiseComplaintSheet (apps/users/components/complaints/raise-complaint-sheet.tsx). */
export function RaiseComplaintSheet({
  open,
  onClose,
  booking,
}: {
  open: boolean;
  onClose: () => void;
  booking: { id: string; reference: string; vendorName: string } | null;
}) {
  const colors = useColors();
  const styles = useStyles();
  const raise = useRaiseComplaint();
  const [category, setCategory] = useState<ComplaintCategory | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [received, setReceived] = useState<CustomerComplaint | null>(null);
  const trimmed = message.trim();
  const canSubmit = category !== null && trimmed.length >= COMPLAINT_MESSAGE_MIN && !raise.isPending;

  const close = () => {
    if (raise.isPending) return;
    onClose();
    setCategory(null);
    setMessage('');
    setError('');
    setReceived(null);
  };

  const submit = () => {
    if (!category || !canSubmit) return;
    setError('');
    raise.mutate(
      { category, message: trimmed, ...(booking ? { bookingId: booking.id } : {}) },
      {
        onSuccess: (complaint) => {
          setReceived(complaint);
          track('complaint_submit', { step: booking ? 'booking' : 'contact' });
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Couldn't send your complaint. Check your connection and try again."),
      }
    );
  };

  return (
    <ScSheet horizontalPadding={16} open={open} onClose={close} dismissible={!raise.isPending} accessibilityLabel={received ? 'Complaint received' : 'Raise a complaint'}>
      <View style={styles.column}>
        <View style={styles.head}>
          <View style={styles.grow}>
            <T size={16} weight={600} lh={22}>
              {received ? 'Complaint received' : 'Raise a complaint'}
            </T>
            {!received ? (
              <T size={12} lh={16} color={colors.textSecondary} style={styles.mt4}>
                {booking ? `About booking ${booking.reference} · ${booking.vendorName}` : 'Tell us what went wrong. If it is about a booking, raising it from the booking’s Help is quicker.'}
              </T>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" disabled={raise.isPending} onPress={close} style={styles.close}>
            <IconCircleX size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        {received ? (
          <View style={styles.part}>
            <View style={styles.thanks}>
              <IconCircleCheck size={20} color={colors.success} />
              <View style={styles.grow}>
                <T size={14} weight={600} lh={20}>
                  <Figures size={14} weight={600} text={complaintReceivedLine(received.number)} />
                </T>
                <T size={12} lh={16} color={colors.textSecondary} style={styles.mt4}>
                  {`Quote ${received.number} if you call or message us about it. You can follow it, and read our answer, in Profile under My complaints.`}
                </T>
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.grow}>
                <ScButton
                  variant="outline"
                  height={44}
                  paddingX={8}
                  onPress={() => {
                    close();
                    setTimeout(() => router.navigate('/profile?section=complaints' as Href), AFTER_SHEET_MS);
                  }}
                >
                  My complaints
                </ScButton>
              </View>
              <View style={styles.grow}>
                <ScButton variant="outline" height={44} onPress={close}>
                  Done
                </ScButton>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.part}>
            <View style={styles.part8}>
              <T size={11} weight={500} lh={15} color={colors.textSecondary}>
                What is it about?
              </T>
              <View style={styles.chips}>
                {COMPLAINT_CATEGORIES.map((value) => (
                  <Chip
                    key={value}
                    label={COMPLAINT_CATEGORY_LABELS[value]}
                    selected={category === value}
                    onPress={() => {
                      setCategory(value);
                      setError('');
                    }}
                  />
                ))}
              </View>
            </View>
            <View>
              <ScTextarea
                label="What happened?"
                rows={5}
                maxLength={COMPLAINT_MESSAGE_MAX}
                placeholder="What went wrong, and what you would like us to do"
                value={message}
                onChangeText={(text) => {
                  setMessage(text);
                  setError('');
                }}
              />
              <View style={styles.hint}>
                <T size={11} lh={15} color={colors.textMuted}>
                  {trimmed.length > 0 && trimmed.length < COMPLAINT_MESSAGE_MIN ? `At least ${COMPLAINT_MESSAGE_MIN} characters` : ''}
                </T>
                <T num size={11} lh={15} color={colors.textMuted}>
                  {`${message.length}/${COMPLAINT_MESSAGE_MAX}`}
                </T>
              </View>
            </View>
            <T size={12} lh={16} color={colors.textSecondary}>
              <Figures size={12} color={colors.textSecondary} text={`You get a complaint number at once. We acknowledge every complaint within ${COMPLAINT_ACKNOWLEDGE_HOURS} hours and aim to resolve it within ${COMPLAINT_RESOLVE_DAYS} days.`} />
            </T>
            {error ? (
              <T accessibilityRole="alert" size={12} lh={16} color={colors.error}>
                {error}
              </T>
            ) : null}
            <ScButton variant="main" height={44} disabled={!canSubmit} onPress={submit}>
              {raise.isPending ? 'Sending…' : 'Submit complaint'}
            </ScButton>
          </View>
        )}
      </View>
    </ScSheet>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 20 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  mt4: { marginTop: 4 },
  close: { marginRight: -8, marginTop: -4, height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  part: { gap: 16 },
  part8: { gap: 8 },
  thanks: { flexDirection: 'row', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 12 },
  row: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
}));
