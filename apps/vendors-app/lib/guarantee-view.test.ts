import { describe, expect, test } from 'bun:test';

import type { GarageClaim } from '@repo/core/api/guarantee';
import type { JobPhoto } from '@repo/core/types';

import {
  answerByLine,
  canSendDispute,
  claimNotes,
  claimSubtitle,
  claimTitle,
  disputeNote,
  garageStages,
  GUARANTEE_INTRO,
  hasGaragePhotos,
} from './guarantee-view';

const time = (iso: string) => `T(${iso})`;

const claim = (over: Partial<GarageClaim> = {}): GarageClaim => ({
  id: 'c1',
  bookingId: 'b1',
  bookingRef: 'AB12',
  status: 'waiting_garage',
  route: 'garage',
  issues: [{ key: 'missed_spots', label: 'Missed spots or dirt left' }],
  otherText: null,
  customerFirstName: 'Asha',
  service: 'Premium Car Wash',
  scheduledAt: null,
  completedAt: null,
  customerPhotos: [],
  garagePhotos: [],
  createdAt: '2026-11-01T10:00:00.000Z',
  garageRespondBy: null,
  canAnswer: true,
  canDispute: true,
  garageResponse: null,
  garageNote: null,
  decision: null,
  decisionReason: null,
  redoBookBy: null,
  redoBooking: null,
  closeReason: null,
  ...over,
});

const photo = (over: Partial<JobPhoto>): JobPhoto =>
  ({ id: 'p', url: 'https://x/p.jpg', by: 'garage', stage: 'before', angle: null, ...over }) as JobPhoto;

describe('intro', () => {
  test('says the rules from GUARANTEE_RULES', () => {
    expect(GUARANTEE_INTRO).toContain('within 48 hours of a wash or detailing');
    expect(GUARANTEE_INTRO).toContain('Answer within 12 hours of your opening hours');
  });
});

describe('dispute', () => {
  test('needs five characters after trimming', () => {
    expect(canSendDispute('')).toBe(false);
    expect(canSendDispute('  ab  ')).toBe(false);
    expect(canSendDispute('abcd ')).toBe(false);
    expect(canSendDispute('abcde')).toBe(true);
    expect(canSendDispute('  abcde  ')).toBe(true);
  });
  test('sends the trimmed note, at most 500 characters', () => {
    expect(disputeNote('  Done well  ')).toBe('Done well');
    expect(disputeNote('x'.repeat(600))).toHaveLength(500);
  });
});

describe('answerByLine', () => {
  const now = Date.parse('2026-11-01T10:00:00.000Z');
  test('counts down in hours and minutes, with the deadline', () => {
    const line = answerByLine({ garageRespondBy: '2026-11-01T13:20:00.000Z' }, now, time);
    expect(line).toBe('Answer within 3 h 20 m of now (by T(2026-11-01T13:20:00.000Z))');
  });
  test('says minutes under an hour', () => {
    expect(answerByLine({ garageRespondBy: '2026-11-01T10:30:00.000Z' }, now, time)).toStartWith(
      'Answer within 30 min of now'
    );
  });
  test('nothing once the time has passed, or without one', () => {
    expect(answerByLine({ garageRespondBy: '2026-11-01T09:59:00.000Z' }, now, time)).toBeNull();
    expect(answerByLine({ garageRespondBy: null }, now, time)).toBeNull();
  });
});

describe('titles', () => {
  test('name and service, then the booking and when it was done', () => {
    expect(claimTitle(claim())).toBe('Asha · Premium Car Wash');
    expect(claimSubtitle(claim(), time)).toBe('Booking #AB12');
    expect(claimSubtitle(claim({ completedAt: '2026-10-31T08:00:00.000Z' }), time)).toBe(
      'Booking #AB12 · done T(2026-10-31T08:00:00.000Z)'
    );
  });
});

describe('claimNotes', () => {
  test('a plain waiting claim has none', () => {
    expect(claimNotes(claim(), time)).toEqual([]);
  });
  test('approved at once with no photos', () => {
    expect(claimNotes(claim({ route: 'auto', status: 'redo_approved' }), time)[0]?.text).toStartWith('Approved at once');
  });
  test('with Detlio and nothing said yet', () => {
    const notes = claimNotes(claim({ route: 'detlio', status: 'needs_detlio' }), time);
    expect(notes.map((n) => n.text)).toEqual(['Detlio is reviewing this claim. Nothing for you to do yet.']);
  });
  test('a dispute shows what the garage said, then Detlio, in order', () => {
    const notes = claimNotes(
      claim({
        route: 'detlio',
        status: 'rejected',
        garageResponse: 'disputed',
        garageNote: 'Washed properly',
        decisionReason: 'Photos agree with the garage',
      }),
      time
    );
    expect(notes.map((n) => n.text)).toEqual([
      'You disputed it: “Washed properly”',
      'Detlio: “Photos agree with the garage”',
    ]);
  });
  test('timed out, refund, redo booked (primary) and redo to pick', () => {
    expect(claimNotes(claim({ garageResponse: 'timed_out' }), time)[0]?.text).toContain('no answer in time');
    expect(claimNotes(claim({ status: 'refund_approved' }), time)[0]?.text).toContain('refund instead of a redo');
    const booked = claimNotes(claim({ redoBooking: { id: 'r', scheduledAt: '2026-11-03T05:00:00.000Z', status: 'confirmed' } }), time);
    expect(booked[0]).toEqual({
      text: 'Free redo booked for T(2026-11-03T05:00:00.000Z) — it is on your Bookings page.',
      primary: true,
    });
    const pick = claimNotes(claim({ status: 'redo_approved', redoBookBy: '2026-11-08T05:00:00.000Z' }), time);
    expect(pick[0]?.text).toBe('The customer picks a free redo time by T(2026-11-08T05:00:00.000Z).');
  });
  test('redo approved without a deadline says nothing about picking', () => {
    expect(claimNotes(claim({ status: 'redo_approved' }), time)).toEqual([]);
  });
});

describe('garage photos', () => {
  const photos = [
    photo({ id: '1', stage: 'before' }),
    photo({ id: '2', stage: 'after' }),
    photo({ id: '3', stage: 'before', by: 'customer' }),
  ];
  test('only the garage’s own, by stage', () => {
    const { before, after } = garageStages(photos);
    expect(before.map((p) => p.id)).toEqual(['1']);
    expect(after.map((p) => p.id)).toEqual(['2']);
  });
  test('a job with only the customer’s photos has none from the garage', () => {
    expect(hasGaragePhotos([photo({ by: 'customer' })])).toBe(false);
    expect(hasGaragePhotos(photos)).toBe(true);
    expect(hasGaragePhotos([])).toBe(false);
  });
});
