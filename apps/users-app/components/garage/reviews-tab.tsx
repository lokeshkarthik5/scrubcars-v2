import { useVendorReviews } from '@repo/core/api/hooks/use-vendors';
import { ApiError } from '@repo/core/api/client';
import { getVendorReviewSummary, reportReview } from '@repo/core/api/reviews';
import { useT, useTn } from '@repo/core/i18n';
import { hasStarScore, NEW_GARAGE_LABEL, newGarageReviewsLine, RATING_RULES } from '@repo/core/ratings';
import type { Review, Vendor } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { ScTextarea } from '@repo/native-ui/inputs';
import { ScCard, Stars } from '@repo/native-ui/primitives';
import { AFTER_SHEET_MS, ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/lib/auth';

/** ReportReviewButton (apps/users/components/reviews/report-review-button.tsx): Apple 1.2. */
function ReportReview({ review, garagePath }: { review: Review; garagePath: string }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const trimmed = reason.trim();
  const ready = trimmed.length >= RATING_RULES.reasonMinLength;

  const send = async () => {
    if (!ready || state === 'sending') return;
    setState('sending');
    setError('');
    try {
      await reportReview(review.id, trimmed);
      setState('sent');
    } catch (err) {
      setState('idle');
      setError(
        err instanceof ApiError && (err.code === 'REVIEW_ALREADY_REPORTED' || err.code === 'REVIEW_OWN')
          ? err.message
          : t("Couldn't send the report. Try again.")
      );
    }
  };
  const close = () => {
    if (state !== 'sending') setOpen(false);
  };
  const notNow = (
    <Pressable accessibilityRole="button" onPress={close} style={styles.notNow}>
      <T size={13} weight={500} color={colors.textSecondary}>
        {t('Not now')}
      </T>
    </Pressable>
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Report {name}'s review", { name: review.userName })}
        onPress={() => {
          setReason('');
          setError('');
          setState('idle');
          setOpen(true);
        }}
        style={styles.reportHit}
      >
        <T size={12} weight={500} color={colors.textSecondary}>
          {t('Report')}
        </T>
      </Pressable>
      <ScSheet open={open} onClose={close} dismissible={state !== 'sending'} accessibilityLabel={t('Report this review')} horizontalPadding={16}>
        {!user ? (
          <View style={styles.sheet}>
            <View>
              <T size={16} weight={600}>
                {t('Sign in to report a review')}
              </T>
              <T size={13} color={colors.textSecondary} style={styles.sheetLine}>
                {t('Reports come from an account, so the team can follow up. Signing in brings you back here.')}
              </T>
            </View>
            <ScButton
              onPress={() => {
                setOpen(false);
                setTimeout(() => router.push(`/login?next=${encodeURIComponent(garagePath)}` as Href), AFTER_SHEET_MS);
              }}
            >
              {t('Sign in')}
            </ScButton>
            {notNow}
          </View>
        ) : state === 'sent' ? (
          <View style={styles.sheet}>
            <View accessibilityLiveRegion="polite">
              <T size={16} weight={600}>
                {t("Thanks, we've got it")}
              </T>
              <T size={13} color={colors.textSecondary} style={styles.sheetLine}>
                {t('The team will look at this review. If it breaks our rules, it comes down.')}
              </T>
            </View>
            <ScButton variant="outline" onPress={close}>
              {t('Done')}
            </ScButton>
          </View>
        ) : (
          <View style={styles.sheet}>
            <View>
              <T size={16} weight={600}>
                {t('Report this review')}
              </T>
              <T size={13} color={colors.textSecondary} style={styles.sheetLine}>
                {t('Tell the team what is wrong: abusive, fake, or about another garage.')}
              </T>
            </View>
            <ScTextarea
              label={t("What's wrong with it?")}
              rows={3}
              maxLength={RATING_RULES.reportReasonMaxLength}
              value={reason}
              onChangeText={setReason}
            />
            {error ? (
              <T accessibilityRole="alert" size={12} color={colors.error}>
                {error}
              </T>
            ) : null}
            <ScButton disabled={!ready || state === 'sending'} onPress={() => void send()}>
              {state === 'sending' ? t('Sending…') : t('Send report')}
            </ScButton>
            {notNow}
          </View>
        )}
      </ScSheet>
    </>
  );
}

const useSummary = (vendorId: string) =>
  useQuery({
    queryKey: ['vendors', 'review-summary', vendorId],
    queryFn: () => getVendorReviewSummary(vendorId),
    staleTime: 5 * 60_000,
  }).data;

/** The approved addition: star bars and tag counts, from the existing summary route. */
function StarBars({ vendorId }: { vendorId: string }) {
  const colors = useColors();
  const styles = useStyles();
  const stars = useSummary(vendorId)?.stars ?? [];
  if (stars.length === 0) return null;
  const most = Math.max(1, ...stars.map((s) => s.count));
  return (
    <View style={styles.bars}>
      {[5, 4, 3, 2, 1].map((n) => {
        const count = stars.find((s) => s.stars === n)?.count ?? 0;
        return (
          <View key={n} style={styles.barRow}>
            <T num size={10} lh={12} color={colors.textMuted}>
              {n}
            </T>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${(count / most) * 100}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function TagCounts({ vendorId }: { vendorId: string }) {
  const colors = useColors();
  const styles = useStyles();
  const tags = useSummary(vendorId)?.tags ?? [];
  if (tags.length === 0) return null;
  return (
    <View style={styles.tags}>
      {tags.map((tag) => {
        const tint = tag.positive ? colors.success : colors.textSecondary;
        return (
          <View key={tag.tag} style={[styles.tag, tag.positive ? styles.tagGood : styles.tagOther]}>
            <T size={12} lh={16} color={tint}>
              {tag.label} · <T num size={12} lh={16} color={tint}>{tag.count}</T>
            </T>
          </View>
        );
      })}
    </View>
  );
}

/** The Reviews tab of apps/users/app/garage/[id]/page.tsx. */
export function ReviewsTab({ vendor, reviewCount }: { vendor: Vendor; reviewCount: number }) {
  const tn = useTn();
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const reviews = useVendorReviews(vendor.id).data ?? [];
  const showStars = hasStarScore({ reviewCount, isNew: vendor.isNew });
  const soFar = newGarageReviewsLine(reviewCount);
  return (
    <>
      <View style={styles.scoreRow}>
        {showStars ? (
          <View style={styles.score}>
            <T num size={30} weight={700} lh={36}>
              {vendor.rating.toFixed(1)}
            </T>
            <View>
              <Stars rating={vendor.rating} size={16} />
              <T size={11} color={colors.textSecondary}>
                {tn(reviewCount, '{count} review', '{count} reviews')}
              </T>
            </View>
          </View>
        ) : (
          <View>
            <T size={15} weight={600}>
              {t(NEW_GARAGE_LABEL)}
            </T>
            {soFar ? (
              <T size={11} color={colors.textSecondary}>
                {soFar}
              </T>
            ) : null}
          </View>
        )}
        <StarBars vendorId={vendor.id} />
      </View>
      <TagCounts vendorId={vendor.id} />
      {reviews.length === 0 ? (
        <T size={13} color={colors.textSecondary} align="center" style={styles.none}>
          {t('No reviews yet.')}
        </T>
      ) : null}
      {reviews.map((review) => (
        <ScCard key={review.id}>
          <View style={styles.who}>
            <View style={styles.initials}>
              <T size={11} weight={600} lh={14}>
                {review.userName.slice(0, 2).toUpperCase()}
              </T>
            </View>
            <View style={styles.flex}>
              <T size={13} weight={500}>
                {review.userName}
              </T>
              <T num size={11} weight={500} color={colors.textMuted}>
                {review.date}
              </T>
              {review.bookingContext ? (
                <T size={11} lh={15} color={colors.textMuted}>
                  {`${t('Booked on Detlio')} · ${review.bookingContext}`}
                </T>
              ) : null}
            </View>
            <Stars rating={review.rating} size={12} />
          </View>
          {review.comment ? (
            <T size={13} color={colors.textSecondary} style={styles.comment}>
              {review.comment}
            </T>
          ) : null}
          {review.reply ? (
            <View style={styles.reply}>
              <T size={12} weight={600}>
                {t('Reply from {name}', { name: vendor.name })}
              </T>
              <T size={13} color={colors.textSecondary} style={styles.replyText}>
                {review.reply.text}
              </T>
            </View>
          ) : null}
          <View style={styles.reportRow}>
            <ReportReview review={review} garagePath={`/garage/${vendor.id}`} />
          </View>
        </ScCard>
      ))}
    </>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bars: { flex: 1, minWidth: 0, gap: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: c.bars },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: c.warningFill },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { height: 26, justifyContent: 'center', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10 },
  tagGood: { borderColor: 'rgba(34,197,94,0.5)' },
  tagOther: { borderColor: c.line },
  none: { paddingVertical: 16 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  initials: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceElevated },
  comment: { marginTop: 8 },
  reply: { marginTop: 8, borderRadius: 10, borderLeftWidth: 2, borderLeftColor: c.textPrimary, backgroundColor: c.surfaceElevated, paddingHorizontal: 12, paddingVertical: 8 },
  replyText: { marginTop: 2 },
  reportRow: { marginTop: 4, flexDirection: 'row', justifyContent: 'flex-end' },
  reportHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  sheet: { gap: 16 },
  sheetLine: { marginTop: 4 },
  notNow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
}));
