import { NEW_GARAGE_LABEL, RATING_RULES } from '@repo/core/ratings';
import { formatRating } from '@repo/core/vendor-stats';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { ScButton } from '@repo/native-ui/button';
import { IconStar } from '@repo/native-ui/icons';
import { EmptyState, LoadError, ScCard, Skeleton, SkeletonList, Stars } from '@repo/native-ui/primitives';
import { ReplySheet, ReportSheet } from '@/components/review-sheets';
import { TopBar } from '@/components/rows';
import { useSupportSession } from '@/components/support-session-banner';
import { T } from '@repo/native-ui/text';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import { getReviewsFor } from '@/lib/reviews-api';
import {
  initials,
  istMomentLabel,
  type ReviewReply,
  type ReviewRow,
  type ReviewsData,
  reviewDateLabel,
  summaryView,
  tagSummary,
  updateRow,
  withReply,
} from '@/lib/reviews-view';
import { colors } from '@/lib/theme';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/home'));

/** "3 reviews", with the figure in the brand's numeric face. */
function CountLine({ count, suffix = '' }: { count: number; suffix?: string }) {
  return (
    <T size={12} color={colors.textSecondary}>
      <T num size={12} color={colors.textSecondary}>
        {count}
      </T>
      {` ${count === 1 ? 'review' : 'reviews'}${suffix}`}
    </T>
  );
}

/** The summary card (mockup frame H): the score, or "New on Detlio", and what customers say. */
function SummaryCard({ data }: { data: ReviewsData }) {
  const view = summaryView(data);
  const tags = tagSummary(data.tags);
  const hasTags = tags.top.length > 0 || tags.workOn.length > 0;
  if (view.kind === 'none') return null;
  return (
    <ScCard style={styles.summary}>
      {view.kind === 'new' ? (
        <View style={styles.newGarage}>
          <T size={17} weight={600}>
            {NEW_GARAGE_LABEL}
          </T>
          <T size={12} color={colors.textSecondary}>
            <T num size={12} color={colors.textSecondary}>
              {view.count}
            </T>
            {` ${view.count === 1 ? 'review' : 'reviews'} so far. Customers see your score from `}
            <T num size={12} color={colors.textSecondary}>
              {RATING_RULES.minCountedReviews}
            </T>
            {' reviews.'}
          </T>
        </View>
      ) : (
        <View style={styles.score}>
          <T num size={40} weight={700} lh={40} tracking={-0.025}>
            {formatRating(view.average)}
          </T>
          <View style={styles.scoreRight}>
            <Stars rating={view.average} size={18} />
            <CountLine count={view.count} />
          </View>
        </View>
      )}
      {hasTags ? (
        <View style={styles.tagBlock}>
          {tags.top.length > 0 ? (
            <T size={13} lh={20} color={colors.textSecondary}>
              {'Top: '}
              <T size={13} lh={20} weight={600}>
                {tags.top.join(', ')}
              </T>
            </T>
          ) : null}
          {tags.workOn.length > 0 ? (
            <T size={13} lh={20} color={colors.textSecondary}>
              {'To work on: '}
              {tags.workOn.map((tag, i) => (
                <T key={tag.label} size={13} lh={20} color={colors.textSecondary}>
                  {i > 0 ? ', ' : ''}
                  <T size={13} lh={20} weight={600}>
                    {tag.label}
                  </T>
                  {' '}
                  <T num size={13} lh={20} color={colors.textSecondary}>
                    {`(${tag.count})`}
                  </T>
                </T>
              ))}
            </T>
          ) : null}
        </View>
      ) : null}
    </ScCard>
  );
}

/** One of the two side-by-side pills under a review (mockup: 14px, half the width each). */
function PillButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.flex}>
      <ScButton variant="outline" onPress={onPress}>
        <T size={14} weight={600} lh={20} numberOfLines={1}>
          {label}
        </T>
      </ScButton>
    </View>
  );
}

