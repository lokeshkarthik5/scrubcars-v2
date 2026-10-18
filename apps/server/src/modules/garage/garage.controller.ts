import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { garageService } from './garage.service.js'
import type { CarInput, SeriesInput } from './garage.validation.js'

type AuthContext = Context<{ Variables: AuthVariables }>

const ok = (c: Context, data: unknown) => c.json({ success: true, data })

// ─── The customer (always the session's own) ─────────────────────────────────

export async function album(c: AuthContext) {
  return ok(c, await garageService.album(c.get('auth').sub))
}

export async function pulls(c: AuthContext) {
  return ok(c, await garageService.pulls(c.get('auth').sub))
}

export async function markSeen(c: AuthContext, ids: string[]) {
  return ok(c, await garageService.markSeen(c.get('auth').sub, ids))
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function adminOverview(c: AuthContext, seriesId: string | undefined) {
  return ok(c, await garageService.adminOverview(seriesId))
}

export async function adminUpdateSeries(c: AuthContext, id: string, input: SeriesInput) {
  return ok(c, await garageService.adminUpdateSeries({ id, ...input, actorSub: c.get('auth').sub }))
}

export async function adminUpdateCar(c: AuthContext, id: string, input: CarInput) {
  const { actorName, ...car } = input
  return ok(c, await garageService.adminUpdateCar({ id, car, actorName, actorSub: c.get('auth').sub }))
}

export async function generateArt(c: AuthContext, id: string) {
  c.header('Cache-Control', 'no-store')
  return ok(c, await garageService.generateArt(c.get('auth').sub, id))
}

export async function chooseArt(c: AuthContext, id: string, input: { key: string; otherKeys?: string[]; actorName: string }) {
  return ok(c, await garageService.chooseArt({ carId: id, key: input.key, otherKeys: input.otherKeys ?? [], actorName: input.actorName, actorSub: c.get('auth').sub }))
}

export async function autoArt(c: AuthContext, id: string, actorName: string) {
  return ok(c, await garageService.autoArt({ carId: id, actorName, actorSub: c.get('auth').sub }))
}

export async function artUploadUrl(c: AuthContext, id: string, sizeBytes: number) {
  c.header('Cache-Control', 'no-store')
  return ok(c, await garageService.artUploadUrl(id, sizeBytes))
}

export async function useUpload(c: AuthContext, id: string, input: { key: string; actorName: string }) {
  return ok(c, await garageService.useUpload({ carId: id, ...input, actorSub: c.get('auth').sub }))
}

export async function resetArt(c: AuthContext, id: string, actorName: string) {
  return ok(c, await garageService.resetArt({ carId: id, actorName, actorSub: c.get('auth').sub }))
}

export async function adminStats(c: AuthContext, seriesId: string, month: string | undefined) {
  return ok(c, await garageService.adminStats(seriesId, month))
}

export async function adminPulls(c: AuthContext, month: string | undefined) {
  return ok(c, await garageService.adminPulls(month))
}

export async function adminGivePull(c: AuthContext, userId: string, input: { actorName: string; reason: string }) {
  return ok(c, await garageService.adminGivePull({ userId, ...input, actorSub: c.get('auth').sub }))
}
