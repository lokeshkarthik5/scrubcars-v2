import { AppError } from '../../lib/errors.js'
import { env } from '../../lib/env.js'
import { logger } from '../../lib/logger.js'
import { runInBackground } from '../../lib/background.js'
import {
  coveragePushWords,
  FREE_WASH_RULES,
  freeWashEndsAt,
  freeWashReady,
  isReachPushHour,
  launchPushWords,
  launchPushWordsNoWash,
  REFERRAL_CREDIT,
  referralCredit,
  reminderPushWords,
  showLaunchBanner,
  signupOffer,
  signupPushDue,
  signupRefusal,
  signupsToIssue,
  waitingCount,
  zoneIsLive,
  zonesToLaunch,
} from '../../lib/area-signups.js'
import { customerAreaNews } from '../../lib/push-messages.js'
import { zoneFor, zonesWithGarages } from '../../lib/zones.js'
import { bookingRequestsService, type CustomerRequestView } from '../booking-requests/booking-requests.service.js'
import { pushService } from '../push/push.service.js'
import { areaSignupsRepository, type ZoneRecord } from './area-signups.repository.js'
import type { RecommendInput, SignUpInput } from './area-signups.validation.js'

const log = logger.child({ module: 'area-signups' })

const DAY_MS = 24 * 60 * 60 * 1000
/** Sign-ups looked at for a message each run. */
const MESSAGE_BATCH = 50
/** Recommendations looked at for their credit each run. */
const REFERRAL_BATCH = 20
/** Home's launch banner is news for this long after the launch, at most. */
const BANNER_DAYS = 30
/** A request that ended stays on Home this long, with what to do next. */
const ENDED_REQUEST_DAYS = 2

/** One of the customer's area sign-ups, as Home and the list read it. */
export interface SignupView {
  zone: { slug: string; name: string }
  live: boolean
  position: number
  /** Among the zone's first 50: a free wash on launch day. */
  freeWash: boolean
  /** "N waiting here" from 10 sign-ups; null below (honest counts). */
  waiting: number | null
  /** The free wash issued and unused, before it ends. */
  freeWashReady: { code: string; amount: number; endsAt: string } | null
  /** Home's launch banner, once. */
  launchBanner: { garages: number } | null
  createdAt: string
}

export interface AreaStatus {
  requests: CustomerRequestView[]
  signups: SignupView[]
}

async function listedPins() {
  return areaSignupsRepository.listListedGaragePins()
}

/** Listed garages whose pin is in each zone, by slug. */
function garagesByZone(zones: readonly ZoneRecord[], pins: ReadonlyArray<{ lat: number; lng: number }>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const pin of pins) {
    const zone = zoneFor(pin, zones)
    if (zone) counts.set(zone.slug, (counts.get(zone.slug) ?? 0) + 1)
  }
  return counts
}

