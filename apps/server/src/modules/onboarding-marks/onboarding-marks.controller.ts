import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { onboardingMarksService } from './onboarding-marks.service.js'
import type {
  CreateMarkInput,
  MarkAskedInput,
  UpdateMarkInput,
  UpdateMarkItemInput,
} from './onboarding-marks.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function list(c: AdminContext, vendorId: string) {
  const data = await onboardingMarksService.list(vendorId)
  return c.json({ success: true, data })
}

export async function create(
  c: AdminContext,
  vendorId: string,
  input: CreateMarkInput
) {
  const data = await onboardingMarksService.create(vendorId, input)
  return c.json({ success: true, data }, 201)
}

export async function update(
  c: AdminContext,
  vendorId: string,
  markId: string,
  input: UpdateMarkInput
) {
  const data = await onboardingMarksService.update(vendorId, markId, input)
  return c.json({ success: true, data })
}

export async function updateItem(
  c: AdminContext,
  params: { id: string; markId: string; itemId: string },
  input: UpdateMarkItemInput
) {
  const data = await onboardingMarksService.updateItem(
    params.id,
    params.markId,
    params.itemId,
    input
  )
  return c.json({ success: true, data })
}

export async function remove(
  c: AdminContext,
  vendorId: string,
  markId: string
) {
  await onboardingMarksService.remove(vendorId, markId)
  return c.json({ success: true, data: null })
}

export async function markAsked(c: AdminContext, input: MarkAskedInput) {
  const data = await onboardingMarksService.markAsked(input)
  return c.json({ success: true, data })
}
