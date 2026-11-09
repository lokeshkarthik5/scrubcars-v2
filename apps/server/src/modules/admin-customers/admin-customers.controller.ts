import type { Context } from 'hono'
import { signedInAdmin, type AuthVariables } from '../../middleware/auth.middleware.js'
import { adminCustomersService } from './admin-customers.service.js'
import type { CustomerSearchQuery, DeleteCustomerInput } from './admin-customers.validation.js'

type CustomersContext = Context<{ Variables: AuthVariables }>

export async function search(c: CustomersContext, query: CustomerSearchQuery) {
  const data = await adminCustomersService.search(query)
  return c.json({ success: true, data })
}

export async function getCustomer(c: CustomersContext, id: string) {
  const data = await adminCustomersService.getCustomer(id)
  return c.json({ success: true, data })
}

export async function deletionPreview(c: CustomersContext, id: string) {
  const data = await adminCustomersService.deletionPreview(id)
  return c.json({ success: true, data })
}

export async function deleteCustomer(c: CustomersContext, id: string, input: DeleteCustomerInput) {
  const admin = signedInAdmin(c)
  const data = await adminCustomersService.deleteCustomer({ sub: admin.sub, name: input.actorName }, id, input.confirmText)
  return c.json({ success: true, data })
}
