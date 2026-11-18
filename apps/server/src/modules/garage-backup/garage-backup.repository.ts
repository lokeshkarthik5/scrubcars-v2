import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { adminAuditLog } from '../../db/schema.js'
import { BACKUP_AUDIT_ACTION, type BackupAudit, type BackupTableKey } from '../../lib/garage-backup.js'
import { DOCUMENT_LABELS } from '../../lib/vendor-documents.js'

/**
 * The SQL behind each backup sheet (lib/garage-backup.ts has their columns;
 * garage-backup.repository.test.ts holds the two to the same keys). Every
 * expression here is fixed text, never a value from a request: the cursor
 * and the page size are the only parameters, and they are bound.
 *
 * Times are India time, "2026-11-18 10:41"; money is rupees as text
 * ("450.00"), never a float; Garage Book's paise are turned into rupees here.
 */
interface BackupSource {
  /** FROM and JOINs. Every sheet joins `vendors v` for the garage's id and name. */
  from: string
  /** The row's own id (a uuid), which pages are cut on, in order. */
  cursor: string
  select: Record<string, string>
  /** The sheet's row count, as one scalar sub-select. */
  count: string
}

const ist = (column: string) => `to_char(${column} at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')`
const money = (column: string) => `${column}::text`
const rupeesFromPaise = (column: string) => `(${column} / 100.0)::numeric(14, 2)::text`
const reference = (id: string) => `'#' || upper(left(${id}::text, 8))`

const GARAGE = { garage_id: 'v.id::text', garage_name: 'v.business_name' }

/** Where an admin opens a garage's documents (they are private files, never public links). */
const ADMIN_DOCUMENTS_LINK = `'https://admin.detlio.com/vendors/' || v.id::text || '/edit?tab=documents'`

