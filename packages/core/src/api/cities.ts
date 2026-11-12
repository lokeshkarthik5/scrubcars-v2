import { apiClient } from './client'
import type { CustomerCity } from '@repo/core/customer-city'

/**
 * GET /cities (0070): the cities switched on for customers, the default
 * first, each with its centre, reach, "Growing here" and how many garages
 * customers can find there. Public.
 */
export async function getCities(): Promise<CustomerCity[]> {
  const data = await apiClient<{ cities: CustomerCity[] }>('/cities', { auth: false })
  return data.cities
}
