import { z } from 'zod'
import { signedActorName } from '../../lib/admin-actor.js'
import { MAX_TICKED_IDS } from '../../lib/data-reset.js'

/**
 * Which bookings a run is about (see ResetScope in lib/data-reset.ts). The
 * cutoff is an instant with its offset, as the admin page sends the IST time
 * the owner picked ("2026-10-01T09:00:00+05:30").
 */
const scopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('before_cutoff'),
    cutoff: z.string().datetime({ offset: true }),
  }),
  z.object({ kind: z.literal('marked_test') }),
  // One booking from its page. A few, at most: this is not the bulk path.
  z.object({
    kind: z.literal('chains'),
    bookingIds: z.array(z.string().uuid()).min(1).max(20),
  }),
])

/**
 * The dry run.
 *
 * `only` is the ticked rows once the owner has reviewed the list; without
 * it every deletable row in scope is ticked (complaints made before a cutoff
 * included; with it, those only when `complaints` is true). More ticked than one run takes
 * is not refused: the planner takes the oldest up to its cap and reports
 * the rest (`overCap`), so the owner can run it again for them. `unknownIds` are the Razorpay
 * ids an earlier call of the same dry run could not get an answer for: they
 * stay unknown (kept) and are not asked about again, so the checking moves on.
 */
export const previewSchema = z.object({
  scope: scopeSchema,
  only: z
    .object({
      chainIds: z.array(z.string().uuid()).max(MAX_TICKED_IDS),
      checkoutIds: z.array(z.string().uuid()).max(MAX_TICKED_IDS),
      // The one tick for every complaint made before the cutoff. Left out is
      // unticked, so a request from before complaints existed deletes none.
      complaints: z.boolean().optional(),
      // The one tick for every usage event recorded before the cutoff, like
      // complaints. Left out is unticked.
      analytics: z.boolean().optional(),
    })
    .optional(),
  unknownIds: z.array(z.string().max(64)).max(5000).default([]),
})

/**
 * The delete: the same request as the dry run it follows, its fingerprint,
 * and the three things the person confirms. The typed phrase is checked
 * against the plan in the service, where the plan is.
 */
export const executeSchema = previewSchema.extend({
  selectionHash: z.string().regex(/^[0-9a-f]{64}$/, 'Run the dry run first'),
  confirmText: z.string().max(100),
  actorName: signedActorName,
  // Said out loud, not inferred: nothing here can check a backup exists.
  backupConfirmed: z.literal(true, {
    error: 'Confirm you have a database backup from today',
  }),
})

export type PreviewInput = z.infer<typeof previewSchema>
export type ExecuteInput = z.infer<typeof executeSchema>

// ─── Delete one test booking, from its page (0064) ───────────────────────────
//
// Not behind ADMIN_DATA_RESET (owner, 28 Oct 2026: "a per-booking delete for
// bookings marked Test"): the booking's chain only, and only when it is
// marked Test with no real money on it, which the planner decides. No backup
// tick: it is one test booking, and the audit row keeps every id.

export const testBookingParamSchema = z.object({ id: z.string().uuid() })

/** The dry run for the booking's chain. */
export const testBookingPreviewSchema = z
  .object({ unknownIds: z.array(z.string().max(64)).max(5000).default([]) })
  .strict()

/** The delete: the dry run's fingerprint and the typed phrase. */
export const testBookingDeleteSchema = z
  .object({
    unknownIds: z.array(z.string().max(64)).max(5000).default([]),
    selectionHash: z.string().regex(/^[0-9a-f]{64}$/, 'Run the dry run first'),
    confirmText: z.string().max(100),
    actorName: signedActorName,
  })
  .strict()

export type TestBookingPreviewInput = z.infer<typeof testBookingPreviewSchema>
export type TestBookingDeleteInput = z.infer<typeof testBookingDeleteSchema>