export const areaSignupsService = {
  /**
   * "Save my free wash": the customer's name on their area's list, once per
   * area. Refused while the area has a garage (409 AREA_LIVE: they can book
   * now) or when they are on its list (409 ALREADY_SIGNED_UP). The first 50
   * of an area get the free wash; the answer says which.
   */
  async signUp(userId: string, input: SignUpInput, now = new Date()) {
    const zone = await areaSignupsRepository.findZoneBySlug(input.zoneSlug)
    if (!zone) throw new AppError(404, 'Area not found', 'AREA_NOT_FOUND')
    const zones = await areaSignupsRepository.listZones()
    const hasGarage = zonesWithGarages(zones, await listedPins()).has(zone.slug)
    const live = zoneIsLive(zone, hasGarage)
    const refused = signupRefusal({ zoneLive: live, alreadySignedUp: false })
    if (refused) throw new AppError(409, `Detlio is already in ${zone.name}. Book a garage there now.`, 'AREA_LIVE')

    const row = await areaSignupsRepository.signUp({
      userId,
      zoneId: zone.id,
      pushOptIn: input.pushOptIn,
      whatsappOptIn: input.whatsappOptIn,
      now,
      freeWashFor: (position) => signupOffer(position).freeWash,
    })
    if (row === 'live') throw new AppError(409, `Detlio is already in ${zone.name}. Book a garage there now.`, 'AREA_LIVE')
    if (!row) throw new AppError(409, `You're already on the list for ${zone.name}.`, 'ALREADY_SIGNED_UP')
    log.info({ userId, zone: zone.slug, position: row.position, freeWash: row.freeWash }, 'area_signup:created')

    // A doorstep or pickup garage already reaching the area is not news later.
    runInBackground('area_signup:coverage', async () => {
      if (await areaSignupsRepository.garageReaching({ lat: zone.lat, lng: zone.lng })) {
        await areaSignupsRepository.markCoverageKnown(row.id, now)
      }
    })

    const counts = await areaSignupsRepository.countsByZone()
    return {
      zone: { slug: zone.slug, name: zone.name },
      position: row.position,
      freeWash: row.freeWash,
      waiting: waitingCount(counts.get(zone.id) ?? row.position),
    }
  },

  /** Home's launch banner, seen (or closed): it does not come back. */
  async bannerSeen(userId: string, zoneSlug: string, now = new Date()) {
    const zone = await areaSignupsRepository.findZoneBySlug(zoneSlug)
    if (!zone) throw new AppError(404, 'Area not found', 'AREA_NOT_FOUND')
    await areaSignupsRepository.markBannerSeen(userId, zone.id, now)
    return { seen: true }
  },

  /** Leave a zone's free-wash list, and its messages (0066). */
  async leave(userId: string, zoneSlug: string) {
    const zone = await areaSignupsRepository.findZoneBySlug(zoneSlug)
    if (!zone) throw new AppError(404, 'Area not found', 'AREA_NOT_FOUND')
    const left = await areaSignupsRepository.deleteSignup(userId, zone.id)
    if (!left) throw new AppError(404, "You're not on this area's list.", 'SIGNUP_NOT_FOUND')
    log.info({ userId, zone: zone.slug }, 'area:left')
    return { left: true }
  },

  /** "Know a good garage here?": a lead for the team. */
  async recommend(userId: string, input: RecommendInput) {
    const zone = input.zoneSlug ? await areaSignupsRepository.findZoneBySlug(input.zoneSlug) : null
    if (input.zoneSlug && !zone) throw new AppError(404, 'Area not found', 'AREA_NOT_FOUND')
    const [row] = await areaSignupsRepository.insertRecommendation({
      userId,
      zoneId: zone?.id ?? null,
      name: input.name,
      mapsLink: input.mapsLink ?? null,
      phone: input.phone ?? null,
      why: input.why?.trim() ? input.why.trim() : null,
    })
    log.info({ userId, recommendationId: row!.id, zone: zone?.slug ?? null }, 'garage_recommendation:created')
    return {
      id: row!.id,
      credit: { perGarage: REFERRAL_CREDIT.perGarageRupees, max: REFERRAL_CREDIT.maxPerCustomerRupees },
    }
  },

  /**
   * Home's live status: open requests (and ones that ended in the last two
   * days, with what to do next), and the customer's area sign-ups with
   * whether their area is live, their free wash and the launch banner.
   */
  async status(userId: string, now = new Date()): Promise<AreaStatus> {
    const requests = (await bookingRequestsService.listForCustomer(userId, now)).filter(
      (view) =>
        view.state === 'waiting' ||
        view.state === 'accepted' ||
        ((view.state === 'no_garage' || view.state === 'lapsed') &&
          now.getTime() - Date.parse(view.createdAt) < ENDED_REQUEST_DAYS * DAY_MS)
    )
    const rows = await areaSignupsRepository.listForCustomer(userId)
    if (rows.length === 0) return { requests, signups: [] }

    const [zones, pins, counts] = [
      await areaSignupsRepository.listZones(),
      await listedPins(),
      await areaSignupsRepository.countsByZone(),
    ]
    const withGarages = garagesByZone(zones, pins)
    const discountIds = rows.map((r) => r.signup.discountId).filter((id): id is string => id !== null)
    const discounts = discountIds.length > 0 ? await areaSignupsRepository.unusedDiscounts(discountIds) : []
    const byId = new Map(discounts.map((d) => [d.id, d]))

    const signups = rows.map(({ signup, zone }): SignupView => {
      const live = zone.liveAt !== null
      const discount = signup.discountId ? byId.get(signup.discountId) : undefined
      const ready =
        discount && discount.endsAt && freeWashReady({ ...discount, held: Number(discount.held) }, now)
          ? { code: discount.code, amount: Number(discount.amountOff), endsAt: discount.endsAt.toISOString() }
          : null
      const recentLaunch = zone.liveAt !== null && now.getTime() - zone.liveAt.getTime() < BANNER_DAYS * DAY_MS
      return {
        zone: { slug: zone.slug, name: zone.name },
        live,
        position: signup.position,
        freeWash: signup.freeWash,
        waiting: waitingCount(counts.get(zone.id) ?? 0),
        freeWashReady: ready,
        launchBanner:
          recentLaunch && showLaunchBanner(signup, live) ? { garages: Math.max(1, withGarages.get(zone.slug) ?? 0) } : null,
        createdAt: signup.createdAt.toISOString(),
      }
    })
    return { requests, signups }
  },

  /**
   * Launch day, for every zone that has a listed garage and no `live_at`:
   * set once, free washes issued to its first 50 in the same transaction.
   * Idempotent: a zone already live is never touched again. Run by the cron
   * and, after a change that can list a garage, in the background.
   */
  async launchDueZones(now = new Date()): Promise<{ launched: string[]; issued: number }> {
    const zones = await areaSignupsRepository.listZones()
    const due = zonesToLaunch(zones, zonesWithGarages(zones, await listedPins()))
    const launched: string[] = []
    let issued = 0
    for (const zone of due) {
      const result = await areaSignupsRepository.launchZone({
        zoneId: zone.id,
        now,
        endsAt: freeWashEndsAt(now),
        pick: (signups) => signupsToIssue(signups),
      })
      if (!result) continue
      launched.push(zone.slug)
      issued += result.issued
      log.info({ zone: zone.slug, issued: result.issued }, 'area:zone_live')
    }
    return { launched, issued }
  },

  /** After a change that may have listed a garage: launch any zone now due, after the response. */
  launchSoon() {
    runInBackground('area:launch_check', () => areaSignupsService.launchDueZones())
  },

  /**
   * The cron's part (pending-digest, every 10 minutes): launch due zones;
   * then, from 09:00 to 20:59 IST, each sign-up's one due message (launch,
   * a garage that now reaches the area, or the one 14-day reminder), claimed
   * before it is sent; then recommendation credits.
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    if (options.dryRun) return { dryRun: true as const }
    const launch = await areaSignupsService.launchDueZones(now)
    const messages = { launch: 0, coverage: 0, reminder: 0, skipped: 0 }

    if (isReachPushHour(now)) {
      const [zones, pins] = [await areaSignupsRepository.listZones(), await listedPins()]
      const garages = garagesByZone(zones, pins)
      // Measured once per zone that still has someone to tell, before the
      // batch is read, so the batch holds only sign-ups due a message.
      const reaching = new Map<string, Awaited<ReturnType<typeof areaSignupsRepository.garageReaching>>>()
      for (const zone of await areaSignupsRepository.listZonesAwaitingCoverage()) {
        const reacher = await areaSignupsRepository.garageReaching({ lat: zone.lat, lng: zone.lng })
        if (reacher) reaching.set(zone.id, reacher)
      }
      const candidates = await areaSignupsRepository.listMessageCandidates({
        limit: MESSAGE_BATCH,
        reachedZoneIds: [...reaching.keys()],
        remindBefore: new Date(now.getTime() - FREE_WASH_RULES.reminderAfterDays * DAY_MS),
      })
      for (const { signup, zone } of candidates) {
        try {
          const live = zone.liveAt !== null
          const reacher = live ? null : (reaching.get(zone.id) ?? null)
          const due = signupPushDue(signup, { zoneLive: live, coveredNow: reacher !== null }, now)
          if (!due || !(await areaSignupsRepository.claimMessage(signup.id, due, now))) continue
          // Claimed either way, so it is settled; sent only to a customer who
          // asked for app notifications on the sign-up sheet.
          if (!signup.pushOptIn) {
            messages.skipped++
            continue
          }
          const count = Math.max(1, garages.get(zone.slug) ?? 0)
          const words =
            due === 'launch'
              ? signup.discountId
                ? launchPushWords(zone.name, count)
                : launchPushWordsNoWash(zone.name, count)
              : due === 'coverage'
                ? coveragePushWords(zone.name, reacher!.name, reacher!.mode)
                : reminderPushWords(zone.name)
          pushService.notifyCustomer(signup.userId, customerAreaNews(due, signup.id, words))
          messages[due]++
        } catch (err) {
          log.error({ err, signupId: signup.id }, 'area:message_failed')
        }
      }
    }

    const referrals = await areaSignupsService.sweepReferrals(now)
    return { launched: launch.launched.length, issued: launch.issued, messages, referrals }
  },

  /**
   * Recommendation credits: a recommendation the team linked to a garage,
   * once that garage is live and the customer completed a paid booking
   * there (lib/area-signups.ts referralCredit; once per garage, ₹500 at
   * most). Granted while gift credit is on (GIFTS_ENABLED), else owed and
   * granted by a later run once it is.
   */
  async sweepReferrals(now = new Date()) {
    const out = { granted: 0, owed: 0 }
    const candidates = await areaSignupsRepository.listCreditCandidates(REFERRAL_BATCH, env.giftsEnabled)
    for (const rec of candidates) {
      if (!rec.userId || !rec.vendorId) continue
      if (rec.creditStatus === 'owed' && !env.giftsEnabled) continue
      try {
        const live = await areaSignupsRepository.garageListed(rec.vendorId)
        const bookingId = await areaSignupsRepository.firstPaidCompletedBooking(rec.userId, rec.vendorId, rec.createdAt)
        if (rec.creditStatus === null && (!live || !bookingId)) {
          // Checked: to the back of the queue, so the batch goes round them all.
          await areaSignupsRepository.touchRecommendation(rec.id, now)
          continue
        }
        const result = await areaSignupsRepository.creditRecommendation({
          id: rec.id,
          userId: rec.userId,
          vendorId: rec.vendorId,
          bookingId: bookingId ?? rec.creditBookingId!,
          creditOn: env.giftsEnabled,
          now,
          reason: 'Credit for a garage you recommended',
          decide: (facts) => {
            const decision = referralCredit({
              vendorId: rec.vendorId,
              garageLive: live,
              completedPaidBooking: bookingId !== null,
              alreadyCreditedForGarage: facts.alreadyForGarage,
              creditedSoFarRupees: facts.creditedSoFarRupees,
            })
            return 'amountRupees' in decision ? decision.amountRupees : null
          },
        })
        if (result?.creditStatus === 'granted') out.granted++
        else if (result?.creditStatus === 'owed') out.owed++
        else await areaSignupsRepository.touchRecommendation(rec.id, now)
      } catch (err) {
        log.error({ err, recommendationId: rec.id }, 'area:referral_failed')
      }
    }
    return out
  },
}