const DOCUMENT_TYPE_LABEL = `case d.type ${Object.entries(DOCUMENT_LABELS)
  .map(([type, label]) => `when '${type}' then '${label.replace(/'/g, "''")}'`)
  .join(' ')} else d.type end`

export const BACKUP_SOURCES: Record<BackupTableKey, BackupSource> = {
  garages: {
    from: 'vendors v left join users o on o.id = v.owner_id left join cities c on c.id = v.city_id',
    cursor: 'v.id',
    count: '(select count(*) from vendors)',
    select: {
      ...GARAGE,
      status: 'v.status::text',
      verified: 'v.is_verified',
      in_bin_since: ist('v.deleted_at'),
      deleted_forever_at: ist('v.purged_at'),
      bookings_paused_since: ist('v.bookings_paused_at'),
      bookings_paused_reason: 'v.bookings_paused_reason',
      phone: 'v.phone',
      whatsapp: 'v.whatsapp',
      email: 'v.email',
      owner_name: 'case when o.deleted_at is null then o.name end',
      owner_phone: 'case when o.deleted_at is null then o.phone end',
      address: 'v.address',
      city: 'v.city',
      pincode: 'v.pincode',
      service_city: 'c.name',
      lat: 'v.lat',
      lng: 'v.lng',
      maps_link: 'v.maps_url',
      years_in_operation: 'v.years_in_operation',
      at_garage: 'v.dropin_enabled',
      doorstep: 'v.doorstep_enabled',
      doorstep_radius_km: 'v.doorstep_radius_km',
      doorstep_whole_city: 'v.doorstep_whole_city',
      pickup: 'v.pickup::text',
      pickup_radius_km: 'v.pickup_radius_km',
      pickup_whole_city: 'v.pickup_whole_city',
      pickup_terms_accepted_at: ist('v.pickup_terms_accepted_at'),
      pickup_terms_accepted_by: 'v.pickup_terms_accepted_by',
      pickup_fee_mode: 'v.pickup_fee_mode',
      pickup_fee_fixed: money('v.pickup_fee_fixed'),
      pickup_fee_free_km: money('v.pickup_fee_free_km'),
      pickup_fee_per_km: money('v.pickup_fee_per_km'),
      pickup_fee_min: money('v.pickup_fee_min'),
      pickup_fee_max: money('v.pickup_fee_max'),
      pickup_fee_set_by: 'v.pickup_fee_source',
      pickup_fee_locked_by: 'v.pickup_fee_locked_by',
      bays: 'v.bays',
      jobs_per_day: 'v.jobs_per_day',
      vehicle_types: `array_to_string(v.vehicle_types, '; ')`,
      slot_interval_mins: 'v.slot_interval_mins',
      repair_quotes: 'v.repair_quotes_enabled',
      onboarded_by: 'v.onboarded_by_name',
      notes: 'v.notes',
      logo_link: 'v.logo_url',
      created_at: ist('v.created_at'),
    },
  },
  services: {
    from: 'services s join vendors v on v.id = s.vendor_id',
    cursor: 's.id',
    count: '(select count(*) from services)',
    select: {
      ...GARAGE,
      service_id: 's.id::text',
      name: 's.name',
      kind: `case when s.is_addon then 'Add-on' when s.category = 'package' then 'Package' else 'Service' end`,
      category: 's.category::text',
      pricing_type: 's.pricing_type::text',
      price: money('s.price'),
      price_hatchback: money('s.price_hatchback'),
      price_sedan: money('s.price_sedan'),
      price_suv: money('s.price_suv'),
      approx_price: money('s.approx_price'),
      duration_mins: 's.duration_mins',
      commission_rate: money('s.commission_rate'),
      package_contains: `(select string_agg(m.name, '; ' order by pi.sort_order, m.name)
        from service_package_items pi join services m on m.id = pi.service_id where pi.package_id = s.id)`,
      active: 's.is_active',
      deleted_at: ist('s.deleted_at'),
      description: 's.description',
    },
  },
  opening_hours: {
    from: 'vendor_working_hours h join vendors v on v.id = h.vendor_id',
    cursor: 'h.id',
    count: '(select count(*) from vendor_working_hours)',
    select: {
      ...GARAGE,
      day: `(array['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])[h.day_of_week + 1]`,
      opens: `to_char(h.open_time, 'HH24:MI')`,
      closes: `to_char(h.close_time, 'HH24:MI')`,
      closed: 'h.is_closed',
    },
  },
  photos: {
    from: `(
        select vp.id, vp.vendor_id, 'Garage photo' as kind, null::text as service_name, vp.url::text as link,
               null::text as poster_link, false as made_with_ai, vp.sort_order, vp.created_at
          from vendor_photos vp
        union all
        select si.id, s.vendor_id, case when si.kind = 'video' then 'Service video' else 'Service photo' end,
               s.name::text, si.url::text, si.poster_url::text, si.source = 'ai', si.sort_order, si.created_at
          from service_images si join services s on s.id = si.service_id
        union all
        select lv.id, lv.id, 'Logo', null, lv.logo_url::text, null, false, 0, lv.created_at
          from vendors lv where lv.logo_url is not null
      ) p join vendors v on v.id = p.vendor_id`,
    cursor: 'p.id',
    count: `((select count(*) from vendor_photos) + (select count(*) from service_images)
      + (select count(*) from vendors where logo_url is not null))`,
    select: {
      ...GARAGE,
      photo_id: 'p.id::text',
      kind: 'p.kind',
      service_name: 'p.service_name',
      link: 'p.link',
      poster_link: 'p.poster_link',
      made_with_ai: 'p.made_with_ai',
      sort_order: 'p.sort_order',
      added_at: ist('p.created_at'),
    },
  },
  bank: {
    from: `vendors v
      left join vendor_payout_accounts a on a.vendor_id = v.id
      left join garage_payment_details d on d.vendor_id = v.id`,
    cursor: 'v.id',
    count: '(select count(*) from vendors)',
    select: {
      ...GARAGE,
      account_name: 'a.account_name',
      account_number: 'a.account_number',
      ifsc: 'a.ifsc',
      upi_id: 'a.upi_id',
      payout_details_updated_by: 'a.updated_by',
      payout_details_updated_at: ist('a.updated_at'),
      customer_upi_id: 'd.upi_id',
      customer_upi_name: 'd.upi_name',
      customer_pay_phone: 'd.phone',
      customer_pay_apps: `array_to_string(d.apps, '; ')`,
    },
  },
  bookings: {
    from: `bookings b
      join vendors v on v.id = b.vendor_id
      join users u on u.id = b.user_id
      left join user_vehicles uv on uv.id = b.vehicle_id
      left join payments p on p.booking_id = b.id`,
    cursor: 'b.id',
    count: '(select count(*) from bookings)',
    select: {
      ...GARAGE,
      booking_id: 'b.id::text',
      reference: reference('b.id'),
      booked_at: ist('b.created_at'),
      scheduled_at: ist('b.scheduled_at'),
      status: 'b.status::text',
      booking_type: 'b.booking_type::text',
      customer_name: 'case when u.deleted_at is null then u.name end',
      customer_phone: 'case when u.deleted_at is null then u.phone end',
      car: `concat_ws(' ', uv.make, uv.model)`,
      car_plate: 'uv.license_plate',
      address: 'b.address',
      duration_mins: 'b.duration_mins',
      services_total: money('b.subtotal_amount'),
      discount: money('b.discount_amount'),
      discount_code: 'b.discount_code',
      discount_paid_by: 'b.discount_funded_by::text',
      pickup_fee: money('b.travel_fee'),
      road_km: money('b.road_km'),
      convenience_fee: money('b.convenience_fee'),
      amount: money('b.amount'),
      payment_method: 'b.payment_method::text',
      payment_status: 'p.status::text',
      paid_at: ist('p.paid_at'),
      razorpay_payment_id: `case when p.gateway::text = 'razorpay' then p.gateway_txn_id end`,
      completed_at: ist('b.completed_at'),
      cancelled_at: ist('b.cancelled_at'),
      cancelled_by: 'b.cancelled_by::text',
      cancellation_reason: 'b.cancellation_reason',
      no_show: 'b.no_show::text',
      rescheduled_from: 'b.rescheduled_from_id::text',
      free_redo: 'b.guarantee_redo',
      test: 'b.marked_test_at is not null',
    },
  },
  booking_items: {
    from: `booking_items bi
      join bookings b on b.id = bi.booking_id
      join vendors v on v.id = b.vendor_id
      left join services s on s.id = bi.service_id`,
    cursor: 'bi.id',
    count: '(select count(*) from booking_items)',
    select: {
      ...GARAGE,
      booking_id: 'b.id::text',
      reference: reference('b.id'),
      service_id: 'bi.service_id::text',
      name: 'bi.name',
      // As the payouts and Statistics read it: the category it was booked
      // at (0080), or the service's own for a line written before that.
      category: 'coalesce(bi.category, s.category)::text',
      amount: money('bi.amount'),
      duration_mins: 'bi.duration_mins',
      add_on: 'bi.is_addon',
    },
  },
  reviews: {
    from: 'reviews r join vendors v on v.id = r.vendor_id join users u on u.id = r.user_id',
    cursor: 'r.id',
    count: '(select count(*) from reviews)',
    select: {
      ...GARAGE,
      review_id: 'r.id::text',
      booking_id: 'r.booking_id::text',
      reference: reference('r.booking_id'),
      rating: 'r.rating',
      tags: `array_to_string(r.tags, '; ')`,
      comment: 'r.comment',
      customer_name: 'case when u.deleted_at is null then u.name end',
      reply: 'r.reply',
      replied_at: ist('r.replied_at'),
      hidden_at: ist('r.hidden_at'),
      hidden_reason: 'r.hidden_reason',
      created_at: ist('r.created_at'),
    },
  },
  payouts: {
    from: 'vendor_payouts po join vendors v on v.id = po.vendor_id',
    cursor: 'po.id',
    count: '(select count(*) from vendor_payouts)',
    select: {
      ...GARAGE,
      payout_id: 'po.id::text',
      amount: money('po.amount'),
      method: 'po.method',
      reference: 'po.reference',
      paid_at: ist('po.paid_at'),
      covers_from: ist('po.covers_from'),
      covers_up_to: ist('po.covers_up_to'),
      bookings: '(select count(*) from vendor_payout_items i where i.payout_id = po.id)::int',
      note: 'po.note',
      recorded_by: 'po.recorded_by',
      created_at: ist('po.created_at'),
    },
  },
  payout_lines: {
    from: 'vendor_payout_items i join vendor_payouts po on po.id = i.payout_id join vendors v on v.id = po.vendor_id',
    cursor: 'i.id',
    count: '(select count(*) from vendor_payout_items)',
    select: {
      ...GARAGE,
      payout_id: 'po.id::text',
      booking_id: 'i.booking_id::text',
      reference: `'#' || upper(i.booking_ref)`,
      kind: 'i.kind',
      payable_from: ist('i.payable_from'),
      price: money('i.price'),
      detlio_promo: money('i.detlio_promo'),
      garage_promo: money('i.garage_promo'),
      refunds: money('i.refunds'),
      commission: money('i.commission'),
      free_position: 'i.free_position',
      garage_share: money('i.garage_share'),
      held_by_garage: money('i.held_by_garage'),
      amount: money('i.amount'),
    },
  },
  garage_book_customers: {
    from: 'garage_customers gc join vendors v on v.id = gc.vendor_id',
    cursor: 'gc.id',
    count: '(select count(*) from garage_customers)',
    select: {
      ...GARAGE,
      customer_id: 'gc.id::text',
      name: 'gc.name',
      phone: 'gc.phone',
      cars: `(select string_agg(concat_ws(' ', car.plate, car.make, car.model), '; ' order by car.created_at)
        from garage_customer_cars car where car.garage_customer_id = gc.id)`,
      // Pay later jobs owed less what was paid back, as the Garage Book's balance.
      owes: rupeesFromPaise(`(select coalesce(sum(case when gp.kind = 'owed' then gp.amount_paise else -gp.amount_paise end), 0)
        from garage_payments gp where gp.garage_customer_id = gc.id)`),
      note: 'gc.note',
      source_note: 'gc.source_note',
      added_at: ist('gc.created_at'),
      deleted_at: ist('gc.deleted_at'),
    },
  },
  garage_book_bills: {
    from: `garage_jobs j
      join vendors v on v.id = j.vendor_id
      join garage_customers gc on gc.id = j.garage_customer_id
      left join garage_customer_cars car on car.id = j.car_id`,
    cursor: 'j.id',
    count: '(select count(*) from garage_jobs)',
    select: {
      ...GARAGE,
      job_id: 'j.id::text',
      bill_number: '(select min(gb.number) from garage_bills gb where gb.garage_job_id = j.id)',
      date: ist('j.scheduled_at'),
      done_at: ist('j.done_at'),
      status: 'j.status',
      customer_id: 'gc.id::text',
      customer_name: 'gc.name',
      customer_phone: 'gc.phone',
      car_plate: 'car.plate',
      items: `(select string_agg(l.label || ' × ' || l.qty || ' @ ' || ${rupeesFromPaise('l.price_paise')}, '; ' order by l.id)
        from garage_job_lines l where l.job_id = j.id)`,
      total: rupeesFromPaise('j.total_paise'),
      payment_method: 'j.payment_method',
      origin: 'j.origin',
      created_at: ist('j.created_at'),
    },
  },
  garage_book_expenses: {
    from: 'garage_expenses e join vendors v on v.id = e.vendor_id left join garage_team_members m on m.id = e.member_id',
    cursor: 'e.id',
    count: '(select count(*) from garage_expenses)',
    select: {
      ...GARAGE,
      expense_id: 'e.id::text',
      spent_on: `to_char(e.spent_on, 'YYYY-MM-DD')`,
      category: 'e.category',
      amount: rupeesFromPaise('e.amount_paise'),
      method: 'e.method',
      team_member: 'm.name',
      every_month: 'e.every_month',
      note: 'e.note',
      created_at: ist('e.created_at'),
      deleted_at: ist('e.deleted_at'),
    },
  },
  garage_book_stock: {
    from: 'garage_stock_items st join vendors v on v.id = st.vendor_id left join garage_suppliers sp on sp.id = st.supplier_id',
    cursor: 'st.id',
    count: '(select count(*) from garage_stock_items)',
    select: {
      ...GARAGE,
      item_id: 'st.id::text',
      name: 'st.name',
      unit: 'st.unit',
      level: money('st.level'),
      low_at: money('st.low_at'),
      pack_size: money('st.pack_size'),
      pack_price: rupeesFromPaise('st.pack_price_paise'),
      supplier_name: 'sp.name',
      supplier_phone: 'sp.phone',
      added_at: ist('st.created_at'),
      deleted_at: ist('st.deleted_at'),
    },
  },
  documents: {
    from: 'vendor_documents d join vendors v on v.id = d.vendor_id',
    cursor: 'd.id',
    count: '(select count(*) from vendor_documents)',
    select: {
      ...GARAGE,
      document_id: 'd.id::text',
      type: DOCUMENT_TYPE_LABEL,
      status: 'd.status',
      version: 'd.version',
      files: `(select string_agg(f.side || ' (' || f.content_type || ')', ', ' order by f.side)
        from vendor_document_files f where f.document_id = d.id)`,
      expires_on: `to_char(d.expires_on, 'YYYY-MM-DD')`,
      uploaded_by: 'd.uploaded_by',
      submitted_at: ist('d.submitted_at'),
      reviewed_by: 'd.reviewed_by',
      reviewed_at: ist('d.reviewed_at'),
      rejection_reason: 'd.rejection_reason',
      link: ADMIN_DOCUMENTS_LINK,
    },
  },
}

