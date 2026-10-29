import { apiClient } from './client'

/**
 * The signed-in person's own account (0066), from either app: a customer's
 * Profile → Delete account and a garage staff login's "Delete my account".
 * The account is always the session's; nothing here names one.
 */

export type AccountDeletionBlockerCode =
  | 'VENDOR_OWNER_ACCOUNT'
  | 'ACCOUNT_HAS_OPEN_BOOKING'
  | 'ACCOUNT_HAS_OPEN_CHECKOUT'
  | 'ACCOUNT_REFUND_OWED'
  | 'ACCOUNT_HAS_CREDIT'
  | 'ACCOUNT_HAS_UNREDEEMED_GIFT'

export interface AccountDeletionPreview {
  canDelete: boolean
  /** What has to finish first, each saying what to do; empty when it can go now. */
  blockers: Array<{ code: AccountDeletionBlockerCode; message: string }>
}

/** GET /account/deletion — what deleting would need first. */
export function getAccountDeletionPreview() {
  return apiClient<AccountDeletionPreview>('/account/deletion')
}

/**
 * DELETE /account — the person is blanked and every session ends; the
 * answer clears this browser's cookies. Refused (409) while anything is open.
 */
export async function deleteMyAccount(): Promise<void> {
  await apiClient('/account', { method: 'DELETE' })
}
