import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { rewardsService } from './rewards.service.js'
import type { AdjustRewardsInput, SaveSettingsInput } from './rewards.validation.js'

type AuthContext = Context<{ Variables: AuthVariables }>

export async function getConfig(c: Context) {
  return c.json({ success: true, data: await rewardsService.config() })
}

export async function openInvite(c: Context, code: string) {
  c.header('Cache-Control', 'no-store')
  return c.json({ success: true, data: await rewardsService.openInvite(code) })
}

/** The session's own rewards, never a parameter's. */
export async function getMine(c: AuthContext) {
  return c.json({ success: true, data: await rewardsService.myRewards(c.get('auth').sub) })
}

export async function getSummary(c: AuthContext) {
  return c.json({ success: true, data: await rewardsService.summary(c.get('auth').sub) })
}

export async function scratch(c: AuthContext, cardId: string) {
  return c.json({ success: true, data: await rewardsService.scratch(c.get('auth').sub, cardId) })
}

export async function createInvite(c: AuthContext) {
  return c.json({ success: true, data: await rewardsService.createInvite(c.get('auth').sub) })
}

export async function claimInvite(c: AuthContext, token: string) {
  return c.json({ success: true, data: await rewardsService.claimInvite(c.get('auth').sub, token) })
}

export async function setBirthday(c: AuthContext, birthday: { month: number; day: number } | null) {
  return c.json({ success: true, data: await rewardsService.setBirthday(c.get('auth').sub, birthday) })
}

export async function adminSettings(c: AuthContext) {
  return c.json({ success: true, data: await rewardsService.adminSettings() })
}

export async function adminSaveSettings(c: AuthContext, input: SaveSettingsInput) {
  return c.json({ success: true, data: await rewardsService.saveSettings({ ...input, actorSub: c.get('auth').sub }) })
}

export async function adminSummary(c: AuthContext, month: string | undefined) {
  return c.json({ success: true, data: await rewardsService.adminSummary(month) })
}

export async function adminLedger(c: AuthContext, month: string | undefined) {
  return c.json({ success: true, data: await rewardsService.adminLedger(month) })
}

export async function adminFind(c: AuthContext, phone: string) {
  return c.json({ success: true, data: await rewardsService.adminFind(phone) })
}

export async function adminCustomer(c: AuthContext, userId: string) {
  return c.json({ success: true, data: await rewardsService.adminCustomer(userId) })
}

export async function adminAdjust(c: AuthContext, userId: string, input: AdjustRewardsInput) {
  return c.json({
    success: true,
    data: await rewardsService.adminAdjust({ userId, actorSub: c.get('auth').sub, ...input }),
  })
}
