import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { discountsService } from './discounts.service.js'
import type {
  CreateDiscountInput,
  HomeReachQuery,
  ListDiscountsQuery,
  UpdateDiscountInput,
  ValidateDiscountInput,
} from './discounts.validation.js'

type DiscountContext = Context<{ Variables: AuthVariables }>

export async function validateDiscount(
  c: DiscountContext,
  input: ValidateDiscountInput
) {
  const data = await discountsService.validateForCustomer(
    c.get('auth').sub,
    input
  )
  return c.json({ success: true, data })
}

export async function listDiscounts(
  c: DiscountContext,
  query: ListDiscountsQuery
) {
  const data = await discountsService.listDiscounts(query)
  return c.json({ success: true, data })
}

export async function getDiscount(c: DiscountContext, id: string) {
  const data = await discountsService.getDiscount(id)
  return c.json({ success: true, data })
}

export async function createDiscount(
  c: DiscountContext,
  input: CreateDiscountInput
) {
  const data = await discountsService.createDiscount(input)
  return c.json({ success: true, data }, 201)
}

export async function updateDiscount(
  c: DiscountContext,
  id: string,
  input: UpdateDiscountInput
) {
  const data = await discountsService.updateDiscount(id, input)
  return c.json({ success: true, data })
}

export async function deleteDiscount(c: DiscountContext, id: string) {
  const data = await discountsService.deleteDiscount(id)
  return c.json({ success: true, data })
}

export async function listVendorOptions(c: DiscountContext) {
  const data = await discountsService.listVendorOptions()
  return c.json({ success: true, data })
}

export async function getHomeConfig(c: DiscountContext) {
  const data = discountsService.homeConfig()
  return c.json({ success: true, data })
}

export async function getHomeReach(c: DiscountContext, query: HomeReachQuery) {
  const data = await discountsService.homeReach(query)
  return c.json({ success: true, data })
}
