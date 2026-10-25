import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { rewardExtrasService } from './reward-extras.service.js'
import type { ChallengeBody } from './reward-extras.validation.js'

type AuthContext = Context<{ Variables: AuthVariables }>

/** Always the session's own, never a parameter's. */
export async function getExtras(c: AuthContext) {
  return c.json({ success: true, data: await rewardExtrasService.extras(c.get('auth').sub) })
}

export async function getExtrasSummary(c: AuthContext) {
  return c.json({ success: true, data: await rewardExtrasService.summary(c.get('auth').sub) })
}

export async function markSeen(c: AuthContext, ids: string[]) {
  return c.json({ success: true, data: await rewardExtrasService.markSeen(c.get('auth').sub, ids) })
}

export async function getWrapped(c: AuthContext, year: number) {
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: await rewardExtrasService.wrapped(c.get('auth').sub, year) })
}

export async function wrappedEvent(c: AuthContext, year: number, kind: 'opened' | 'shared') {
  return c.json({ success: true, data: await rewardExtrasService.wrappedEvent(c.get('auth').sub, year, kind) })
}

export async function adminAchievements(c: AuthContext) {
  return c.json({ success: true, data: await rewardExtrasService.adminAchievements() })
}

export async function adminChallenges(c: AuthContext) {
  return c.json({ success: true, data: await rewardExtrasService.adminChallenges() })
}

export async function adminChallenge(c: AuthContext, id: string) {
  return c.json({ success: true, data: await rewardExtrasService.adminChallenge(id) })
}

export async function adminChallengeResults(c: AuthContext, id: string) {
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: await rewardExtrasService.adminChallengeResults(id) })
}

export async function createChallenge(c: AuthContext, input: ChallengeBody) {
  return c.json({ success: true, data: await rewardExtrasService.createChallenge({ ...input, actorSub: c.get('auth').sub }) }, 201)
}

export async function updateChallenge(c: AuthContext, id: string, input: ChallengeBody) {
  return c.json({ success: true, data: await rewardExtrasService.updateChallenge(id, { ...input, actorSub: c.get('auth').sub }) })
}

export async function publishChallenge(c: AuthContext, id: string, actorName: string) {
  return c.json({ success: true, data: await rewardExtrasService.publishChallenge(id, { actorName, actorSub: c.get('auth').sub }) })
}

export async function endChallenge(c: AuthContext, id: string, actorName: string) {
  return c.json({ success: true, data: await rewardExtrasService.endChallenge(id, { actorName, actorSub: c.get('auth').sub }) })
}

export async function adminWrappedStats(c: AuthContext, year: number) {
  return c.json({ success: true, data: await rewardExtrasService.adminWrappedStats(year) })
}

export async function adminCustomerWrapped(c: AuthContext, userId: string, year: number) {
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: await rewardExtrasService.adminCustomerWrapped(userId, year) })
}
