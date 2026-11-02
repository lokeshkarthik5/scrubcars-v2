/// <reference types="bun" />
import { expect, test } from 'bun:test';

import {
  fromGarageList,
  fromPublicList,
  initials,
  istMomentLabel,
  replyReady,
  replyWindowLine,
  reportReady,
  summaryView,
  tagSummary,
  updateRow,
  withReply,
  type GarageReviewApi,
  type ReviewsData,
  type TagCount,
} from './reviews-view';

const api = (over: Partial<GarageReviewApi> = {}): GarageReviewApi => ({
  id: 'r1',
  rating: 5,
  comment: 'Car looked new.',
  createdAt: '2026-10-30T08:00:00.000Z',
  tags: [],
  reply: null,
  canReply: true,
  reportedByYou: false,
  user: { name: 'Karthik R.' },
  booking: { serviceNames: ['Foam wash'], service: { id: 's1', name: 'Foam wash' } },
  ...over,
});

const summary = { rating: 4.5, reviewCount: 3, isNew: false, tags: [], knownFor: null };

test('the owner list becomes rows with reply and report state', () => {
  const data = fromGarageList({
    summary,
    reviews: [
      api(),
      api({
        id: 'r2',
        comment: null,
        user: null,
        booking: { serviceNames: ['Foam wash', 'Interior clean'], service: null },
        reply: {
          text: 'Thank you.',
          repliedAt: '2026-10-31T08:00:00.000Z',
          updatedAt: null,
          editableUntil: '2026-11-01T08:00:00.000Z',
          editable: true,
        },
        reportedByYou: true,
      }),
    ],
  });
  expect(data.own).toBe(true);
  expect(data.rating).toBe(4.5);
  expect(data.reviews[0]).toMatchObject({ name: 'Karthik R.', context: 'Foam wash', canReply: true, reported: false });
  expect(data.reviews[1]).toMatchObject({
    name: 'Customer',
    comment: '',
    context: 'Foam wash + 1 more',
    reported: true,
    reply: { text: 'Thank you.', editable: true },
  });
});

test('the public feed an operator reads has nothing to act on', () => {
  const data = fromPublicList(
    [
      {
        id: 'r1',
        vendorId: 'v',
        rating: 4,
        comment: 'Good',
        createdAt: '2026-10-30T08:00:00.000Z',
        reply: { text: 'Thanks', repliedAt: '2026-10-31T08:00:00.000Z' },
        user: { name: 'Priya S.' },
        booking: { serviceNames: ['Wax'], service: { id: 's', name: 'Wax' } },
      },
    ],
    null
  );
  expect(data.own).toBe(false);
  expect(data.tags).toEqual([]);
  expect(data.reviews[0]).toMatchObject({ canReply: false, reported: false, context: 'Wax', reply: { editable: false } });
});

const rows = (n: number, rating = 4): ReviewsData => ({
  own: true,
  rating: null,
  tags: [],
  reviews: Array.from({ length: n }, (_, i) => fromGarageList({ summary, reviews: [api({ id: `r${i}`, rating })] }).reviews[0]),
});

test('summary: none, new under three reviews, else the score', () => {
  expect(summaryView(rows(0))).toEqual({ kind: 'none' });
  expect(summaryView(rows(1))).toEqual({ kind: 'new', count: 1 });
  expect(summaryView(rows(2))).toEqual({ kind: 'new', count: 2 });
  // No server score: the list's own average.
  expect(summaryView(rows(3, 4))).toEqual({ kind: 'score', average: 4, count: 3 });
  expect(summaryView({ ...rows(3, 4), rating: 4.6 })).toEqual({ kind: 'score', average: 4.6, count: 3 });
});

const tag = (t: string, count: number, positive: boolean): TagCount => ({ tag: t, label: t, count, positive });

test('tag summary: best good tags first, problems with their counts', () => {
  const result = tagSummary([
    tag('on_time', 12, true),
    tag('spotless_finish', 14, true),
    tag('friendly', 0, true),
    tag('good_value', 3, true),
    tag('missed_spots', 1, false),
    tag('damp_interior', 2, false),
    tag('late', 0, false),
  ]);
  expect(result.top).toEqual(['Spotless finish', 'On time', 'Good value']);
  expect(result.workOn).toEqual([
    { label: 'Damp/wet interior', count: 2 },
    { label: 'Missed spots', count: 1 },
  ]);
  expect(tagSummary([])).toEqual({ top: [], workOn: [] });
});

test('initials are two whole characters, upper case', () => {
  expect(initials('Priya S.')).toBe('PR');
  expect(initials('x')).toBe('X');
  // Two characters, not two UTF-16 units: an emoji is not cut in half.
  expect(initials('😀😀😀')).toBe('😀😀');
});

test('IST moments read as a person writes them', () => {
  expect(istMomentLabel('2026-10-26T04:11:00.000Z')).toBe('26 Oct, 9:41 am');
  expect(istMomentLabel('2026-10-26T18:30:00.000Z')).toBe('27 Oct, 12:00 am');
  expect(istMomentLabel('2026-10-26T06:30:00.000Z')).toBe('26 Oct, 12:00 pm');
});

test('the reply sheet states its window', () => {
  expect(replyWindowLine(null)).toContain('24 hours');
  expect(
    replyWindowLine({ text: 'x', repliedAt: '', editableUntil: '2026-10-26T04:11:00.000Z', editable: true })
  ).toBe('You can change this reply until 26 Oct, 9:41 am.');
});

test('Post reply needs new text within 1000 characters', () => {
  const current = { text: 'Thanks', repliedAt: '', editableUntil: null, editable: true };
  expect(replyReady('', null)).toBe(false);
  expect(replyReady('   ', null)).toBe(false);
  expect(replyReady('Thank you', null)).toBe(true);
  expect(replyReady('Thanks ', current)).toBe(false);
  expect(replyReady('Thanks a lot', current)).toBe(true);
  expect(replyReady('a'.repeat(1000), null)).toBe(true);
  expect(replyReady('a'.repeat(1001), null)).toBe(false);
});

test('Send report needs 3 to 500 characters', () => {
  expect(reportReady('ab')).toBe(false);
  expect(reportReady('  ab  ')).toBe(false);
  expect(reportReady('fake')).toBe(true);
  expect(reportReady('a'.repeat(500))).toBe(true);
  expect(reportReady('a'.repeat(501))).toBe(false);
});

test('a posted reply goes on its row and keeps or ends the right to change it', () => {
  const [row] = rows(1).reviews;
  const posted = withReply(row, { text: 'Hi', repliedAt: 'x', editableUntil: 'y', editable: true });
  expect(posted).toMatchObject({ canReply: true, reply: { text: 'Hi' } });
  expect(withReply(row, { text: 'Hi', repliedAt: 'x', editableUntil: 'y', editable: false }).canReply).toBe(false);
  const list = rows(2).reviews;
  expect(updateRow(list, 'r1', (r) => ({ ...r, reported: true })).map((r) => r.reported)).toEqual([false, true]);
});