function ReviewCard({
  review,
  canAct,
  onReply,
  onReport,
}: {
  review: ReviewRow;
  canAct: boolean;
  onReply: () => void;
  onReport: () => void;
}) {
  const canReply = canAct && review.canReply;
  const canReport = canAct && !review.reported;
  const reportedNote = canAct && review.reported;
  return (
    <ScCard>
      <View style={styles.head}>
        <View accessibilityElementsHidden style={styles.avatar}>
          <T size={11} weight={600}>
            {initials(review.name)}
          </T>
        </View>
        <View style={styles.flex}>
          <T size={13} weight={500} numberOfLines={1}>
            {review.name}
          </T>
          <T num size={11} color={colors.textMuted}>
            {reviewDateLabel(review.createdAt)}
          </T>
        </View>
        <Stars rating={review.rating} size={12} />
      </View>
      {review.comment ? (
        <T size={13} lh={18} color={colors.textSecondary} style={styles.comment}>
          {review.comment}
        </T>
      ) : null}
      {review.context ? (
        <T size={11} color={colors.textMuted} style={styles.context}>
          {review.context}
        </T>
      ) : null}
      {/* Your public reply, as customers read it. */}
      {review.reply ? (
        <View style={styles.reply}>
          <T size={12} weight={600}>
            Your reply
          </T>
          <T size={13} color={colors.textSecondary} style={styles.replyText}>
            {review.reply.text}
          </T>
          {canReply && review.reply.editableUntil ? (
            <T size={11} color={colors.textMuted} style={styles.replyText}>
              {`You can change it until ${istMomentLabel(review.reply.editableUntil)}`}
            </T>
          ) : null}
        </View>
      ) : null}
      {canReply || canReport || reportedNote ? (
        <View style={styles.actions}>
          {canReply || canReport ? (
            <View style={styles.pills}>
              {canReply ? (
                <PillButton label={review.reply ? 'Change reply' : 'Reply publicly'} onPress={onReply} />
              ) : null}
              {canReport ? <PillButton label="Report to Detlio" onPress={onReport} /> : null}
            </View>
          ) : null}
          {reportedNote ? (
            <T size={12} color={colors.textMuted}>
              Reported to Detlio. The team will look at it.
            </T>
          ) : null}
        </View>
      ) : null}
    </ScCard>
  );
}

/**
 * apps/vendors/app/reviews/page.tsx (summary and list, replies read-only), plus what the web
 * lacks and the owner asked for (mockup frame H): the tags customers pick, Reply publicly
 * and Report to Detlio. The owner seat reads its own list; an operator reads the public one
 * and has nothing to act on, as the server refuses them.
 */
function ReviewsScreen() {
  const vendorId = useAuth((s) => s.vendor?.id);
  const isOwner = useIsVendorAdmin();
  const support = useSupportSession();
  const queryClient = useQueryClient();
  const queryKey = ['reviews', 'garage', vendorId, isOwner] as const;
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const seen = useRef(false);

  const query = useQuery({
    queryKey,
    queryFn: () => getReviewsFor(vendorId as string, isOwner),
    enabled: Boolean(vendorId),
    retry: false,
  });
  const { data, refetch } = query;

  // The tab stays mounted: read again when it is opened, so a new review shows.
  useFocusEffect(
    useCallback(() => {
      if (seen.current) void refetch();
      seen.current = true;
    }, [refetch])
  );

  // The server refuses a support session's reply and report: the controls are not drawn.
  const canAct = isOwner && !support && Boolean(data?.own);

  const change = (id: string, edit: (row: ReviewRow) => ReviewRow) =>
    queryClient.setQueryData<ReviewsData>(queryKey, (old) =>
      old ? { ...old, reviews: updateRow(old.reviews, id, edit) } : old
    );

  const replyReview = data?.reviews.find((r) => r.id === replyId) ?? null;
  const reportReview = data?.reviews.find((r) => r.id === reportId) ?? null;

  const loaded = !query.isPending;
  const failed = query.isError && !data;

  return (
    <AppShell>
      <TopBar title="Reviews" onBack={goBack} />

      {/* The summary waits for the list too: a 0 and five empty stars for a moment, on a
          garage with plenty of reviews, reads as a bad score. */}
      {!loaded ? <Skeleton height={72} /> : data && !failed ? <SummaryCard data={data} /> : null}

      {/* With no reviews there is no summary card at all: the empty state says so. */}
      {!loaded ? (
        <SkeletonList count={3} height={92} />
      ) : failed || !data ? (
        <LoadError what="your reviews" retrying={query.isRefetching} onRetry={() => void refetch()} />
      ) : data.reviews.length === 0 ? (
        <EmptyState
          icon={<IconStar size={28} stroke={1.5} color={colors.textSecondary} />}
          title="No reviews yet"
          subtitle="Reviews will appear after your first completed job"
        />
      ) : (
        <View style={styles.list}>
          {data.reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              canAct={canAct}
              onReply={() => {
                setReplyId(review.id);
                setReplyOpen(true);
              }}
              onReport={() => {
                setReportId(review.id);
                setReportOpen(true);
              }}
            />
          ))}
        </View>
      )}

      <ReplySheet
        review={replyReview}
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        onSaved={(id: string, reply: ReviewReply) => change(id, (row) => withReply(row, reply))}
        onStale={() => void refetch()}
      />
      <ReportSheet
        review={reportReview}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onReported={(id) => change(id, (row) => ({ ...row, reported: true }))}
      />
    </AppShell>
  );
}

export default garageScreen(ReviewsScreen);

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 8 },
  summary: { paddingVertical: 16, paddingHorizontal: 16 },
  newGarage: { gap: 4 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreRight: { gap: 4 },
  tagBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  comment: { marginTop: 8 },
  context: { marginTop: 4 },
  reply: {
    marginTop: 8,
    borderRadius: 10,
    borderLeftWidth: 2,
    borderLeftColor: colors.textPrimary,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  replyText: { marginTop: 2 },
  actions: {
    marginTop: 10,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pills: { flexDirection: 'row', gap: 8 },
});
