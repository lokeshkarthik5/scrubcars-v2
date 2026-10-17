/**
 * Deleting a customer account (DELETE /users/me).
 *
 * The app has no button for it (account closure is on request, see the
 * privacy policy), but the endpoint exists, and a user row cascades: through
 * vendors.owner_id it would take the garage the person owns with it, and that
 * garage's bookings and payments from other customers. The receipts case is
 * pinned in receipts.spec.ts; this is the garage owner's.
 *
 * Signs in fresh as CUSTOMERS.garageOwner, the owner of VENDORS.ownerAccount
 * and of nothing else, whose number this file alone uses.
 */
import { test, expect } from '../../support/fixtures'
import { API, loginViaApi } from '../../support/auth'
import { sql } from '../../support/db'
import { CUSTOMERS, VENDORS } from '../../support/seed-ids'

test.describe('account deletion', () => {
  test('a garage owner cannot delete their account into their garage @p0', async () => {
    // A fresh login rather than a saved state: a bare request context cannot
    // refresh a 15-minute token, and a 401 would pass for the wrong reason.
    const owner = await loginViaApi(CUSTOMERS.garageOwner.phone)

    const refused = await owner.delete(`${API}/api/v1/users/me`)
    expect(refused.status()).toBe(409)
    expect(await refused.json()).toEqual({
      success: false,
      message:
        "This number owns a garage on Detlio, so the account can't be deleted here. Contact support to close it.",
      code: 'VENDOR_OWNER_ACCOUNT',
    })

    // Nothing went: not the account, and not the garage.
    const [counts] = await sql<{ users: string; vendors: string }[]>`
      select
        (select count(*) from users where id = ${CUSTOMERS.garageOwner.id})::text as users,
        (select count(*) from vendors where id = ${VENDORS.ownerAccount.id})::text as vendors
    `
    expect(counts).toEqual({ users: '1', vendors: '1' })

    // Still signed in: the refusal changed nothing about the session.
    const me = await owner.get(`${API}/api/v1/users/me`)
    expect(me.status()).toBe(200)
    await owner.dispose()
  })
})
