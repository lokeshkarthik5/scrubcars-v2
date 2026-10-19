import { randomUUID } from 'node:crypto'
import { isCelebrationHour } from '../../lib/achievements.js'
import { runInBackground } from '../../lib/background.js'
import { env } from '../../lib/env.js'
import { AppError } from '../../lib/errors.js'
import {
  carProblems,
  CAR_LIMITS,
  GARAGE_RARITIES,
  garageArtKey,
  garageSettings,
  garageTempPrefix,
  isGarageTempKeyFor,
  isWebp,
  MAX_ART_BYTES,
  PHOTO_SETTINGS,
  PULL_SOURCE_LABELS,
  PULL_SOURCES,
  pullsWords,
  pullWords,
  RARITY_LABELS,
  realCarNameIn,
  rowCount,
  rowOf,
  rowWords,
  seriesWords,
  type CarEdit,
  type GarageSettings,
  type PullSource,
  type SeriesStatus,
} from '../../lib/garage.js'
import { bannedPhraseIn } from '../../lib/copy-rules.js'
import { istMonthKey, maskPhone, type NudgeKind, type RewardsSettings } from '../../lib/rewards.js'
import { logger } from '../../lib/logger.js'
import { customerRewardNudge } from '../../lib/push-messages.js'
import { createPresignedPutForKey, deleteObject, keyFromPublicUrl, putObject, readObject, publicUrlForKey } from '../../lib/storage.js'
import { pushService } from '../push/push.service.js'
import { announceRewards } from '../rewards/rewards.announce.js'
import type { IssuedVoucher } from '../rewards/rewards.repository.js'
import { rewardsRepository } from '../rewards/rewards.repository.js'
import { currentSettings, rewardsLive } from '../rewards/rewards.settings.js'
import { garageRepository, garageTx, type GarageCarRow, type PullOutcome } from './garage.repository.js'

const log = logger.child({ module: 'garage' })

const DAY_MS = 24 * 60 * 60 * 1000
const CATCH_UP_LOOKBACK_MS = 2 * DAY_MS
const CATCH_UP_BATCH = 30
const TELL_LOOKBACK_MS = 3 * DAY_MS
const TELL_BATCH = 50
const SWEEP_BUDGET_MS = 8_000
const RECENT_PULLS = 30
const CSV_LIMIT = 20_000

/** The album, where every Garage push and Updates row opens. */
export const GARAGE_PAGE = '/profile/rewards/garage'


// ─── Views ───────────────────────────────────────────────────────────────────

/** A card as the customer sees it once owned: everything on it. The app finds the photo by `photoId` in its pool. */
function ownedCarView(car: GarageCarRow, seriesNumber: number, total: number, owned: { count: number; firstPulledAt: Date | null }) {
  return {
    id: car.id,
    number: car.number,
    total,
    series: seriesNumber,
    owned: true as const,
    rarity: car.rarity,
    rarityLabel: RARITY_LABELS[car.rarity],
    name: car.name,
    photoId: car.photoId,
    colour: car.colour,
    setting: car.setting,
    lore: car.lore,
    art: { source: car.artSource, url: car.artUrl },
    count: owned.count,
    firstPulledAt: owned.firstPulledAt?.toISOString() ?? null,
  }
}

/**
 * A card not collected yet: its number, rarity and photo id only (the app
 * shows that photo blurred and darkened, never the card's name, words or
 * uploaded art).
 */
function missingCarView(car: GarageCarRow, seriesNumber: number, total: number) {
  return { id: null, number: car.number, total, series: seriesNumber, owned: false as const, rarity: car.rarity, rarityLabel: RARITY_LABELS[car.rarity], photoId: car.photoId }
}

export type OwnedCarView = ReturnType<typeof ownedCarView>
export type MissingCarView = ReturnType<typeof missingCarView>

type PullRow = Awaited<ReturnType<typeof garageRepository.recentPulls>>[number]

