import type { ApiPublicReview, ApiReviewSummary } from '@repo/core/api/types';
import {
  isNewGarage,
  NEGATIVE_REVIEW_TAGS,
  POSITIVE_REVIEW_TAGS,
  RATING_RULES,
  REVIEW_TAG_LABELS,
  type ReviewTag,
} from '@repo/core/ratings';
import { istDateLabel } from '@repo/core/payouts';
import { formatServiceSummary } from '@repo/core/utils';

/**
 * The garage's Reviews screen, as data: the owner's own list (GET /vendors/me/reviews, with
 * reply and report state) and the public one an operator reads (GET /reviews/vendors/:id)
 * come out as the same rows. Pure, so the rules can be tested.
 */

/** GET /vendors/me/reviews (apps/server/src/modules/reviews/reviews.service.ts listForGarage). */
export interface GarageReviewApi {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  tags: Array<{ tag: string; label: string }>;
  reply: {
    text: string;
    repliedAt: string;
    updatedAt: string | null;
    editableUntil: string;
    editable: boolean;
  } | null;
  /** Never replied, or still within the 24 hours of the first reply. */
  canReply: boolean;
  reportedByYou: boolean;
  user: { name: string } | null;
  booking: { serviceNames?: string[]; service: { id: string; name: string } | null } | null;
}

export interface GarageReviewsApi {
  summary: Omit<ApiReviewSummary, 'stars'>;
  reviews: GarageReviewApi[];
}

export interface ReviewReply {
  text: string;
  repliedAt: string;
  /** When the reply stops being changeable; null when the server did not say (the public list). */
  editableUntil: string | null;
  editable: boolean;
}

export interface ReviewRow {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  name: string;
  /** The job it is about: "Foam wash", "Foam wash + 1 more". */
  context: string;
  reply: ReviewReply | null;
  /** The garage may post or change a reply now (owner seat only). */
  canReply: boolean;
  reported: boolean;
}

export interface TagCount {
  tag: string;
  label: string;
  count: number;
  positive: boolean;
}

export interface ReviewsData {
  /** Counted reviews, newest first. */
  reviews: ReviewRow[];
  /** The server's tag counts, or none when the summary could not be read. */
  tags: TagCount[];
  /** The server's score for the garage, null for a new garage or when the summary is missing. */
  rating: number | null;
  /** Whether this list carries reply and report state (the owner's list does). */
  own: boolean;
}

const contextOf = (booking: GarageReviewApi['booking']) =>
  booking
    ? formatServiceSummary(booking.serviceNames?.length ? booking.serviceNames : [booking.service?.name ?? ''])
    : '';

export function fromGarageList(api: GarageReviewsApi): ReviewsData {
  return {
    own: true,
    rating: api.summary.rating,
    tags: api.summary.tags,
    reviews: api.reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment ?? '',
      createdAt: review.createdAt,
      name: review.user?.name ?? 'Customer',
      context: contextOf(review.booking),
      reply: review.reply
        ? {
            text: review.reply.text,
            repliedAt: review.reply.repliedAt,
            editableUntil: review.reply.editableUntil,
            editable: review.reply.editable,
          }
        : null,
      canReply: review.canReply,
      reported: review.reportedByYou,
    })),
  };
}

/** The public feed, which an operator reads: no reply or report state, so nothing to act on. */
export function fromPublicList(
  list: ApiPublicReview[],
  summary: Pick<ApiReviewSummary, 'rating' | 'tags'> | null
): ReviewsData {
  return {
    own: false,
    rating: summary?.rating ?? null,
    tags: summary?.tags ?? [],
    reviews: list.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment ?? '',
      createdAt: review.createdAt,
      name: review.user?.name ?? 'Customer',
      context: contextOf(review.booking),
      reply: review.reply
        ? { text: review.reply.text, repliedAt: review.reply.repliedAt, editableUntil: null, editable: false }
        : null,
      canReply: false,
      reported: false,
    })),
  };
}

/** What the summary card says: the score, or the new-garage line, from the counted reviews. */
export function summaryView(data: ReviewsData):
  | { kind: 'none' }
  | { kind: 'new'; count: number }
  | { kind: 'score'; average: number; count: number } {
  const count = data.reviews.length;
  if (count === 0) return { kind: 'none' };
  if (isNewGarage(count)) return { kind: 'new', count };
  // The server's score when it gave one, else the list's own average, as the web works it out.
  const average = data.rating ?? data.reviews.reduce((sum, review) => sum + review.rating, 0) / count;
  return { kind: 'score', average, count };
}

/**
 * The tag lines of the summary card (mockup frame H): "Top: On time, Spotless finish" and
 * "To work on: Damp/wet interior (2)". Highest count first, ties in the list's order.
 */
export function tagSummary(tags: TagCount[]): {
  top: string[];
  workOn: Array<{ label: string; count: number }>;
} {
  const rank = (list: readonly ReviewTag[], positive: boolean) =>
    list
      .map((tag) => ({ tag, count: tags.find((t) => t.tag === tag && t.positive === positive)?.count ?? 0 }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
  return {
    top: rank(POSITIVE_REVIEW_TAGS, true)
      .slice(0, 3)
      .map((row) => REVIEW_TAG_LABELS[row.tag]),
    workOn: rank(NEGATIVE_REVIEW_TAGS, false)
      .slice(0, 3)
      .map((row) => ({ label: REVIEW_TAG_LABELS[row.tag], count: row.count })),
  };
}

/** "PR" for Priya: two letters, whole characters. */
export function initials(name: string): string {
  return Array.from(name).slice(0, 2).join('').toUpperCase();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** "26 Oct, 9:41 am", an IST moment as a person reads it. */
export function istMomentLabel(iso: string): string {
  const clock = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const hour = clock.getUTCHours();
  const minutes = String(clock.getUTCMinutes()).padStart(2, '0');
  return `${clock.getUTCDate()} ${MONTHS[clock.getUTCMonth()]}, ${hour % 12 || 12}:${minutes} ${hour < 12 ? 'am' : 'pm'}`;
}

export const reviewDateLabel = (createdAt: string) => istDateLabel(createdAt);

/** What the reply sheet says about when the reply can still be changed. */
export function replyWindowLine(reply: ReviewReply | null): string {
  if (!reply) {
    return `Everyone who reads this review sees your reply. You can change it for ${RATING_RULES.replyEditHours} hours after you post it, then it stays.`;
  }
  return reply.editableUntil
    ? `You can change this reply until ${istMomentLabel(reply.editableUntil)}.`
    : 'You can change this reply for a short while after you post it.';
}

/** Whether Post reply can be pressed: some text, within the limit, and different from what is posted. */
export function replyReady(text: string, current: ReviewReply | null): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > RATING_RULES.replyMaxLength) return false;
  return trimmed !== (current?.text ?? '');
}

/** Whether Send report can be pressed: a few words, within the limit. */
export function reportReady(reason: string): boolean {
  const length = reason.trim().length;
  return length >= RATING_RULES.reasonMinLength && length <= RATING_RULES.reportReasonMaxLength;
}

/** A row with the server's answer to a reply put in. */
export function withReply(row: ReviewRow, reply: ReviewReply): ReviewRow {
  return { ...row, reply, canReply: reply.editable };
}

/** Rows with one review changed. */
export function updateRow(rows: ReviewRow[], id: string, change: (row: ReviewRow) => ReviewRow): ReviewRow[] {
  return rows.map((row) => (row.id === id ? change(row) : row));
}
