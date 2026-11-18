import {
  GROUP_MIN_BRANCHES,
  branchLabelOf,
  groupNameOf,
  planBranchServices,
  planPreview,
  type BranchServicesChange,
  type GroupGarage,
  type GroupService,
} from '../../lib/branch-groups.js'
import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { vendorInBin } from '../../lib/vendor-bin.js'
import { citiesService } from '../cities/cities.service.js'
import { ratingsFor } from '../reviews/reviews.service.js'
import { slotAlertsService } from '../slot-alerts/slot-alerts.service.js'
import { isListedToCustomers } from '../vendors/vendors.predicates.js'
import { branchGroupsRepository, type Tx } from './branch-groups.repository.js'

const log = logger.child({ module: 'branch-groups' })

type Actor = { sub: string; name: string }

/** A branch's state on the Branches card, in the editor's words. */
export type BranchState = 'live' | 'paused' | 'not_live'

const notFound = () => new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')

/** A garage admin may change: there, not purged, not in the Bin. */
async function writableGarage(id: string, conn?: Tx) {
  const garage = await branchGroupsRepository.findGarage(id, conn)
  if (!garage || garage.purgedAt) throw notFound()
  if (garage.deletedAt) throw vendorInBin()
  return garage
}

/** The group's branches with their plain services, as the plan reads them. */
async function groupRows(groupId: string, conn?: Tx) {
  const garages = await branchGroupsRepository.listGroupGarages(groupId, conn)
  const rows = await branchGroupsRepository.listPlainServices(
    garages.map((garage) => garage.id),
    conn
  )
  const packages = await branchGroupsRepository.listPackagesHolding(
    rows.map((row) => row.id),
    conn
  )
  const services: GroupService[] = rows.map((row) => ({
    ...row,
    packageNames: packages.filter((pkg) => pkg.serviceId === row.id).map((pkg) => pkg.name),
  }))
  return { garages: garages as GroupGarage[], services }
}

/**
 * The garages the change reaches: the group's, or this garage alone when it
 * is in none (or in a group of one). The garage itself is always among them.
 * In the save's transaction the group's garages are locked first and this
 * garage read again under the lock, so the plan is made from rows nothing
 * else (another branch save, a link or a remove) can change before it is
 * written.
 */
async function reach(vendorId: string, tx?: Tx) {
  let garage = await writableGarage(vendorId, tx)
  if (!garage.groupId) return null
  if (tx) {
    await branchGroupsRepository.lockGroup(garage.groupId, tx)
    const groupId = garage.groupId
    garage = await writableGarage(vendorId, tx)
    if (garage.groupId !== groupId) return null
  }
  if (!garage.groupId) return null
  const rows = await groupRows(garage.groupId, tx)
  if (rows.garages.length < GROUP_MIN_BRANCHES || !rows.garages.some((row) => row.id === vendorId)) return null
  return { garage, groupId: garage.groupId, ...rows }
}

function planOrThrow(vendorId: string, rows: { garages: GroupGarage[]; services: GroupService[] }, change: BranchServicesChange) {
  const plan = planBranchServices({ sourceId: vendorId, garages: rows.garages, services: rows.services, change })
  if (!plan.ok) throw new AppError(plan.status, plan.message, plan.code)
  return plan
}

const NOT_IN_GROUP = () =>
  new AppError(409, 'This garage has no other branches. Save for this branch only.', 'NOT_IN_GROUP')

