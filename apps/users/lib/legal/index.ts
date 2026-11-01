/**
 * The five legal pages and the delete-account page, in the order the footer
 * and the lawyer's Markdown copy list them.
 */
import type { LegalDoc } from './doc-format'
import { CONTACT } from './contact'
import { DELETE_ACCOUNT } from './delete-account'
import { PRIVACY } from './privacy'
import { REFUNDS } from './refunds'
import { SERVICE_DELIVERY } from './service-delivery'
import { TERMS } from './terms'

export const LEGAL_DOCS: readonly LegalDoc[] = [
  TERMS,
  PRIVACY,
  REFUNDS,
  SERVICE_DELIVERY,
  CONTACT,
  DELETE_ACCOUNT,
]
