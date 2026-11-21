import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { serviceCategoriesRepository } from './service-categories.repository.js'
import type { MoveServiceCategoryInput, SetCategoryHintInput } from './service-categories.validation.js'

const log = logger.child({ module: 'service-categories' })

/**
 * Settings → Services in Others (0080): every garage's services filed under
 * Others, for admin to move into the new categories. Admin only. The page
 * applies the keyword rule (packages/core/src/category-hints.ts) to this
 * list, so the rule lives in one place. A move saves at once and changes
 * nothing else about the service.
 */
export const serviceCategoriesService = {
  async listOthers() {
    const rows = await serviceCategoriesRepository.listOthers()
    return {
      services: rows.map((row) => ({
        ...row,
        categoryHintDismissedAt: row.categoryHintDismissedAt?.toISOString() ?? null,
      })),
    }
  },

  async move(serviceId: string, input: MoveServiceCategoryInput) {
    const service = await serviceCategoriesRepository.findService(serviceId)
    // A package, an add-on (always Others), a deleted service or one at a
    // garage in the Bin is not this page's to move.
    if (!service || service.deleted || service.isAddon || service.category === 'package' || service.vendorInBin) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }
    if (service.category === input.category) {
      return { id: service.id, category: service.category }
    }
    const moved = await serviceCategoriesRepository.setCategory(serviceId, input.from, input.category)
    if (!moved) {
      throw new AppError(
        409,
        'Someone changed this service’s category since the page loaded. Reload to see where it is now.',
        'CATEGORY_CHANGED'
      )
    }
    log.info(
      { serviceId, vendorId: service.vendorId, from: input.from, to: input.category, by: input.actorName },
      'service_categories:moved'
    )
    return moved
  },

  async setHint(serviceId: string, input: SetCategoryHintInput) {
    const service = await serviceCategoriesRepository.findService(serviceId)
    if (!service || service.deleted || service.isAddon || service.category === 'package' || service.vendorInBin) {
      throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    }
    const row = await serviceCategoriesRepository.setHintDismissed(serviceId, input.dismissed)
    if (!row) throw new AppError(404, 'Service not found', 'SERVICE_NOT_FOUND')
    log.info({ serviceId, dismissed: input.dismissed, by: input.actorName }, 'service_categories:hint')
    return {
      id: row.id,
      categoryHintDismissedAt: row.categoryHintDismissedAt ? new Date(row.categoryHintDismissedAt).toISOString() : null,
    }
  },
}
