import { submitReview } from '@repo/core/api/reviews';
import { invalidateHome } from '@repo/core/api/hooks/use-home';
import { useT, useTn } from '@repo/core/i18n';
import { REVIEW_TAG_LABELS, type ReviewTag, tagsForRating } from '@repo/core/ratings';
import type { Booking, Review } from '@repo/core/types';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconStarFilled } from '@repo/native-ui/icons';
import { ScTextarea } from '@repo/native-ui/inputs';
import { ScCard, Stars } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorText } from '@/lib/error-text';
import { track } from '@/lib/shims/analytics';

/** Frame L: stars, tags that change with them, an optional note. */
export function ReviewCard({ booking, initialRating = 0, onSaved }: { booking: Booking; initialRating?: number; onSaved: (review: Review) => void }) {
  const tn = useTn();
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(initialRating);
  const [tags, setTags] = useState<ReviewTag[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pick = (stars: number) => {
    setRating(stars);
    // Good tags go with 4-5 stars, problems with 1-3: crossing over clears them.
    setTags((current) => current.filter((tag) => tagsForRating(stars).includes(tag)));
  };

  const submit = async () => {
    if (!rating || submitting) return;
    setSubmitting(true);
    try {
      const review = await submitReview({ bookingId: booking.id, rating, comment: comment.trim() || undefined, tags });
      onSaved(review);
      track('review_submit', { vendorId: booking.vendorId });
      void invalidateHome(queryClient);
      toast.success(t('Review submitted. Thanks!'));
    } catch (error) {
      toast.error(errorText(error, t('Failed to submit review')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScCard style={styles.card}>
      <T size={17} weight={500} lh={24}>
        {t('How was {name}?', { name: booking.vendorName })}
      </T>
      <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={t('Your rating')} accessibilityValue={{ text: t('{rating} of 5', { rating }) }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={tn(n, '{count} star', '{count} stars')} hitSlop={6} onPress={() => pick(n)}>
            <IconStarFilled size={32} color={n <= rating ? colors.textPrimary : colors.border} />
          </Pressable>
        ))}
      </View>
      {rating > 0 ? (
        <>
          <View style={styles.section}>
            <T size={13} lh={18} color={colors.textSecondary}>
              {t('What stood out? (optional)')}
            </T>
            <View style={styles.chips}>
              {tagsForRating(rating).map((tag) => (
                <Chip
                  key={tag}
                  label={t(REVIEW_TAG_LABELS[tag])}
                  selected={tags.includes(tag)}
                  onPress={() => setTags((current) => (current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag]))}
                />
              ))}
            </View>
          </View>
          <ScTextarea label={t('Tell others more (optional)')} rows={3} maxLength={1000} value={comment} onChangeText={setComment} />
          <ScButton variant="outline" disabled={submitting} onPress={() => void submit()}>
            {submitting ? t('Posting…') : t('Post review')}
          </ScButton>
        </>
      ) : null}
    </ScCard>
  );
}

/** A review already left. */
export function ReviewDone({ review }: { review: Review }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <ScCard style={styles.card}>
      <T size={17} weight={500} lh={24}>
        {t('Your review')}
      </T>
      <Stars rating={review.rating} size={18} />
      <T size={15} lh={22} color={colors.textSecondary}>
        {t('Thanks for your review.')}
      </T>
      {review.comment ? (
        <T size={15} lh={22}>
          {review.comment}
        </T>
      ) : null}
    </ScCard>
  );
}

const useStyles = createStyles(() => ({
  card: { gap: 12 },
  stars: { flexDirection: 'row', gap: 10 },
  section: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
