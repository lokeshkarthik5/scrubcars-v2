import { ApiError } from '@repo/core/api/client';
import { useBypassStatus, useReportBypass } from '@repo/core/api/hooks/use-bypass-reports';
import { bookingReference } from '@repo/core/booking-types';
import {
  BYPASS_ANONYMITY_LINE,
  BYPASS_KIND_LABELS,
  BYPASS_KINDS,
  BYPASS_NUMBERS,
  BYPASS_QUESTION,
  BYPASS_QUESTION_SHORT,
  BYPASS_THANKS_BODY,
  BYPASS_THANKS_TITLE,
  type BypassKind,
  bypassReportStatusLine,
  bypassRewardLine,
} from '@repo/core/bypass-reports';
import type { Booking } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconChevronRight, IconCircleCheck, IconCircleX, IconFlag } from '@repo/native-ui/icons';
import { ScTextarea } from '@repo/native-ui/inputs';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

export function mayBeReportable(booking: Pick<Booking, 'status' | 'acceptedAtIso'>): boolean {
  if (booking.status === 'confirmed' || booking.status === 'in_progress' || booking.status === 'completed') return true;
  return booking.status === 'cancelled' && Boolean(booking.acceptedAtIso);
}

/** ReportBypassSheet (apps/users/components/bypass/report-bypass-sheet.tsx). */
export function ReportBypassSheet({
  open,
  onClose,
  booking,
  rewardOffered,
  rewardAmount,
}: {
  open: boolean;
  onClose: () => void;
  booking: { id: string; reference: string; vendorName: string };
  rewardOffered: boolean;
  rewardAmount: string;
}) {
  const colors = useColors();
  const styles = useStyles();
  const send = useReportBypass();
  const [kind, setKind] = useState<BypassKind | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const canSend = kind !== null && !send.isPending;
  const close = () => {
    if (send.isPending) return;
    onClose();
    setKind(null);
    setNote('');
    setError('');
    setSent(false);
  };
  const submit = () => {
    if (!kind || !canSend) return;
    setError('');
    const trimmed = note.trim();
    send.mutate(
      { bookingId: booking.id, kind, ...(trimmed ? { note: trimmed } : {}) },
      {
        onSuccess: () => setSent(true),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Couldn't send this. Check your connection and try again."),
      }
    );
  };
  return (
    <ScSheet horizontalPadding={16} open={open} onClose={close} dismissible={!send.isPending} accessibilityLabel={sent ? BYPASS_THANKS_TITLE : 'Tell us about the garage'}>
      <View style={styles.column}>
        <View style={styles.head}>
          <View style={styles.grow}>
            <T size={16} weight={600} lh={22}>
              {sent ? BYPASS_THANKS_TITLE : BYPASS_QUESTION}
            </T>
            {!sent ? (
              <T size={12} lh={16} color={colors.textSecondary} style={styles.mt4}>
                {`About booking ${booking.reference} · ${booking.vendorName}`}
              </T>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" disabled={send.isPending} onPress={close} style={styles.close}>
            <IconCircleX size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        {sent ? (
          <View style={styles.part}>
            <View style={styles.thanks}>
              <IconCircleCheck size={20} color={colors.success} />
              <View style={styles.grow}>
                <T size={14} weight={600} lh={20}>
                  {BYPASS_THANKS_BODY}
                </T>
                {rewardOffered ? (
                  <T size={12} lh={16} color={colors.textSecondary} style={styles.mt4}>
                    {bypassRewardLine(Number(rewardAmount))}
                  </T>
                ) : null}
              </View>
            </View>
            <ScButton variant="outline" height={44} onPress={close}>
              Done
            </ScButton>
          </View>
        ) : (
          <View style={styles.part}>
            <View style={styles.part8}>
              <T size={11} weight={500} lh={15} color={colors.textSecondary}>
                What happened?
              </T>
              <View style={styles.chips}>
                {BYPASS_KINDS.map((value) => (
                  <Chip key={value} label={BYPASS_KIND_LABELS[value]} selected={kind === value} onPress={() => setKind(value)} />
                ))}
              </View>
            </View>
            <View>
              <ScTextarea label="Anything to add? (optional)" rows={3} maxLength={BYPASS_NUMBERS.noteMax} placeholder="What they said, and when" value={note} onChangeText={setNote} />
              <T num size={11} lh={15} color={colors.textMuted} align="right" style={styles.mt4}>
                {`${note.length}/${BYPASS_NUMBERS.noteMax}`}
              </T>
            </View>
            <View style={styles.lines}>
              <T size={12} lh={16} color={colors.textSecondary}>
                {BYPASS_ANONYMITY_LINE}
              </T>
              {rewardOffered ? (
                <T size={12} lh={16} color={colors.textSecondary}>
                  {bypassRewardLine(Number(rewardAmount))}
                </T>
              ) : null}
            </View>
            {error ? (
              <T accessibilityRole="alert" size={12} lh={16} color={colors.error}>
                {error}
              </T>
            ) : null}
            <ScButton variant="main" height={44} disabled={!canSend} onPress={submit}>
              {send.isPending ? 'Sending…' : 'Send'}
            </ScButton>
          </View>
        )}
      </View>
    </ScSheet>
  );
}

/** BypassReportLine (apps/users/components/bypass/bypass-report-line.tsx). */
export function BypassReportLine({ booking }: { booking: Booking }) {
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const { data } = useBypassStatus(booking.id, mayBeReportable(booking));
  if (!data) return null;
  if (data.report) {
    return (
      <View style={styles.reported}>
        <IconFlag size={15} color={colors.textMuted} />
        <T size={12} lh={16} color={colors.textSecondary} style={styles.grow}>
          {bypassReportStatusLine({ status: data.report.status, reward: data.report.reward, rewardRupees: Number(data.report.rewardAmount) })}
        </T>
      </View>
    );
  }
  if (!data.canReport) return null;
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.line}>
        <View style={styles.lineLeft}>
          <IconFlag size={16} color={colors.textMuted} />
          <T size={13} lh={18} color={colors.textSecondary} style={styles.grow}>
            {BYPASS_QUESTION_SHORT}
          </T>
        </View>
        <IconChevronRight size={16} color={colors.textMuted} />
      </Pressable>
      <ReportBypassSheet
        open={open}
        onClose={() => setOpen(false)}
        booking={{ id: booking.id, reference: `#${bookingReference(booking.id)}`, vendorName: booking.vendorName }}
        rewardOffered={data.rewardOffered}
        rewardAmount={data.rewardAmount}
      />
    </>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lines: { gap: 4 },
  reported: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  line: { marginHorizontal: -4, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4 },
  lineLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
