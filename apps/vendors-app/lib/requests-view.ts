import type { GarageRequest } from '@repo/core/api/booking-requests';
import { istClock, REQUEST_RULES } from '@repo/core/booking-requests';
import { formatINR } from '@repo/core/format';
import { interpolate, msg, t } from '@repo/core/i18n/translate';
import { acceptedLine as feeAcceptedLine, requestTag } from '@repo/core/pickup-fee-garage';

/**
 * The words and the geometry of the visit requests inbox: the parts of
 * apps/vendors/app/requests/page.tsx that are not drawing. Pure, so they can
 * be tested. The constants stay English (msg) for the screen's t(); the lines built
 * here come out in the language in use.
 */

const INTRO = msg(
  'Customers just outside your area ask you to come. Nothing is paid until you say yes. Answer within {hours} hours, or we ask the next garage.'
);
const INTRO_VARS = { hours: REQUEST_RULES.respondMinutes / 60 };
/** The English; the screen shows requestsIntro(). */
export const REQUESTS_INTRO = interpolate(INTRO, INTRO_VARS);
export const requestsIntro = () => t(INTRO, INTRO_VARS);

export const REQUESTS_FOOTER = msg('Saying yes often earns you more requests from this area.');
export const EMPTY_TITLE = msg('No requests right now');
export const EMPTY_SUBTITLE = msg('Customers just outside your area can ask you to come. Their requests show here.');
export const WITHDRAW_BODY = msg(
  "The customer hasn't paid yet. We tell them you can no longer come, and they can ask again."
);
export const WITHDRAWN_TOAST = msg('Withdrawn. We told the customer.');
export const DECLINE_FAILED = msg('Could not answer. Please try again.');
export const ACCEPT_FAILED = msg('Could not accept. Please try again.');
export const WITHDRAW_FAILED = msg('Could not withdraw it');

/** The car type as the garage prices it. */
const CAR_TYPE: Record<string, string> = {
  hatchback: msg('Hatchback'),
  sedan: msg('Sedan'),
  suv: msg('SUV'),
};

/** How a closed request ended, in a word. */
const CLOSED_WORD: Record<string, string> = {
  converted: msg('Booked'),
  forwarded: msg('Passed on'),
  declined: msg('Declined'),
  expired: msg('Expired'),
  cancelled: msg('Cancelled'),
};

type Services = Pick<GarageRequest, 'items' | 'vehicleType'>;

/** "Premium Car Wash + Interior Clean · Sedan". */
export function servicesLine(request: Services): string {
  const car = CAR_TYPE[request.vehicleType];
  return `${request.items.map((item) => item.name).join(' + ')} · ${car ? t(car) : request.vehicleType}`;
}

/** "Tomorrow 9–12 · Velachery". */
export function whenWhereLine(request: Pick<GarageRequest, 'window' | 'area'>): string {
  return request.area ? `${request.window.label} · ${request.area}` : request.window.label;
}

/** The small caps label on a waiting card. */
export const waitingLabel = (request: Pick<GarageRequest, 'passedOn'> & { bookingType?: GarageRequest['bookingType'] }) =>
  requestTag(request.bookingType ?? 'doorstep', request.passedOn);

/** "Start time, inside tomorrow 9–12". */
export const startTimeHeading = (request: Pick<GarageRequest, 'window'>) =>
  t('Start time, inside {window}', { window: request.window.label.toLowerCase() });

/** The outcome badge on a closed card. */
export function closedBadge(request: Pick<GarageRequest, 'status' | 'withdrawn'>): {
  label: string;
  variant: 'success' | 'muted';
} {
  return {
    label: request.withdrawn ? t('Withdrawn') : CLOSED_WORD[request.status] ? t(CLOSED_WORD[request.status]!) : request.status,
    variant: request.status === 'converted' ? 'success' : 'muted',
  };
}

