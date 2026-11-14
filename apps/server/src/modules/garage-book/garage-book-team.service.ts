import { AppError } from '../../lib/errors.js'
import { GARAGE_BOOK_2_LIMITS, dayBounds, istMonth, monthBounds, nextMonth, parseJobRef } from '../../lib/garage-book.js'
import { istDateKey } from '../../lib/ist.js'
import { expensesService } from './garage-book-expenses.service.js'
import { teamRepository as repo, type JobTarget } from './garage-book-team.repository.js'
import type { CreateMemberInput, UpdateMemberInput } from './garage-book.validation.js'
import { carLabel, isOwner, money, normalisePhone, notFound, type Viewer } from './garage-book.viewer.js'

/**
 * The team (0074; owner decision 12 Nov: names only, no login). Every seat
 * sees the list and who is on what, and picks "who did it" when a job is
 * finished; only the owner sees what each person's work came to and what
 * they were paid, and only the owner adds or removes people.
 */

/**
 * A job by the apps' ref ("own:<id>", "detlio:<id>" or a bare id), once it
 * is known to be this garage's: a walk-in, or a Detlio booking in its book.
 * Anything else is not found, whoever's it is.
 */
export async function resolveJobRef(vendorId: string, refText: string): Promise<JobTarget> {
  const ref = parseJobRef(refText)
  if (!ref) notFound('Job')
  if (ref.kind !== 'detlio' && (await repo.ownJobExists(vendorId, ref.id))) return { kind: 'own', id: ref.id }
  if (ref.kind !== 'own' && (await repo.detlioBookingExists(vendorId, ref.id))) return { kind: 'detlio', id: ref.id }
  notFound('Job')
}

export function targetRef(target: JobTarget): string {
  return `${target.kind}:${target.id}`
}

export const teamService = {
  async team(viewer: Viewer, month: string | undefined, now = new Date()) {
    const key = month ?? istMonth(now)
    const bounds = monthBounds(key)
    if (!bounds) throw new AppError(400, 'A month as YYYY-MM', 'INVALID_MONTH')
    const today = istDateKey(now)
    const day = dayBounds(today)
    // Salaries set to repeat every month are copied in first, so a person's card shows them.
    if (isOwner(viewer)) await expensesService.ensureRepeats(viewer.vendorId, key, now)
    const [members, work, todayJobs, onNow, pay] = [
      await repo.members(viewer.vendorId),
      await repo.work(viewer.vendorId, bounds.start, bounds.end),
      await repo.jobsBetween(viewer.vendorId, day.start, day.end),
      await repo.onNow(viewer.vendorId),
      isOwner(viewer) ? await repo.pay(viewer.vendorId, `${key}-01`, `${nextMonth(key)}-01`) : new Map(),
    ]
    const list = members.map((member) => {
      const done = work.get(member.id)
      const now_ = onNow.get(member.id)
      const paid = pay.get(member.id)
      return {
        id: member.id,
        name: member.name,
        role: member.role,
        phone: member.phone,
        offToday: member.offOn === today,
        jobs: done?.jobs ?? 0,
        jobsToday: todayJobs.get(member.id) ?? 0,
        onNow: now_
          ? { ref: now_.ref, plate: now_.plate, car: carLabel(now_), service: now_.service }
          : null,
        valuePaise: money(viewer, done?.valuePaise ?? 0),
        advancePaise: money(viewer, paid?.advancePaise ?? 0),
        salaryPaise: money(viewer, paid?.salaryPaise ?? 0),
      }
    })
    return {
      month: key,
      members: list,
      // "4 at work": everyone who isn't off today.
      atWork: list.filter((member) => !member.offToday).length,
      jobsTodayTotal: list.reduce((sum, member) => sum + member.jobsToday, 0),
    }
  },

  async createMember(viewer: Viewer, input: CreateMemberInput) {
    if ((await repo.count(viewer.vendorId)) >= GARAGE_BOOK_2_LIMITS.teamMax) {
      throw new AppError(400, `A team has ${GARAGE_BOOK_2_LIMITS.teamMax} people at most.`, 'TEAM_FULL')
    }
    const row = await repo.insertMember({
      vendorId: viewer.vendorId,
      name: input.name.trim(),
      role: input.role?.trim() || null,
      phone: normalisePhone(input.phone),
    })
    return { id: row.id, name: row.name, role: row.role, phone: row.phone, offToday: false }
  },

  async updateMember(viewer: Viewer, id: string, input: UpdateMemberInput, now = new Date()) {
    const member = await repo.member(viewer.vendorId, id)
    if (!member) notFound('Team member')
    const today = istDateKey(now)
    await repo.updateMember(viewer.vendorId, id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.role !== undefined ? { role: input.role?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: normalisePhone(input.phone) } : {}),
      ...(input.offToday !== undefined ? { offOn: input.offToday ? today : null } : {}),
    })
    const after = (await repo.member(viewer.vendorId, id))!
    return { id: after.id, name: after.name, role: after.role, phone: after.phone, offToday: after.offOn === today }
  },

  /** Takes the person off the team. Jobs they did keep their name, and their pay stays in Expenses. */
  async deleteMember(viewer: Viewer, id: string) {
    const member = await repo.member(viewer.vendorId, id)
    if (!member) notFound('Team member')
    await repo.deleteMember(viewer.vendorId, id)
    return { id, deleted: true }
  },

  /**
   * "Who did it?": the people on a job, the whole set at once (an empty list
   * clears it). Any seat may say, on a walk-in or a Detlio booking.
   */
  async setWorkers(viewer: Viewer, refText: string, memberIds: string[]) {
    const target = await resolveJobRef(viewer.vendorId, refText)
    const unique = Array.from(new Set(memberIds.map((id) => id.toLowerCase())))
    const members = await repo.members(viewer.vendorId)
    const known = new Set(members.map((member) => member.id))
    if (unique.some((id) => !known.has(id))) notFound('Team member')
    await repo.transaction(async (tx) => {
      await repo.lockTarget(tx, target)
      await repo.replaceWorkers(tx, viewer.vendorId, target, unique)
    })
    const names = new Map(members.map((member) => [member.id, member.name]))
    return { ref: targetRef(target), workers: unique.map((id) => ({ id, name: names.get(id)! })) }
  },

  /** Who did each of these jobs, for Today's list: keyed "own:<id>" and "detlio:<id>". */
  workersFor(vendorId: string, jobIds: string[], bookingIds: string[]) {
    return repo.workersFor(vendorId, jobIds, bookingIds)
  },
}
