import { bannedPhraseIn } from '../../lib/copy-rules.js'
import { AppError, hasPgCode } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { endNowPatch, noticeProblem, noticeState, type NoticeFields } from '../../lib/notices.js'
import { noticesRepository, type NoticeRecord } from './notices.repository.js'
import type {
  AudienceCountQuery,
  CreateNoticeInput,
  ListNoticesQuery,
  UpdateNoticeInput,
} from './notices.validation.js'
import { adminSubjectName } from '../admin-logins/admin-logins.service.js'

const log = logger.child({ module: 'notices' })


/**
 * Who wrote a notice, as a name. The shared break-glass login signs as
 * 'admin', a personal admin login (0058) with its name, a named super-admin
 * as themselves.
 */
async function resolveActorName(sub: string): Promise<string> {
  const adminName = await adminSubjectName(sub)
  if (adminName) return adminName
  const user = await noticesRepository.findUserById(sub)
  return (user?.name.trim() || user?.phone || sub).slice(0, 100)
}

type NoticeWithCounts = NoticeRecord & { vendorName: string | null; dismissals: number }

function toAdminNotice(notice: NoticeWithCounts, now: Date) {
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    linkUrl: notice.linkUrl,
    linkLabel: notice.linkLabel,
    audience: notice.audience,
    vendorId: notice.vendorId,
    vendorName: notice.vendorName,
    bookingFrom: notice.bookingFrom?.toISOString() ?? null,
    bookingTo: notice.bookingTo?.toISOString() ?? null,
    startsAt: notice.startsAt.toISOString(),
    endsAt: notice.endsAt.toISOString(),
    isActive: notice.isActive,
    state: noticeState(notice, now),
    dismissals: notice.dismissals,
    createdBy: notice.createdBy,
    createdAt: notice.createdAt.toISOString(),
    updatedAt: notice.updatedAt.toISOString(),
  }
}

const toDate = (value: string | null | undefined): Date | null => (value ? new Date(value) : null)

/**
 * The notice as it will be stored: the stored row (none on a create) with the
 * request on top. Switching the audience to everyone drops the window and the
 * garage, so that needs no second edit.
 */
function mergeNotice(stored: NoticeRecord | null, input: UpdateNoticeInput, now: Date): NoticeFields {
  const has = (key: keyof UpdateNoticeInput) => key in input && input[key] !== undefined
  const merged: NoticeFields = {
    title: input.title ?? stored?.title ?? '',
    body: input.body ?? stored?.body ?? '',
    linkUrl: 'linkUrl' in input ? (input.linkUrl || null) : (stored?.linkUrl ?? null),
    linkLabel: 'linkLabel' in input ? (input.linkLabel || null) : (stored?.linkLabel ?? null),
    audience: input.audience ?? stored?.audience ?? 'all',
    vendorId: 'vendorId' in input ? (input.vendorId ?? null) : (stored?.vendorId ?? null),
    bookingFrom: 'bookingFrom' in input ? toDate(input.bookingFrom) : (stored?.bookingFrom ?? null),
    bookingTo: 'bookingTo' in input ? toDate(input.bookingTo) : (stored?.bookingTo ?? null),
    startsAt: has('startsAt') ? new Date(input.startsAt!) : (stored?.startsAt ?? now),
    endsAt: has('endsAt') ? new Date(input.endsAt!) : (stored?.endsAt ?? now),
  }
  if (input.audience === 'all') {
    if (!('vendorId' in input)) merged.vendorId = null
    if (!('bookingFrom' in input)) merged.bookingFrom = null
    if (!('bookingTo' in input)) merged.bookingTo = null
  }
  return merged
}

async function assertSavable(merged: NoticeFields) {
  const problem = noticeProblem(merged)
  if (problem) throw new AppError(400, problem.message, 'NOTICE_INVALID')

  // The link's label is shown to customers too, as the notice's button.
  for (const text of [merged.title, merged.body, merged.linkLabel ?? '']) {
    const banned = bannedPhraseIn(text)
    if (banned) {
      throw new AppError(
        400,
        `Notices can't say "${banned}". Say plainly what is happening.`,
        'COPY_NOT_ALLOWED'
      )
    }
  }

  if (merged.vendorId && !(await noticesRepository.vendorExists(merged.vendorId))) {
    throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
  }
}

/**
 * A row 0031's CHECKs refuse. The merged-row check above runs first, so this
 * only fires if the two ever disagree; it is still the admin's input, so a
 * 400 rather than a 500.
 */
async function writeOr400<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (err) {
    if (hasPgCode(err, '23514')) {
      throw new AppError(400, "These notice settings don't fit together.", 'NOTICE_INVALID')
    }
    throw err
  }
}

async function getNoticeOr404(id: string) {
  const notice = await noticesRepository.findNotice(id)
  if (!notice) throw new AppError(404, 'Notice not found', 'NOTICE_NOT_FOUND')
  return notice
}

export const noticesService = {
  /** Every notice, optionally only the live, scheduled or ended ones. */
  async listNotices(query: ListNoticesQuery, now = new Date()) {
    const rows = await noticesRepository.listNotices()
    return rows
      .map((row) => toAdminNotice(row, now))
      .filter((row) => !query.status || row.state === query.status)
  },

  async getNotice(id: string, now = new Date()) {
    return toAdminNotice(await getNoticeOr404(id), now)
  },

  async createNotice(sub: string, input: CreateNoticeInput, now = new Date()) {
    const merged = mergeNotice(null, input, now)
    await assertSavable(merged)

    const createdBy = await resolveActorName(sub)
    const created = await writeOr400(() =>
      noticesRepository.createNotice({ ...merged, isActive: input.isActive, createdBy })
    )
    log.info({ noticeId: created.id, audience: created.audience }, 'notice:created')
    return toAdminNotice(await getNoticeOr404(created.id), now)
  },

  async updateNotice(id: string, input: UpdateNoticeInput, now = new Date()) {
    const existing = await getNoticeOr404(id)
    const merged = mergeNotice(existing, input, now)
    await assertSavable(merged)

    await writeOr400(() =>
      noticesRepository.updateNotice(id, {
        ...merged,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      })
    )
    log.info({ noticeId: id }, 'notice:updated')
    return toAdminNotice(await getNoticeOr404(id), now)
  },

  /**
   * "End now". A live notice ends at this moment; a scheduled one is
   * switched off instead (ending it before it starts would break the window
   * check). An ended one is left as it is. Notices are never deleted.
   */
  async endNotice(id: string, now = new Date()) {
    const existing = await getNoticeOr404(id)
    const patch = endNowPatch(existing, now)
    if (patch) {
      await noticesRepository.updateNotice(id, patch)
      log.info({ noticeId: id, ...('endsAt' in patch ? { ended: 'now' } : { switchedOff: true }) }, 'notice:ended')
    }
    return toAdminNotice(await getNoticeOr404(id), now)
  },

  /** How many customers a notice would reach: "Reaches 14 customers". */
  async audienceCount(query: AudienceCountQuery) {
    if (query.audience === 'all') {
      return { count: await noticesRepository.countCustomers() }
    }
    const from = new Date(query.bookingFrom!)
    const to = new Date(query.bookingTo!)
    if (to <= from) {
      throw new AppError(400, 'The booking window must end after it starts.', 'NOTICE_INVALID')
    }
    return {
      count: await noticesRepository.countCustomersWithBookingBetween({
        from,
        to,
        vendorId: query.vendorId,
      }),
    }
  },
}
