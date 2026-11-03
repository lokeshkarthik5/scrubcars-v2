import { addOnLinesOf, jobSummary, serviceLinesOf } from '@repo/core/add-ons';
import type { Booking } from '@repo/core/types';

import { servicesLine } from './jobs';

/**
 * The garage's words for a booking that has add-ons (0068), the twin of the web's
 * apps/vendors/lib/jobs.ts after PR #107. That file is re-exported by ./jobs and is not the
 * app's to edit, so these two live here; the rules (serviceLinesOf, jobSummary) are core's.
 */

/**
 * The services alone, where each add-on gets its own marked line below (JobAddOnLines): the new
 * booking card and the job's page.
 */
export function serviceOnlyLine(b: Booking): string {
  const items = serviceLinesOf(b.items);
  return servicesLine({ ...b, items, serviceSummary: jobSummary(items) || b.serviceSummary });
}

/**
 * One line for a list row. With add-ons, the server's "Foam wash + 2 add-ons": one line, where a
 * join of up to two names would read an add-on as a service.
 */
export function listServicesLine(b: Booking): string {
  if (b.items.length > 0 && b.items.length <= 2 && !b.items.some((item) => item.isAddon)) {
    return b.items.map((item) => item.name).join(' + ');
  }
  return b.serviceSummary;
}

/** The add-on lines of a booking, in their order. */
export const addOnsOf = (b: Pick<Booking, 'items'>) => addOnLinesOf(b.items);
