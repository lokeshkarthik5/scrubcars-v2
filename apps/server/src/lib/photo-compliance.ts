/**
 * A garage's photo compliance (0045): of its jobs completed in the last
 * PHOTO_COMPLIANCE_DAYS, the share with at least MIN_GARAGE_PHOTOS before
 * and MIN_GARAGE_PHOTOS after photos of its own. Pure, so admin's garage
 * card and anything else that grades a garage (Detlio Certified, being built
 * in parallel) read one definition. The repository only counts photos per
 * job (adminRepository.listPhotoComplianceJobs); every decision is here.
 *
 *  - **Counted**: completed bookings, by completion time (the slot on one
 *    from before completion times were kept), not Test-marked. A completed
 *    booking is the end of its reschedule chain, so each job counts once.
 *  - **Left out**: jobs Detlio waived the photos on (a genuine case is not
 *    the garage's miss), shown separately as `waived`.
 *  - **Only the garage's photos**: the customer's own are not the garage's
 *    work.
 *  - Null `percent` when nothing is counted: no jobs is not 0%.
 */

import { MIN_GARAGE_PHOTOS } from './job-photo-standards.js'

/** The window the figure covers, ending now. */
export const PHOTO_COMPLIANCE_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/** One completed job, as the repository counts it. */
export interface PhotoComplianceJob {
  /** completed_at, or the slot for a job from before completion times. */
  finishedAt: Date
  garageBefore: number
  garageAfter: number
  waived: boolean
  markedTest: boolean
}

export interface PhotoCompliance {
  /** Jobs that count: completed in the window, not waived, not Test. */
  jobs: number
  /** Of those, the ones with both stages photographed to the standard. */
  compliant: number
  /** Completed in the window with the photos waived by Detlio. */
  waived: number
  /** Whole percent, rounded down so 99.6% never reads 100%; null with no jobs. */
  percent: number | null
}

/** The start of the window ending at `now`. */
export function photoComplianceSince(now: Date, days = PHOTO_COMPLIANCE_DAYS): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

/** Whether one job met the standard. */
export function jobMetPhotoStandard(job: Pick<PhotoComplianceJob, 'garageBefore' | 'garageAfter'>): boolean {
  return job.garageBefore >= MIN_GARAGE_PHOTOS && job.garageAfter >= MIN_GARAGE_PHOTOS
}

/** A garage's photo compliance over `days` ending at `now`. */
export function photoCompliance(
  jobs: readonly PhotoComplianceJob[],
  now: Date,
  days = PHOTO_COMPLIANCE_DAYS
): PhotoCompliance {
  const since = photoComplianceSince(now, days).getTime()
  let counted = 0
  let compliant = 0
  let waived = 0
  for (const job of jobs) {
    const at = job.finishedAt.getTime()
    if (job.markedTest || at < since || at > now.getTime()) continue
    if (job.waived) {
      waived++
      continue
    }
    counted++
    if (jobMetPhotoStandard(job)) compliant++
  }
  return {
    jobs: counted,
    compliant,
    waived,
    percent: counted === 0 ? null : Math.floor((compliant * 100) / counted),
  }
}

/** Every garage's figure from one list of jobs keyed by garage. */
export function photoComplianceByGarage(
  rows: ReadonlyArray<PhotoComplianceJob & { vendorId: string }>,
  now: Date,
  days = PHOTO_COMPLIANCE_DAYS
): Map<string, PhotoCompliance> {
  const byGarage = new Map<string, PhotoComplianceJob[]>()
  for (const row of rows) {
    const list = byGarage.get(row.vendorId) ?? []
    list.push(row)
    byGarage.set(row.vendorId, list)
  }
  return new Map([...byGarage].map(([vendorId, jobs]) => [vendorId, photoCompliance(jobs, now, days)]))
}
