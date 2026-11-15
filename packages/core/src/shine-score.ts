/**
 * Shine Score (0075): a free cleanliness score from four photos, and the
 * "Your Shine went 46 → 92" card from a job's before and after photos. The
 * areas, their words, the numbers and the on-device photo check, as the apps
 * show them. Twin of apps/server/src/lib/shine-score.ts, which decides; the
 * server's shine-score.parity.test.ts keeps the two the same. Pure.
 */

import type { JobPhoto } from '@repo/core/types'
import { msg } from './i18n/translate'

/** The four photos of a scan, in the order they are taken. */
export const SHINE_AREAS = ['front', 'side', 'dashboard', 'seats'] as const
export type ShineArea = (typeof SHINE_AREAS)[number]

/** An area's name on the result ("Outside · front"). */
export const SHINE_AREA_LABELS: Record<ShineArea, string> = {
  front: msg('Outside · front'),
  side: msg('Outside · side'),
  dashboard: msg('Dashboard'),
  seats: msg('Seats & floor'),
}

/** The short name under a photo slot ("Front"). */
export const SHINE_AREA_SHORT: Record<ShineArea, string> = {
  front: msg('Front'),
  side: msg('Side'),
  dashboard: msg('Dashboard'),
  seats: msg('Seats & floor'),
}

/** What each guided step says over and under the camera view. */
export const SHINE_STEP_GUIDES: Record<ShineArea, { fit: string; hint: string }> = {
  front: {
    fit: msg('Fit the whole car inside the line'),
    hint: msg('Stand three big steps back, facing the front, with the whole car in view. Daylight works best.'),
  },
  side: {
    fit: msg('Fit the whole car inside the line'),
    hint: msg('Stand three big steps back, side on, with the whole car in view. Daylight works best.'),
  },
  dashboard: {
    fit: msg('Fit the dashboard inside the line'),
    hint: msg('From the back seat, take the dashboard and steering wheel. Open a door for more light.'),
  },
  seats: {
    fit: msg('Fit the seats and floor inside the line'),
    hint: msg('Open a rear door and take the seats and the floor mats.'),
  },
}

export const SHINE_OUTLINE_PATHS: Record<ShineArea, string> = {
  // A hatchback side on: bonnet, windscreen, roof, tailgate, the wheels' line.
  side: 'M20 150 L20 118 Q24 104 52 98 L92 92 L130 58 Q140 50 160 50 L236 50 Q252 52 262 66 L284 98 Q300 102 300 118 L300 150 Z',
  // The car from the front: roof, windscreen, the wide body, the bumper.
  front: 'M90 60 Q96 44 120 42 L200 42 Q224 44 230 60 L246 96 Q272 100 276 116 L276 156 L44 156 L44 116 Q48 100 74 96 Z',
  // The dashboard: its top edge, the wheel's circle, the screen.
  dashboard: 'M24 84 Q160 52 296 84 L296 118 L24 118 Z M84 156 m-34 0 a34 34 0 1 0 68 0 a34 34 0 1 0 -68 0 M190 92 L250 92 L250 112 L190 112 Z',
  // Two seat backs and the floor in front of them.
  seats: 'M46 40 L138 40 L144 120 L40 120 Z M182 40 L274 40 L280 120 L176 120 Z M30 132 L290 132 L300 168 L20 168 Z',
}

/** Every number the screens say. The server's SHINE_RULES holds the same. */
export const SHINE_NUMBERS = {
  /** Free scans a customer gets each IST day. */
  scansPerDay: 3,
  /** Days a scan's photos and score are kept, then deleted. */
  keepDays: 30,
  /** An after-score under this goes to Admin → Issues → Shine checks. */
  lowAfterScore: 60,
  /** Areas both the before and the after photos must show for a before/after score. */
  minMatchedAreas: 2,
  /** The longest edge a scan photo is sent at, in pixels. */
  photoEdge: 1280,
  /** The most one scan photo may be, in bytes; a bigger one is sent smaller. */
  maxPhotoBytes: 750_000,
} as const

