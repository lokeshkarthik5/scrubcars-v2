import type { GarageRequest } from '@repo/core/api/booking-requests';
import { istClock, REQUEST_RULES } from '@repo/core/booking-requests';
import { formatINR } from '@repo/core/format';

/**
 * The words and the geometry of the visit requests inbox: the parts of
 * apps/vendors/app/requests/page.tsx that are not drawing. Pure, so they can
 * be tested.
 */

export const REQUESTS_INTRO =
  'Customers just outside your area ask you to come. Nothing is paid until you say yes. ' +
  `Answer within ${REQUEST_RULES.respondMinutes / 60} hours, or we ask the next garage.`;

export const REQUESTS_FOOTER = 'Saying yes often earns you more requests from this area.';
export const EMPTY_TITLE = 'No requests right now';
export const EMPTY_SUBTITLE = 'Customers just outside your area can ask you to come. Their requests show here.';
export const WITHDRAW_BODY =
  "The customer hasn't paid yet. We tell them you can no longer come, and they can ask again.";
export const WITHDRAWN_TOAST = 'Withdrawn. We told the customer.';
export const DECLINE_FAILED = 'Could not answer. Please try again.';
export const ACCEPT_FAILED = 'Could not accept. Please try again.';
export const WITHDRAW_FAILED = 'Could not withdraw it';

/** The car type as the garage prices it. */
const CAR_TYPE: Record<string, string> = {
  hatchback: 'Hatchback',
  sedan: 'Sedan',
  suv: 'SUV',
};

/** How a closed request ended, in a word. */
const CLOSED_WORD: Record<string, string> = {
  converted: 'Booked',
  forwarded: 'Passed on',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

type Services = Pick<GarageRequest, 'items' | 'vehicleType'>;

/** "Premium Car Wash + Interior Clean · Sedan". */
export function servicesLine(request: Services): string {
  return `${request.items.map((item) => item.name).join(' + ')} · ${CAR_TYPE[request.vehicleType] ?? request.vehicleType}`;
}

/** "Tomorrow 9–12 · Velachery". */
export function whenWhereLine(request: Pick<GarageRequest, 'window' | 'area'>): string {
  return request.area ? `${request.window.label} · ${request.area}` : request.window.label;
}

/** The small caps label on a waiting card. */
export const waitingLabel = (request: Pick<GarageRequest, 'passedOn'>) =>
  request.passedOn ? 'Passed on to you' : 'New request · outside your area';

/** "Start time, inside tomorrow 9–12". */
export const startTimeHeading = (request: Pick<GarageRequest, 'window'>) =>
  `Start time, inside ${request.window.label.toLowerCase()}`;

/** The outcome badge on a closed card. */
export function closedBadge(request: Pick<GarageRequest, 'status' | 'withdrawn'>): {
  label: string;
  variant: 'success' | 'muted';
} {
  return {
    label: request.withdrawn ? 'Withdrawn' : (CLOSED_WORD[request.status] ?? request.status),
    variant: request.status === 'converted' ? 'success' : 'muted',
  };
}

/** The accepted card's line: "Accepted · starts Sat 17 Oct, 10:00 am · travel fee ₹100 · customer confirms by 11:41 am". */
export function acceptedLine(
  request: Pick<GarageRequest, 'acceptedStartAt' | 'travelFee' | 'confirmBy'>,
  startLabel: (iso: string) => string
): string {
  const starts = request.acceptedStartAt ? startLabel(request.acceptedStartAt) : '—';
  const by = request.confirmBy ? istClock(request.confirmBy) : '—';
  return `Accepted · starts ${starts} · travel fee ${formatINR(request.travelFee ?? 0)} · customer confirms by ${by}`;
}

/** The toast after Accept. */
export const acceptedToast = (confirmBy: string | null | undefined) =>
  confirmBy ? `Accepted. The customer has until ${istClock(confirmBy)} to confirm.` : 'Accepted.';

/** The toast after Can't. */
export const declineToast = (outcome: 'passed_on' | 'ended') =>
  outcome === 'passed_on' ? 'Passed to the next garage' : 'Request closed';

/** The start time to accept: the chosen one, only while it is still on offer. */
export function chosenStart(startAt: string | null, starts: readonly string[]): string | null {
  return startAt && starts.includes(startAt) ? startAt : null;
}

/** Whether Accept can be pressed. */
export const canAccept = (chosen: string | null, busy: boolean) => !busy && chosen !== null;

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
    youLabel: `you · ${coverKm === null ? 'area' : `${coverKm} km`}`,
    label: `Your reach ${coverKm === null ? '(your area)' : `${coverKm} km`}, the customer ${distanceKm} km from you`,
  };
}