/** The accepted card's line: "Accepted · starts Sat 17 Oct, 10:00 am · travel fee ₹100 · customer confirms by 11:41 am". */
export function acceptedLine(
  request: Pick<GarageRequest, 'acceptedStartAt' | 'travelFee' | 'confirmBy'> & { bookingType?: GarageRequest['bookingType'] },
  startLabel: (iso: string) => string
): string {
  const starts = request.acceptedStartAt ? startLabel(request.acceptedStartAt) : '—';
  const by = request.confirmBy ? istClock(request.confirmBy) : '—';
  // Ask for pickup (0079): "… · pickup fee ₹180 · …", the portal's words.
  if (request.bookingType === 'pickup') {
    return feeAcceptedLine({ mode: 'pickup', start: starts, fee: request.travelFee ?? 0, confirmBy: by });
  }
  return t('Accepted · starts {starts} · travel fee {fee} · customer confirms by {by}', {
    starts,
    fee: formatINR(request.travelFee ?? 0),
    by,
  });
}

/** The toast after Accept. */
export const acceptedToast = (confirmBy: string | null | undefined) =>
  confirmBy ? t('Accepted. The customer has until {time} to confirm.', { time: istClock(confirmBy) }) : t('Accepted.');

/** The toast after Can't. */
export const declineToast = (outcome: 'passed_on' | 'ended') =>
  outcome === 'passed_on' ? t('Passed to the next garage') : t('Request closed');

/** The start time to accept: the chosen one, only while it is still on offer. */
export function chosenStart(startAt: string | null, starts: readonly string[]): string | null {
  return startAt && starts.includes(startAt) ? startAt : null;
}

/** Whether Accept can be pressed: a start time, and for Ask for pickup the responsibility tick (0079). */
export const canAccept = (chosen: string | null, busy: boolean, termsNeeded = false, termsTicked = false) =>
  !busy && chosen !== null && (!termsNeeded || termsTicked);

/** Whether "Tick that you are responsible for the car to accept." shows. */
export const needsTermsHint = (chosen: string | null, termsNeeded: boolean, termsTicked: boolean) =>
  chosen !== null && termsNeeded && !termsTicked;

/** The responsibility the garage takes on with an Ask for pickup's yes (as when it turns pickup on). */
export const PICKUP_RESPONSIBILITY_TEXT = msg(
  'While the car is with you it is your responsibility: from the moment you collect it until it is back with the customer. When you collect it, ask the customer for their 4-digit pickup code; when you bring it back, their delivery code.'
);

/** Whether "Pick a start time to accept." shows. */
export const needsStartHint = (chosen: string | null, startCount: number) => chosen === null && startCount > 0;

export interface ReachGeometry {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** The reach circle's radius, in sketch units. */
  r: number;
  /** Where the customer's dot is on the x axis. */
  dot: number;
  youLabel: string;
  label: string;
}

/**
 * The reach sketch: the garage at the centre of its reach and the customer as a dot
 * at their distance, to scale. The numbers are the web's (ReachSketch in
 * apps/vendors/app/requests/page.tsx), a 300 x 96 canvas.
 */
export function reachGeometry(input: {
  coverKm: number | null;
  distanceKm: number;
  outsideKm: number;
}): ReachGeometry {
  const { coverKm, distanceKm, outsideKm } = input;
  const width = 300;
  const height = 96;
  const cx = 40;
  const cy = height / 2;
  // The cover radius in km: the stated one, or (a drawn area) the distance
  // less how far outside it the customer is.
  const cover = Math.max(0.5, coverKm ?? distanceKm - outsideKm);
  const scale = (width - cx - 24) / Math.max(distanceKm, cover);
  return {
    width,
    height,
    cx,
    cy,
    r: Math.max(10, cover * scale),
    dot: cx + distanceKm * scale,
    youLabel: t('you · {reach}', { reach: coverKm === null ? t('area') : `${coverKm} km` }),
    label: t('Your reach {reach}, the customer {km} km from you', {
      reach: coverKm === null ? t('(your area)') : `${coverKm} km`,
      km: distanceKm,
    }),
  };
}
