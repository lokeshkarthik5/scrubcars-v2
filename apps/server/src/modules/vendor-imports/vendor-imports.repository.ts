import { asc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { users, vendors } from '../../db/schema.js'

/**
 * The garage import reads one thing from the database: who an owner phone
 * already belongs to. Nothing here writes — the garage is created by the
 * ordinary POST /admin/vendors.
 */
export const vendorImportsRepository = {
  findUserByPhone(phone: string) {
    return db.query.users.findFirst({
      where: eq(users.phone, phone),
      columns: { id: true, name: true, isCustomer: true, isVendorOwner: true },
    })
  },

  listGaragesOwnedBy(userId: string) {
    return db
      .select({ id: vendors.id, businessName: vendors.businessName, status: vendors.status })
      .from(vendors)
      .where(eq(vendors.ownerId, userId))
      .orderBy(asc(vendors.businessName))
  },
}
