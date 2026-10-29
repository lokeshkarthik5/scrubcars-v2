import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { alertOps } from '../../lib/ops-alerts.js'
import { garageClosureRepository, type ClosureRequestRecord } from './garage-closure.repository.js'
import type { RequestClosureInput } from './garage-closure.validation.js'

const log = logger.child({ module: 'garage-closure' })

export interface ClosureRequestView {
  id: string
  status: 'open' | 'cancelled' | 'confirmed'
  reason: string
  requestedByName: string
  createdAt: string
}

function toView(row: ClosureRequestRecord): ClosureRequestView {
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    requestedByName: row.requestedByName,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Only the garage's owner (`vendors.owner_id`) asks to close it: the
 * business is theirs. Another admin seat, an operator or a Detlio support
 * session is refused.
 */
async function ownersGarage(vendorId: string, actorId: string, viaSupport: boolean) {
  const garage = await garageClosureRepository.findGarage(vendorId)
  if (!garage) throw new AppError(404, 'Vendor profile not found', 'VENDOR_NOT_FOUND')
  if (viaSupport || garage.ownerId !== actorId) {
    throw new AppError(403, "Only the garage's owner can ask to close it.", 'GARAGE_OWNER_ONLY')
  }
  return garage
}

/**
 * "Close my garage" (0066): the owner asks, with a reason; the team is told
 * on Telegram and sees it in admin; it confirms by moving the garage to the
 * Bin (vendor-bin marks the open request confirmed in the same
 * transaction). The owner can cancel it until then.
 */
export const garageClosureService = {
  async get(vendorId: string): Promise<ClosureRequestView | null> {
    const open = await garageClosureRepository.findOpen(vendorId)
    return open ? toView(open) : null
  },

  async request(vendorId: string, actorId: string, viaSupport: boolean, input: RequestClosureInput) {
    const garage = await ownersGarage(vendorId, actorId, viaSupport)
    const name = (await garageClosureRepository.userName(actorId))?.trim() || 'The owner'
    const created = await garageClosureRepository.insert({
      vendorId,
      requestedBy: actorId,
      requestedByName: name.slice(0, 255),
      reason: input.reason,
    })
    if (!created) {
      throw new AppError(409, 'You have already asked to close this garage. Detlio will call you.', 'CLOSURE_ALREADY_REQUESTED')
    }
    log.warn({ vendorId, requestId: created.id }, 'garage_closure:requested')
    alertOps({ kind: 'garage_closure_requested', vendorId, garage: garage.businessName, reason: input.reason })
    return toView(created)
  },

  async cancel(vendorId: string, actorId: string, viaSupport: boolean) {
    const garage = await ownersGarage(vendorId, actorId, viaSupport)
    const cancelled = await garageClosureRepository.cancelOpen(vendorId, new Date())
    if (!cancelled) {
      throw new AppError(
        409,
        'There is no open request to cancel: Detlio may have closed the garage already. Reload to see.',
        'CLOSURE_NOT_OPEN'
      )
    }
    log.info({ vendorId, requestId: cancelled.id }, 'garage_closure:cancelled')
    alertOps({ kind: 'garage_closure_cancelled', vendorId, garage: garage.businessName })
    return toView(cancelled)
  },

  /** Admin: every open request, oldest first. */
  async listOpen() {
    const rows = await garageClosureRepository.listOpen()
    return rows.map((row) => ({ ...toView(row.request), vendorId: row.request.vendorId, garageName: row.garageName }))
  },
}