/** The SELECT for one page of a sheet: rows after `after`, in id order, one more than `limit`. */
export function backupPageQuery(source: BackupSource, after: string | null, limit: number): SQL {
  const columns = Object.entries(source.select)
    .map(([key, expression]) => `${expression} as "${key}"`)
    .join(',\n       ')
  const where = after === null ? sql`true` : sql`${sql.raw(source.cursor)} > ${after}::uuid`
  return sql`select ${sql.raw(columns)},
       ${sql.raw(source.cursor)}::text as cursor_id
  from ${sql.raw(source.from)}
 where ${where}
 order by ${sql.raw(source.cursor)}
 limit ${limit + 1}`
}

const num = (value: unknown) => Number(value ?? 0)

type AuditRow = {
  id: string
  actorSub: string
  actorName: string
  detail: unknown
  createdAt: Date
}

function toAudit(row: AuditRow | undefined): BackupAudit | null {
  if (!row) return null
  const detail = (row.detail ?? {}) as { full?: unknown }
  return {
    id: row.id,
    actorSub: row.actorSub,
    actorName: row.actorName,
    full: detail.full === true,
    createdAt: row.createdAt,
  }
}

const AUDIT_COLUMNS = {
  id: adminAuditLog.id,
  actorSub: adminAuditLog.actorSub,
  actorName: adminAuditLog.actorName,
  detail: adminAuditLog.detail,
  createdAt: adminAuditLog.createdAt,
}