/** A card the customer got: the car in full, where it came from, and what it finished. */
function pullView(r: PullRow) {
  return {
    id: r.id,
    pulledAt: r.pulledAt.toISOString(),
    seen: r.seenAt !== null,
    source: r.source,
    sourceLabel: PULL_SOURCE_LABELS[r.source],
    duplicate: r.wasDuplicate,
    rootBookingId: r.rootBookingId,
    bookingId: r.bookingId,
    rowCompleted: r.rowCompleted,
    seriesCompleted: r.seriesCompleted,
    car: ownedCarView(r.car, r.seriesNumber, r.seriesTotal, { count: r.count, firstPulledAt: null }),
  }
}

export type PullView = ReturnType<typeof pullView>

function adminCarView(car: GarageCarRow, figures: { pulls: number; owners: number } | undefined) {
  return {
    ...car,
    updatedAt: car.updatedAt.toISOString(),
    artUpdatedAt: car.artUpdatedAt?.toISOString() ?? null,
    pulls: figures?.pulls ?? 0,
    owners: figures?.owners ?? 0,
  }
}

// ─── Telling the customer ────────────────────────────────────────────────────

type Telling = { userId: string; kind: NudgeKind; subjectKey: string; title: string; body: string; url: string }

function claim(input: Telling, now: Date, settings: RewardsSettings): Promise<boolean> {
  return rewardsRepository.claimNudge({
    userId: input.userId,
    kind: input.kind,
    subjectKey: input.subjectKey,
    title: input.title.slice(0, 120),
    body: input.body.slice(0, 200),
    linkUrl: input.url,
    now,
    gapDays: settings.nudgeGapDays,
  })
}

async function push(input: Telling) {
  await pushService.sendNow(
    { audience: 'customer', userId: input.userId },
    customerRewardNudge({ kind: input.kind, subjectKey: input.subjectKey, words: { title: input.title, body: input.body, url: input.url } })
  )
}

/**
 * New cars, finished rows and a finished series: each claimed once as a
 * Garage nudge (its Updates row; celebrations never wait for, nor use up,
 * the nudge gap), then pushed: one push for the cars however many came at
 * once, one per row, one for the series.
 */
async function tellPulls(outcomes: PullOutcome[], now: Date, settings: RewardsSettings): Promise<number> {
  let told = 0
  const byUser = new Map<string, PullOutcome[]>()
  for (const o of outcomes) byUser.set(o.userId, [...(byUser.get(o.userId) ?? []), o])
  for (const [userId, list] of byUser) {
    const cars: Telling[] = []
    for (const o of list) {
      const words = pullWords(o.pull, o.pull.duplicate)
      const telling: Telling = { userId, kind: 'garage_card', subjectKey: `garage_pull:${o.pull.id}`, ...words, url: `${GARAGE_PAGE}?pull=${o.pull.id}` }
      if (await claim(telling, now, settings)) cars.push(telling)
    }
    if (cars.length === 1) await push(cars[0])
    if (cars.length > 1) await push({ ...cars[0], ...pullsWords(cars.length), url: GARAGE_PAGE })
    told += cars.length
    for (const o of list) {
      for (const row of o.rows) {
        const reward = row.voucher ? { kind: 'voucher' as const, amount: Math.round(Number(row.voucher.amount)) } : { kind: 'stamps' as const, stamps: row.stamps }
        const telling: Telling = { userId, kind: 'garage_row', subjectKey: `garage_row:${o.seriesId}:${row.row}`, ...rowWords(row.row, reward), url: GARAGE_PAGE }
        if (await claim(telling, now, settings)) await push(telling)
      }
      if (o.seriesCompleted) {
        const telling: Telling = { userId, kind: 'garage_series', subjectKey: `garage_series:${o.seriesId}`, ...seriesWords(o.seriesName), url: GARAGE_PAGE }
        if (await claim(telling, now, settings)) await push(telling)
      }
    }
  }
  return told
}

// ─── The service ─────────────────────────────────────────────────────────────