/**
 * Which job-photo angles (0045) stand for each area, best first. Strings,
 * not the angle type, so angles added later (a dashboard or seats angle)
 * match without a change here.
 */
export const SHINE_JOB_ANGLES: Record<ShineArea, readonly string[]> = {
  front: ['front'],
  side: ['left', 'right'],
  dashboard: ['dashboard', 'interior'],
  seats: ['seats', 'interior'],
}

/**
 * The garage's photo of an area at one stage: the newest photo of the
 * area's first angle that has one. Null when the garage took none.
 */
export function jobPhotoForArea(
  photos: readonly JobPhoto[],
  area: ShineArea,
  stage: JobPhoto['stage']
): JobPhoto | null {
  for (const angle of SHINE_JOB_ANGLES[area]) {
    const found = photos
      .filter((photo) => photo.by === 'garage' && photo.stage === stage && photo.angle === angle)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (found) return found
  }
  return null
}

// ─── The on-device photo check ───────────────────────────────────────────────

/** Average brightness (0–255) below which a photo is called dark. */
export const SHINE_DARK_BELOW = 55
/** Sharpness (variance of the Laplacian on a 256-px grey copy) below which it is called blurry. */
export const SHINE_BLURRY_BELOW = 25

export type ShinePhotoWarning = 'dark' | 'blurry'

/**
 * How bright and how sharp a photo is, from a small grey copy of it:
 * `grey` is one byte per pixel, row by row. Sharpness is the variance of
 * the 4-neighbour Laplacian over the inner pixels, the usual blur measure.
 */
export function photoStats(grey: ArrayLike<number>, width: number, height: number): { brightness: number; sharpness: number } {
  const count = width * height
  if (count === 0 || grey.length < count) return { brightness: 0, sharpness: 0 }
  let sum = 0
  for (let i = 0; i < count; i++) sum += grey[i] ?? 0
  const brightness = sum / count
  if (width < 3 || height < 3) return { brightness, sharpness: 0 }
  let n = 0
  let mean = 0
  let m2 = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap =
        (grey[i - 1] ?? 0) + (grey[i + 1] ?? 0) + (grey[i - width] ?? 0) + (grey[i + width] ?? 0) - 4 * (grey[i] ?? 0)
      n += 1
      const delta = lap - mean
      mean += delta / n
      m2 += delta * (lap - mean)
    }
  }
  return { brightness, sharpness: n > 0 ? m2 / n : 0 }
}

/** What to warn about before scoring, if anything. Dark first: a dark photo also reads as soft. */
export function photoWarning(stats: { brightness: number; sharpness: number } | null): ShinePhotoWarning | null {
  if (!stats) return null
  if (stats.brightness < SHINE_DARK_BELOW) return 'dark'
  if (stats.sharpness < SHINE_BLURRY_BELOW) return 'blurry'
  return null
}

/** The warning under the photos ("Dashboard looks dark."). */
export function photoWarningLead(area: ShineArea, warning: ShinePhotoWarning): { area: string; text: string } {
  return {
    area: SHINE_AREA_SHORT[area],
    text: warning === 'dark' ? msg('{area} looks dark.') : msg('{area} looks blurry.'),
  }
}

// ─── Showing a score ─────────────────────────────────────────────────────────

/** "2 of 3 scans left today". */
export function scansLeftLine(left: number, perDay: number = SHINE_NUMBERS.scansPerDay): { key: string; left: number; perDay: number } {
  return {
    key: left === 1 ? msg('{left} of {perDay} scan left today') : msg('{left} of {perDay} scans left today'),
    left: Math.max(0, left),
    perDay,
  }
}

/** The plain text of a share: a score and the app's name, never a name, car or place. */
export function shineShareText(input: { score: number } | { before: number; after: number }): string {
  return 'score' in input
    ? `My car's Shine Score is ${input.score}/100 on Detlio.`
    : `My car's Shine went ${input.before} → ${input.after} with Detlio.`
}

export const SHINE_FOOTNOTE = msg('Scores are suggestions from your photos, not a check by a garage.')
