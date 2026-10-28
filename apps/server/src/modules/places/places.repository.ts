import { leadsRepository } from '../leads/leads.repository.js'

/**
 * The finder reads only zones (its own module stores nothing: what is
 * found stays in the answer until the team adds it as leads).
 */
export const placesRepository = {
  listZones: () => leadsRepository.listZones(),
}