export const branchGroupsService = {
  /**
   * The Branches card: the group's name and its branches out of the Bin, the
   * main one (the first made) first, each with its area, address, state and
   * rating. `group` is null for a garage in no group, or in a group of one.
   */
  async branchesOf(vendorId: string) {
    const garage = await branchGroupsRepository.findGarage(vendorId)
    if (!garage || garage.purgedAt) throw notFound()
    const group = garage.groupId ? await branchGroupsRepository.findGroup(garage.groupId) : null
    if (!group) return { group: null, branches: [] }
    const garages = await branchGroupsRepository.listGroupGarages(group.id)
    if (garages.length < GROUP_MIN_BRANCHES) return { group: null, branches: [] }
    const [ratings, rules] = [await ratingsFor(garages.map((row) => row.id)), await citiesService.rules()]
    return {
      group: { id: group.id, name: group.name, count: garages.length },
      branches: garages.map((row, index) => {
        const live = isListedToCustomers({ ...row, cityShown: rules.standingOf(row).cityShown })
        const state: BranchState = live ? 'live' : row.bookingsPausedAt ? 'paused' : 'not_live'
        const rating = ratings.get(row.id)
        return {
          id: row.id,
          businessName: row.businessName,
          label: branchLabelOf(row.businessName),
          address: row.address,
          pincode: row.pincode,
          state,
          rating: rating?.rating ?? null,
          reviewCount: rating?.reviewCount ?? 0,
          isMain: index === 0,
          isCurrent: row.id === vendorId,
          createdAt: row.createdAt.toISOString(),
        }
      }),
    }
  },

  /**
   * "Link an existing garage": the other garage joins this garage's group,
   * which is made (named after this garage's business) when it has none. A
   * garage in another group leaves it, and that group, left with one
   * garage, is undone. One transaction and one audit row.
   */
  async link(vendorId: string, otherId: string, actor: Actor) {
    if (vendorId === otherId) {
      throw new AppError(400, 'Choose another garage: this one is already here.', 'BRANCH_SELF')
    }
    const result = await branchGroupsRepository.inTransaction(async (tx) => {
      const locked = await branchGroupsRepository.lockGarages([vendorId, otherId], tx)
      const here = locked.find((row) => row.id === vendorId)
      const other = locked.find((row) => row.id === otherId)
      if (!here || here.purgedAt || !other || other.purgedAt) throw notFound()
      if (here.deletedAt || other.deletedAt) throw vendorInBin()
      if (here.groupId && here.groupId === other.groupId) {
        throw new AppError(409, `${other.businessName} is already one of these branches.`, 'ALREADY_IN_GROUP')
      }
      let groupId = here.groupId
      let groupCreated = false
      if (!groupId) {
        groupId = await branchGroupsRepository.createGroup(groupNameOf(here.businessName), tx)
        groupCreated = true
        await branchGroupsRepository.setGroup([here.id], groupId, tx)
      }
      const previousGroupId = other.groupId
      await branchGroupsRepository.setGroup([other.id], groupId, tx)
      let previousDissolved = false
      if (previousGroupId && (await branchGroupsRepository.countGroupMembers(previousGroupId, tx)) < GROUP_MIN_BRANCHES) {
        await branchGroupsRepository.dissolveGroup(previousGroupId, tx)
        previousDissolved = true
      }
      await branchGroupsRepository.insertAudit(
        {
          action: 'garage_branch_linked',
          actorSub: actor.sub,
          actorName: actor.name,
          summary: { vendorId: other.id, garage: other.businessName, groupId, toVendorId: here.id },
          detail: { groupCreated, fromGroupId: previousGroupId, previousGroupDissolved: previousDissolved },
        },
        tx
      )
      return { groupId }
    })
    log.info({ vendorId, otherId, groupId: result.groupId }, 'branch-groups:linked')
    return branchGroupsService.branchesOf(vendorId)
  },

  /**
   * "Remove from group": the garage leaves this garage's group (it may be
   * this garage itself). A group left with one garage is undone. The
   * garage keeps everything of its own; only the link goes.
   */
  async unlink(vendorId: string, otherId: string, actor: Actor) {
    await branchGroupsRepository.inTransaction(async (tx) => {
      const locked = await branchGroupsRepository.lockGarages([...new Set([vendorId, otherId])], tx)
      const here = locked.find((row) => row.id === vendorId)
      const other = locked.find((row) => row.id === otherId)
      if (!here || here.purgedAt || !other || other.purgedAt) throw notFound()
      if (here.deletedAt) throw vendorInBin()
      if (!here.groupId || other.groupId !== here.groupId) {
        throw new AppError(409, `${other.businessName} is not one of these branches.`, 'NOT_IN_GROUP')
      }
      const groupId = here.groupId
      await branchGroupsRepository.setGroup([other.id], null, tx)
      const dissolved = (await branchGroupsRepository.countGroupMembers(groupId, tx)) < GROUP_MIN_BRANCHES
      if (dissolved) await branchGroupsRepository.dissolveGroup(groupId, tx)
      await branchGroupsRepository.insertAudit(
        {
          action: 'garage_branch_unlinked',
          actorSub: actor.sub,
          actorName: actor.name,
          summary: { vendorId: other.id, garage: other.businessName, groupId, fromVendorId: here.id },
          detail: { groupDissolved: dissolved },
        },
        tx
      )
    })
    log.info({ vendorId, otherId }, 'branch-groups:unlinked')
    return branchGroupsService.branchesOf(vendorId)
  },

  /**
   * What "All N branches" would do, without doing it: per service, each
   * branch's price before and after, which were different, which branches
   * get it added, and (for a delete) which don't have it. Read from the
   * database as the save will read it, by the same rules.
   */
  async previewServices(vendorId: string, change: BranchServicesChange) {
    const rows = await reach(vendorId)
    if (!rows) throw NOT_IN_GROUP()
    return planPreview(planOrThrow(vendorId, rows, change))
  },

  /**
   * "Save for all N branches" / "Delete" at all of them: in one
   * transaction, the rows read again, the plan made again, and refused (409
   * BRANCH_PLAN_CHANGED) unless it is the one previewed; then every write
   * and one audit row. Only services and prices: nothing else of a branch
   * is touched.
   */
  async applyServices(vendorId: string, change: BranchServicesChange, key: string, actor: Actor) {
    const plan = await branchGroupsRepository.inTransaction(async (tx) => {
      const rows = await reach(vendorId, tx)
      if (!rows) throw NOT_IN_GROUP()
      const plan = planOrThrow(vendorId, rows, change)
      if (plan.key !== key) {
        throw new AppError(
          409,
          'The branches’ services changed since you looked. Check the list again, then save.',
          'BRANCH_PLAN_CHANGED'
        )
      }
      for (const update of plan.writes.updates) {
        await branchGroupsRepository.updateService(update.serviceId, update.vendorId, update.columns, tx)
      }
      await branchGroupsRepository.insertServices(
        plan.writes.inserts.map((insert) => ({
          ...insert.columns,
          vendorId: insert.vendorId,
          ...(insert.hintDismissed && { categoryHintDismissedAt: new Date() }),
        })),
        tx
      )
      await branchGroupsRepository.markServicesDeleted(plan.writes.deletes, tx)
      // "Not this" on a category hint (0080) is this garage's own, as its
      // own save keeps it: never sent to the other branches.
      if (change.kind === 'save') {
        const hints = (dismissed: boolean) =>
          change.changed.filter((edit) => edit.service.categoryHintDismissed === dismissed).map((edit) => edit.serviceId)
        await branchGroupsRepository.setHintsDismissed(hints(true), vendorId, true, tx)
        await branchGroupsRepository.setHintsDismissed(hints(false), vendorId, false, tx)
      }
      await branchGroupsRepository.insertAudit(
        {
          action: change.kind === 'delete' ? 'garage_services_deleted_all_branches' : 'garage_services_saved_all_branches',
          actorSub: actor.sub,
          actorName: actor.name,
          summary: { vendorId, groupId: rows.groupId, branches: plan.branches.length },
          detail: {
            services: plan.items.map((item) => ({
              kind: item.kind,
              name: item.name,
              previousName: item.previousName,
              branches: item.lines.map((line) => ({ vendorId: line.vendorId, action: line.action, before: line.before, after: line.after })),
            })),
            updated: plan.writes.updates.length,
            added: plan.writes.inserts.length,
            deleted: plan.writes.deletes.length,
          },
        },
        tx
      )
      return plan
    })
    // A new service or a duration may have made room at a branch (0047):
    // one background task re-checks them one after another, never a task
    // per branch reading at once down the one connection.
    slotAlertsService.garagesChanged(
      plan.branches.map((branch) => branch.id),
      'admin_garage_updated'
    )
    log.info(
      {
        vendorId,
        branches: plan.branches.length,
        updated: plan.writes.updates.length,
        added: plan.writes.inserts.length,
        deleted: plan.writes.deletes.length,
      },
      'branch-groups:services-applied'
    )
    return planPreview(plan)
  },

  // ─── Customers ─────────────────────────────────────────────────────────────

  /** The garage page's "Also at": its other live branches, by area, with their pins. */
  async liveBranchesOf(vendorId: string) {
    const rows = await branchGroupsRepository.listLiveBranches(vendorId)
    return rows.map((row) => ({ id: row.id, name: branchLabelOf(row.businessName), lat: row.lat, lng: row.lng }))
  },

  /** The cards' "1 of 3 Shine Auto Spa branches", for a page in one read; only groups with 2+ live. */
  async cardGroupsOf(vendorIds: string[]) {
    const rows = await branchGroupsRepository.listCardGroups(vendorIds)
    return new Map(
      rows
        .filter((row) => row.liveCount >= GROUP_MIN_BRANCHES)
        .map((row) => [row.vendorId, { name: row.groupName, liveCount: row.liveCount }])
    )
  },
}
