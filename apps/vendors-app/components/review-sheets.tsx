import { ApiError } from '@repo/core/api/client';
import { RATING_RULES } from '@repo/core/ratings';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorText } from '@/lib/error-text';
import { reportReviewAsGarage, replyToReview } from '@/lib/reviews-api';
import {
  type ReviewReply,
  type ReviewRow,
  replyReady,
  replyWindowLine,
  reportReady,
} from '@/lib/reviews-view';
import { colors } from '@/lib/theme';

import { ScButton } from '@repo/native-ui/button';
import { ScTextarea } from '@repo/native-ui/inputs';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';

/** A sheet stays mounted through its exit: keep what it showed while it slides away. */
function useLastReview(review: ReviewRow | null) {
  const last = useRef<ReviewRow | null>(review);
  if (review) last.current = review;
  return review ?? last.current;
}

/** What the server says changed under the sheet: the list is read again. */
const STALE = new Set(['REVIEW_CHANGED', 'REVIEW_HIDDEN', 'REPLY_LOCKED', 'REVIEW_NOT_FOUND']);

/**
 * "Reply publicly": the garage's one public reply to a review (0065), up to 1000 characters,
 * posted at any time and changeable for 24 hours from the first post. A new screen: the
 * web shows replies read-only. Words follow the customer app's report sheet, the same
 * family of sheets.
 */
export function ReplySheet({
  review,
  open,
  onClose,
  onSaved,
  onStale,
}: {
  review: ReviewRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: (reviewId: string, reply: ReviewReply) => void;
  /** The review moved on under the sheet (hidden, window closed, changed): read the list again. */
  onStale: () => void;
}) {
  const shown = useLastReview(review);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A fresh form each time it opens: the posted reply to change, or nothing.
  useEffect(() => {
    if (open) {
      setText(review?.reply?.text ?? '');
      setError('');
    }
  }, [open, review?.id]);

  if (!shown) return null;
  const editing = Boolean(shown.reply);
  const ready = replyReady(text, shown.reply);

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const reply = await replyToReview(shown.id, text.trim());
      toast.success(editing ? 'Reply saved' : 'Reply posted');
      onSaved(shown.id, reply);
      onClose();
    } catch (err) {
      setError(errorText(err, "Couldn't save your reply. Try again."));
      if (err instanceof ApiError && err.code && STALE.has(err.code)) onStale();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      accessibilityLabel={editing ? 'Change your reply' : 'Reply to this review'}
      horizontalPadding={20}
    >
      <View style={styles.body}>
        <View style={styles.gap4}>
          <T accessibilityRole="header" size={17} weight={600}>
            {editing ? 'Change your reply' : `Reply to ${shown.name}`}
          </T>
          <T size={13} color={colors.textSecondary}>
            {replyWindowLine(shown.reply)}
          </T>
        </View>
        {shown.comment ? (
          <T size={12} color={colors.textMuted} numberOfLines={3}>
            {`“${shown.comment}”`}
          </T>
        ) : null}
        <View style={styles.gap4}>
          <ScTextarea
            label="Your reply"
            rows={4}
            maxLength={RATING_RULES.replyMaxLength}
            value={text}
            onChangeText={setText}
            editable={!busy}
          />
          <T num size={11} color={colors.textMuted} align="right">
            {`${text.length} / ${RATING_RULES.replyMaxLength}`}
          </T>
        </View>
        {error ? (
          <T accessibilityRole="alert" size={12} color={colors.error}>
            {error}
          </T>
        ) : null}
        <ScButton disabled={!ready || busy} onPress={() => void save()}>
          {busy ? 'Saving…' : editing ? 'Save reply' : 'Post reply'}
        </ScButton>
        <ScButton variant="text" disabled={busy} onPress={onClose}>
          Not now
        </ScButton>
      </View>
    </ScSheet>
  );
}

/**
 * "Report to Detlio": the garage tells the team what is wrong with a review (0065), once
 * per review. The words are the customer app's report sheet (apps/users
 * report-review-button.tsx); the garage can only report, never hide.
 */
export function ReportSheet({
  review,
  open,
  onClose,
  onReported,
}: {
  review: ReviewRow | null;
  open: boolean;
  onClose: () => void;
  /** The server has the report (or already had it): the row says so. */
  onReported: (reviewId: string) => void;
}) {
  const shown = useLastReview(review);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
      setState('idle');
    }
  }, [open, review?.id]);

  if (!shown) return null;
  const sending = state === 'sending';

  const send = async () => {
    if (!reportReady(reason) || sending) return;
    setState('sending');
    setError('');
    try {
      await reportReviewAsGarage(shown.id, reason.trim());
      onReported(shown.id);
      setState('sent');
    } catch (err) {
      setState('idle');
      if (err instanceof ApiError && err.code === 'REVIEW_ALREADY_REPORTED') onReported(shown.id);
      setError(errorText(err, "Couldn't send the report. Try again."));
    }
  };

  return (
    <ScSheet
      open={open}
      onClose={onClose}
      dismissible={!sending}
      accessibilityLabel="Report this review"
      horizontalPadding={20}
    >
      {state === 'sent' ? (
        <View style={styles.body}>
          <View accessibilityRole="alert" style={styles.gap4}>
            <T accessibilityRole="header" size={17} weight={600}>
              {"Thanks, we've got it"}
            </T>
            <T size={13} color={colors.textSecondary}>
              The team will look at this review. If it breaks our rules, it comes down.
            </T>
          </View>
          <ScButton variant="outline" onPress={onClose}>
            Done
          </ScButton>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.gap4}>
            <T accessibilityRole="header" size={17} weight={600}>
              Report this review
            </T>
            <T size={13} color={colors.textSecondary}>
              Tell the team what is wrong: abusive, fake, or about another garage.
            </T>
          </View>
          <ScTextarea
            label="What's wrong with it?"
            rows={3}
            maxLength={RATING_RULES.reportReasonMaxLength}
            value={reason}
            onChangeText={setReason}
            editable={!sending}
          />
          {error ? (
            <T accessibilityRole="alert" size={12} color={colors.error}>
              {error}
            </T>
          ) : null}
          <ScButton disabled={!reportReady(reason) || sending} onPress={() => void send()}>
            {sending ? 'Sending…' : 'Send report'}
          </ScButton>
          <ScButton variant="text" disabled={sending} onPress={onClose}>
            Not now
          </ScButton>
        </View>
      )}
    </ScSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingTop: 4 },
  gap4: { gap: 4 },
});
