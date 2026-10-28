/**
 * How an admin "Save changes" lines up its service list with the garage's
 * rows. Pure, so the rules are unit-tested without a database
 * (service-reconcile.test.ts); adminService.updateVendor applies the plan.
 *
 * The editor round-trips the services it loaded. A tab left open can still
 * hold a service that was hidden or deleted since, so an id is never taken on
 * trust:
 *
 * - live: updated in place;
 * - hidden since: its edits are kept but it stays hidden (the later Hide wins);
 * - deleted since: the save is refused, so the deleted service can never come
 *   back as a fresh copy;
 * - no id, or an id that is not this garage's: a new service.
 */

export interface ServiceRowState {
  id: string
  isActive: boolean
  deleted: boolean
}

export interface ServiceReconcilePlan {
  /** Rows to update, with whether each stays live. */
  update: Array<{ index: number; id: string; isActive: boolean }>
  /** Payload indexes to insert as new services. */
  insert: number[]
  /** Payload ids naming a service deleted since the editor loaded. */
  deleted: string[]
  /** Live services the payload left out: hidden by this save. */
  deactivate: string[]
}

export function planServiceReconcile(
  payload: Array<{ id?: string | null }>,
  states: ServiceRowState[]
): ServiceReconcilePlan {
  const byId = new Map(states.map((s) => [s.id, s]))
  const plan: ServiceReconcilePlan = { update: [], insert: [], deleted: [], deactivate: [] }
  const kept = new Set<string>()

  payload.forEach((row, index) => {
    const state = row.id ? byId.get(row.id) : undefined
    if (!state) {
      plan.insert.push(index)
      return
    }
    if (state.deleted) {
      plan.deleted.push(state.id)
      return
    }
    // The same id twice in one payload is updated once.
    if (kept.has(state.id)) return
    kept.add(state.id)
    plan.update.push({ index, id: state.id, isActive: state.isActive })
  })

  for (const s of states) {
    if (s.isActive && !s.deleted && !kept.has(s.id)) plan.deactivate.push(s.id)
  }
  return plan
}
