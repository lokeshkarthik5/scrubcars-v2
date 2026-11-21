import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { serviceCategoriesService } from './service-categories.service.js'
import type { MoveServiceCategoryInput, SetCategoryHintInput } from './service-categories.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function listOthers(c: AdminContext) {
  return c.json({ success: true, data: await serviceCategoriesService.listOthers() })
}

export async function move(c: AdminContext, serviceId: string, input: MoveServiceCategoryInput) {
  return c.json({ success: true, data: await serviceCategoriesService.move(serviceId, input) })
}

export async function setHint(c: AdminContext, serviceId: string, input: SetCategoryHintInput) {
  return c.json({ success: true, data: await serviceCategoriesService.setHint(serviceId, input) })
}