export const garageBackupRepository = {
  /**
   * Every sheet's row count, in one statement of scalar sub-selects: one
   * round trip on the one connection, never reads side by side.
   */
  async counts(): Promise<Record<BackupTableKey, number>> {
    const keys = Object.keys(BACKUP_SOURCES) as BackupTableKey[]
    const select = keys.map((key) => `${BACKUP_SOURCES[key].count} as "${key}"`).join(', ')
    const rows = await db.execute<Record<string, unknown>>(sql.raw(`select ${select}`))
    const row = Array.from(rows)[0] ?? {}
    return Object.fromEntries(keys.map((key) => [key, num(row[key])])) as Record<BackupTableKey, number>
  },

  /** One page of a sheet: up to `limit + 1` rows, so the caller knows whether there is more. */
  async page(table: BackupTableKey, after: string | null, limit: number) {
    const rows = await db.execute<Record<string, unknown> & { cursor_id: string }>(
      backupPageQuery(BACKUP_SOURCES[table], after, limit)
    )
    return Array.from(rows)
  },

  /** The newest backup taken, for "Last backup: 14 Nov, 9:12 pm by Mathew". */
  async lastBackup(): Promise<BackupAudit | null> {
    const [row] = await db
      .select(AUDIT_COLUMNS)
      .from(adminAuditLog)
      .where(eq(adminAuditLog.action, BACKUP_AUDIT_ACTION))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(1)
    return toAudit(row)
  },

  async findBackup(id: string): Promise<BackupAudit | null> {
    const [row] = await db
      .select(AUDIT_COLUMNS)
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.id, id), eq(adminAuditLog.action, BACKUP_AUDIT_ACTION)))
      .limit(1)
    return toAudit(row)
  },

  /** The download's record: who, when, and whether full numbers were included. */
  async recordBackup(input: { actorSub: string; actorName: string; full: boolean }) {
    const [row] = await db
      .insert(adminAuditLog)
      .values({
        action: BACKUP_AUDIT_ACTION,
        actorSub: input.actorSub,
        actorName: input.actorName,
        summary: { full: input.full },
        detail: { full: input.full },
      })
      .returning(AUDIT_COLUMNS)
    return toAudit(row)!
  },
}