/** The Garage is live: rewards live, its own switch on, and a series live now. */
async function liveContext(now: Date) {
  if (!(await rewardsLive())) return null
  const { settings } = await currentSettings()
  const g = garageSettings(settings)
  if (!g.enabled) return null
  const series = await garageRepository.liveSeries(now)
  if (!series) return null
  return { settings, g, series }
}

function notLive(): AppError {
  return new AppError(404, 'Not found', 'NOT_FOUND')
}

export const garageService = {
  /** Whether the apps show the Garage (the rewards config carries it). Reads nothing while rewards are not live. */
  async publicConfig(settings: RewardsSettings, now = new Date()) {
    const g = garageSettings(settings)
    if (!g.enabled) return { live: false as const }
    const series = await garageRepository.liveSeries(now)
    return series ? { live: true as const, seriesName: series.name } : { live: false as const }
  },

  // ─── Earning ──────────────────────────────────────────────────────────────

  /**
   * A booking's stamp was just earned (0050's judge committed): one card,
   * once per chain, in its own transaction under the customer's lock. Told
   * at once from 08:00 to 20:59 IST; otherwise the cron's morning run tells
   * it. If this fails, the cron's catch-up pulls it.
   */
  async onStampEarned(userId: string, rootBookingId: string, now = new Date(), pick?: (max: number) => number) {
    const live = await liveContext(now)
    if (!live) return null
    const result = await garageRepository.pullForBooking({ userId, rootBookingId, now, settings: live.settings, pick })
    if (!result) return null
    await garageService.announce(result.outcomes, result.vouchers, result.capAlert, live.settings, now)
    return result
  },

  /**
   * After pulls made inside another rewards write (a scratch card, a
   * challenge's prize, a badge's bonus, the team) commit: vouchers and the
   * cap as 0050 announces them, then the cars, rows and series, in
   * celebration hours (the cron tells the rest).
   */
  async announce(
    outcomes: PullOutcome[],
    vouchers: IssuedVoucher[],
    capAlert: { month: string; issuedPaise: number } | null,
    settings: RewardsSettings,
    now = new Date()
  ) {
    for (const o of outcomes) {
      log.info(
        { userId: o.userId, pullId: o.pull.id, car: o.pull.number, rarity: o.pull.rarity, source: o.pull.source, duplicate: o.pull.duplicate, forced: o.pull.forced, rows: o.rows.map((r) => r.row), series: Boolean(o.seriesCompleted) },
        'garage:pulled'
      )
    }
    announceRewards(vouchers, capAlert, settings)
    if (outcomes.length > 0 && isCelebrationHour(now)) {
      await tellPulls(outcomes, now, settings).catch((err: unknown) => log.error({ err }, 'garage:tell_failed'))
    }
  },

  /** The pulls a write inside the rewards lock may make; used by 0050's scratch and 0054's challenges and badges. */
  tx: garageTx,

  // ─── The customer ─────────────────────────────────────────────────────────

  /** The album: every card of the live series (owned ones in full, missing ones as silhouettes), rows, duplicates, the odds. */
  async album(userId: string, now = new Date()) {
    const live = await liveContext(now)
    if (!live) throw notLive()
    const { series, g } = live
    const cars = await garageRepository.seriesCars(series.id)
    const facts = await garageRepository.albumFacts(userId, series.id)
    const owned = new Map(facts.owned.map((o) => [o.carId, o]))
    // A car switched off still shows to whoever has it; nobody else sees it.
    const shown = cars.filter((car) => car.enabled || owned.has(car.id))
    const total = shown.length
    const views = shown.map((car) => {
      const mine = owned.get(car.id)
      return mine ? ownedCarView(car, series.number, total, mine) : missingCarView(car, series.number, total)
    })
    const rewarded = new Map(facts.rows.map((r) => [r.row, r]))
    const rows = Array.from({ length: rowCount(Math.max(...shown.map((c) => c.number), 0)) }, (_, i) => {
      const row = i + 1
      const numbers = shown.filter((c) => rowOf(c.number) === row).map((c) => c.number)
      const collected = views.filter((v) => rowOf(v.number) === row && v.owned).length
      const done = rewarded.get(row)
      return {
        row,
        numbers,
        collected,
        total: numbers.length,
        complete: Boolean(done),
        completedAt: done?.completedAt.toISOString() ?? null,
        reward: done ? { voucher: done.voucherId !== null, stamps: done.fallbackStamps } : null,
      }
    })
    return {
      series: { id: series.id, number: series.number, name: series.name, total, endsAt: series.endsAt?.toISOString() ?? null },
      collected: views.filter((v) => v.owned).length,
      pulls: facts.pulls,
      cars: views,
      rows,
      rowReward: g.rowVoucher,
      duplicates: { waiting: facts.duplicatesWaiting, perStar: g.duplicatesPerStar },
      completedAt: facts.completedAt?.toISOString() ?? null,
      // Shown on the page: the odds and the pity, plainly.
      odds: g.rarityWeights,
      pity: { rare: g.pityRare, legendary: g.pityLegendary },
    }
  },

  /** The customer's latest cards, unseen first: the reveal on the booking page and Home. */
  async pulls(userId: string, now = new Date()) {
    const live = await liveContext(now)
    if (!live) throw notLive()
    const rows = await garageRepository.recentPulls(userId, RECENT_PULLS)
    return { pulls: rows.map(pullView), unseen: rows.filter((r) => r.seenAt === null).length }
  },

  /** A scratched Garage card's car (the session's own card only). */
  async pullForScratchCard(userId: string, scratchCardId: string) {
    const [r] = await garageRepository.recentPulls(userId, 1, { scratchCardId })
    return r ? pullView(r) : null
  },

  async markSeen(userId: string, ids: string[], now = new Date()) {
    return { marked: await garageRepository.markSeen(userId, ids, now) }
  },

  // ─── The cron ─────────────────────────────────────────────────────────────

  /**
   * The pending-digest cron's part, only while the Garage is live: cards for
   * stamp-earning bookings the after-response hook missed (last 2 days),
   * then, from 08:00 to 20:59 IST, cars, rows and series not yet told (last
   * 3 days). Bounded, 8-second budget.
   */
  async sweep(options: { dryRun: boolean }, now = new Date()) {
    const live = await liveContext(now)
    if (!live) return { enabled: false as const }
    const started = Date.now()
    const outOfTime = () => Date.now() - started > SWEEP_BUDGET_MS
    const summary = { enabled: true as const, pulled: 0, told: 0, failed: 0, outOfTime: false }
    if (options.dryRun) return summary
    for (const row of await garageRepository.listUnpulled(new Date(now.getTime() - CATCH_UP_LOOKBACK_MS), CATCH_UP_BATCH)) {
      if (outOfTime()) return { ...summary, outOfTime: true }
      try {
        const result = await garageRepository.pullForBooking({ userId: row.userId, rootBookingId: row.rootBookingId, now, settings: live.settings })
        if (result) {
          summary.pulled += 1
          // Told below (or by a later run) with the rest.
          announceRewards(result.vouchers, result.capAlert, live.settings)
        }
      } catch (err) {
        summary.failed += 1
        log.error({ err, rootBookingId: row.rootBookingId }, 'garage:catch_up_failed')
      }
    }
    if (!isCelebrationHour(now)) return summary
    const untold = await garageRepository.listUntold(new Date(now.getTime() - TELL_LOOKBACK_MS), TELL_BATCH)
    const byUser = new Map<string, typeof untold.pulls>()
    for (const p of untold.pulls) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p])
    for (const [userId, pulls] of byUser) {
      if (outOfTime()) return { ...summary, outOfTime: true }
      try {
        const cars: Telling[] = []
        for (const p of pulls) {
          const telling: Telling = { userId, kind: 'garage_card', subjectKey: `garage_pull:${p.id}`, ...pullWords(p, p.duplicate), url: `${GARAGE_PAGE}?pull=${p.id}` }
          if (await claim(telling, now, live.settings)) cars.push(telling)
        }
        if (cars.length === 1) await push(cars[0])
        if (cars.length > 1) await push({ ...cars[0], ...pullsWords(cars.length), url: GARAGE_PAGE })
        summary.told += cars.length
      } catch (err) {
        summary.failed += 1
        log.error({ err, userId }, 'garage:tell_failed')
      }
    }
    for (const r of untold.rows) {
      try {
        const reward = r.voucherAmount !== null ? { kind: 'voucher' as const, amount: Math.round(r.voucherAmount) } : { kind: 'stamps' as const, stamps: r.stamps }
        const telling: Telling = { userId: r.userId, kind: 'garage_row', subjectKey: `garage_row:${r.seriesId}:${r.row}`, ...rowWords(r.row, reward), url: GARAGE_PAGE }
        if (await claim(telling, now, live.settings)) {
          await push(telling)
          summary.told += 1
        }
      } catch (err) {
        summary.failed += 1
        log.error({ err, userId: r.userId }, 'garage:tell_row_failed')
      }
    }
    for (const s of untold.series) {
      try {
        const telling: Telling = { userId: s.userId, kind: 'garage_series', subjectKey: `garage_series:${s.seriesId}`, ...seriesWords(s.name), url: GARAGE_PAGE }
        if (await claim(telling, now, live.settings)) {
          await push(telling)
          summary.told += 1
        }
      } catch (err) {
        summary.failed += 1
        log.error({ err, userId: s.userId }, 'garage:tell_series_failed')
      }
    }
    return summary
  },

  // ─── Admin ────────────────────────────────────────────────────────────────

  /** Rewards → Garage: the settings in force, every series, the chosen series' cards with their figures. */
  async adminOverview(seriesId: string | undefined, now = new Date()) {
    const { settings, version } = await currentSettings(0)
    const g = garageSettings(settings)
    const series = await garageRepository.listSeries()
    const chosen = (seriesId ? series.find((s) => s.id === seriesId) : undefined) ?? series.find((s) => s.status === 'live') ?? series[0]
    const cars = chosen ? await garageRepository.seriesCars(chosen.id) : []
    const figures = chosen ? await garageRepository.carFigures(chosen.id) : new Map()
    const live = await garageRepository.liveSeries(now)
    return {
      masterSwitch: env.rewardsEnabled,
      rewardsLive: env.rewardsEnabled && settings.enabled,
      live: env.rewardsEnabled && settings.enabled && g.enabled && live !== null,
      settingsVersion: version,
      garage: g,
      series: series.map((s) => ({ ...s, startsAt: s.startsAt?.toISOString() ?? null, endsAt: s.endsAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })),
      seriesId: chosen?.id ?? null,
      cars: cars.map((car) => adminCarView(car, figures.get(car.id))),
      settings: PHOTO_SETTINGS,
      limits: CAR_LIMITS,
    }
  },

  async adminUpdateSeries(input: { id: string; name: string; status: SeriesStatus; startsAt: string | null; endsAt: string | null; actorName: string; actorSub: string }, now = new Date()) {
    const name = input.name.trim()
    if (name.length < CAR_LIMITS.seriesName.min || name.length > CAR_LIMITS.seriesName.max) {
      throw new AppError(400, `The name is ${CAR_LIMITS.seriesName.min}–${CAR_LIMITS.seriesName.max} characters`, 'GARAGE_SERIES_INVALID')
    }
    const banned = bannedPhraseIn(name) ?? realCarNameIn(name)
    if (banned) throw new AppError(400, `"${banned}" can't be in a series name`, 'GARAGE_SERIES_INVALID')
    const startsAt = input.startsAt ? new Date(input.startsAt) : null
    const endsAt = input.endsAt ? new Date(input.endsAt) : null
    if (startsAt && endsAt && endsAt <= startsAt) throw new AppError(400, 'The end is after the start', 'GARAGE_SERIES_INVALID')
    const saved = await garageRepository.updateSeries({
      id: input.id,
      patch: { name, status: input.status, startsAt, endsAt },
      actorName: input.actorName,
      actorSub: input.actorSub,
      now,
    })
    if (!saved) throw new AppError(404, 'Series not found', 'GARAGE_SERIES_NOT_FOUND')
    log.info({ seriesId: input.id, status: input.status, actorName: input.actorName }, 'garage:series_saved')
    return garageService.adminOverview(input.id, now)
  },

  async adminUpdateCar(input: { id: string; car: CarEdit; actorName: string; actorSub: string }, now = new Date()) {
    const car: CarEdit = {
      ...input.car,
      name: input.car.name.trim(),
      colour: input.car.colour.trim(),
      setting: input.car.setting.trim(),
      lore: input.car.lore.trim(),
      photoId: input.car.photoId.trim(),
    }
    const problems = carProblems(car)
    if (problems.length > 0) throw new AppError(400, problems.join(' · '), 'GARAGE_CAR_INVALID')
    const saved = await garageRepository.updateCar({ id: input.id, patch: car, actorName: input.actorName, actorSub: input.actorSub, now })
    if (!saved) throw new AppError(404, 'Car not found', 'GARAGE_CAR_NOT_FOUND')
    return adminCarView(saved, undefined)
  },

  // ─── Art (admin) ──────────────────────────────────────────────────────────
  //
  // Series 1 is the card photo pool. A future series with its own pictures
  // can upload them here; "Reset to the photo" goes back to the pool photo.

  /** "Upload art": a presigned PUT for one WebP of that exact size, waiting under ai-temp/garage/<car>/. */
  async artUploadUrl(carId: string, sizeBytes: number) {
    const found = await garageRepository.findCar(carId)
    if (!found) throw new AppError(404, 'Car not found', 'GARAGE_CAR_NOT_FOUND')
    if (sizeBytes > MAX_ART_BYTES) throw new AppError(413, 'Pictures are at most 3 MB', 'GARAGE_ART_TOO_LARGE')
    return createPresignedPutForKey(`${garageTempPrefix(carId)}upload-${randomUUID()}.webp`, 'image/webp', sizeBytes)
  },

  /** The uploaded picture, checked (there, a WebP, at most 3 MB), becomes the card's picture. */
  async useUpload(input: { carId: string; key: string; actorName: string; actorSub: string }, now = new Date()) {
    const found = await garageRepository.findCar(input.carId)
    if (!found) throw new AppError(404, 'Car not found', 'GARAGE_CAR_NOT_FOUND')
    if (!isGarageTempKeyFor(input.key, input.carId) || !input.key.slice(garageTempPrefix(input.carId).length).startsWith('upload-')) {
      throw new AppError(400, "That is not this car's upload", 'GARAGE_ART_INVALID')
    }
    const object = await readObject(input.key)
    if (!object || object.body.length === 0) throw new AppError(400, "The picture didn't arrive. Try again.", 'GARAGE_ART_INVALID')
    if (object.body.length > MAX_ART_BYTES || !isWebp(object.body)) {
      await deleteObject(input.key)
      throw new AppError(400, 'Use a WebP picture of at most 3 MB', 'GARAGE_ART_INVALID')
    }
    const finalKey = garageArtKey(found.seriesNumber, found.car.number)
    await putObject(finalKey, object.body, 'image/webp')
    const saved = await garageRepository.setArt({ id: input.carId, source: 'upload', url: versioned(finalKey, now), actorName: input.actorName, actorSub: input.actorSub, now })
    runInBackground('garage:art_upload_cleanup', () => deleteObject(input.key))
    return adminCarView(saved!, undefined)
  },

  /** "Reset to the photo": back to the card's pool photo; the uploaded file is removed. */
  async resetArt(input: { carId: string; actorName: string; actorSub: string }, now = new Date()) {
    const found = await garageRepository.findCar(input.carId)
    if (!found) throw new AppError(404, 'Car not found', 'GARAGE_CAR_NOT_FOUND')
    const oldKey = found.car.artUrl ? keyFromPublicUrl(found.car.artUrl.split('?')[0]) : null
    const saved = await garageRepository.setArt({ id: input.carId, source: 'photo', url: null, actorName: input.actorName, actorSub: input.actorSub, now })
    if (oldKey) runInBackground('garage:art_reset_cleanup', () => deleteObject(oldKey))
    return adminCarView(saved!, undefined)
  },

  // ─── Figures (admin) ──────────────────────────────────────────────────────

  /** A month's figures for a series: pulls by rarity against the odds, sources, duplicates, rows and series finished, top collectors (phones masked). */
  async adminStats(seriesId: string, monthKey: string | undefined, now = new Date()) {
    const { settings } = await currentSettings()
    const g = garageSettings(settings)
    const month = monthKey ?? istMonthKey(now)
    const stats = await garageRepository.monthStats(seriesId, month)
    const total = stats.byRarity.reduce((s, r) => s + r.n, 0)
    const top = await garageRepository.topCollectors(seriesId, 15)
    return {
      month,
      pulls: total,
      rarities: GARAGE_RARITIES.map((rarity) => {
        const row = stats.byRarity.find((r) => r.rarity === rarity)
        const n = row?.n ?? 0
        return { rarity, label: RARITY_LABELS[rarity], odds: g.rarityWeights[rarity], pulled: n, share: total > 0 ? Math.round((n * 1000) / total) / 10 : 0, byPity: row?.forced ?? 0 }
      }),
      sources: PULL_SOURCES.map((source) => ({ source, label: PULL_SOURCE_LABELS[source], pulled: stats.bySource.find((r) => r.source === source)?.n ?? 0 })),
      duplicates: { pulled: stats.duplicates, intoStamps: stats.converted, garageStamps: stats.garageStamps },
      rows: stats.rows,
      series: { thisMonth: stats.seriesThisMonth, ever: stats.seriesEver },
      collectors: stats.collectors,
      topCollectors: top.map((row) => ({ ...row, phone: maskPhone(row.phone) })),
    }
  },

  /** Every pull of a month for the CSV (phones masked). */
  async adminPulls(monthKey: string | undefined, now = new Date()) {
    const month = monthKey ?? istMonthKey(now)
    const rows = await garageRepository.monthPulls(month, CSV_LIMIT)
    return {
      month,
      rows: rows.map((r) => ({
        at: r.pulled_at.toISOString(),
        phone: maskPhone(r.phone),
        series: r.series,
        number: r.number,
        name: r.name,
        rarity: r.rarity,
        source: r.source as PullSource,
        duplicate: r.was_duplicate,
        pity: r.forced,
      })),
    }
  },

  /** The team gives a customer a card (random, like any pull), with why and the typed name. */
  async adminGivePull(input: { userId: string; actorName: string; actorSub: string; reason: string }, now = new Date()) {
    const live = await liveContext(now)
    if (!live) throw new AppError(409, 'The Garage is not live, so no card can be given.', 'GARAGE_NOT_LIVE')
    const customer = await garageRepository.findCustomer(input.userId)
    if (!customer) throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND')
    const result = await garageRepository.pullByAdmin({ ...input, now, settings: live.settings })
    if (!result) throw new AppError(409, 'No car could be drawn: is any car switched on?', 'GARAGE_NO_CARS')
    await garageService.announce(result.outcomes, result.vouchers, result.capAlert, live.settings, now)
    const o = result.outcomes[0]
    return { pullId: o.pull.id, number: o.pull.number, name: o.pull.name, rarity: o.pull.rarity, duplicate: o.pull.duplicate }
  },
}

/** The public URL of a card's picture with a version, so a new picture under the same key is never served from a cache. */
function versioned(key: string, now: Date): string {
  return `${publicUrlForKey(key)}?v=${now.getTime()}`
}

export type GarageAlbum = Awaited<ReturnType<typeof garageService.album>>
export type { GarageSettings }
