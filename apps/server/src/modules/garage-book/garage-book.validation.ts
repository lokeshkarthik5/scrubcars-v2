import { z } from 'zod'
import {
  CUSTOMER_FILTERS,
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  GARAGE_BOOK_2_LIMITS,
  GARAGE_BOOK_LIMITS,
  JOB_PAYMENTS,
  JOB_STATUSES,
  PAY_APPS,
  STOCK_UNITS,
} from '../../lib/garage-book.js'
import { PAY_QR_TYPES } from '../../lib/garage-pay-qr-storage.js'

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'A date as YYYY-MM-DD')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'A real date')
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'A month as YYYY-MM')
const name = z.string().trim().min(1).max(GARAGE_BOOK_LIMITS.nameMax)
const note = z.string().trim().max(GARAGE_BOOK_LIMITS.noteMax)
/** An Indian mobile however it was typed; the service keeps ten digits. */
const phone = z.string().trim().max(20)
const short = (max: number) => z.string().trim().max(max)
const paise = z.number().int().min(0).max(GARAGE_BOOK_LIMITS.linePriceMaxRupees * 100)

export const todayQuerySchema = z.object({ date: dateKey.optional() })

export const customerRefParamSchema = z.object({ id: z.string().min(3).max(60) })
export const jobIdParamSchema = z.object({ id: z.string().uuid() })

const carSchema = z
  .object({
    id: z.string().uuid().optional(),
    plate: short(20).optional(),
    make: short(100).optional(),
    model: short(100).optional(),
    colour: short(50).optional(),
    washIntervalDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .strict()

const lineSchema = z
  .object({
    serviceId: z.string().uuid().optional(),
    label: short(GARAGE_BOOK_LIMITS.nameMax).optional(),
    pricePaise: paise.optional(),
    qty: z.number().int().min(1).max(99).default(1),
  })
  .strict()
  .refine((line) => line.serviceId || (line.label && line.label.length > 0 && line.pricePaise !== undefined), {
    message: 'A line is a service from the price list, or a job and its price',
  })

/** `POST /jobs`: a walk-in. `clientId` is made on the phone, so a resend is the same job. */
export const createJobSchema = z
  .object({
    clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'clientId: 8–64 letters, digits, - or _'),
    customer: z.union([
      z.object({ id: z.string().min(3).max(60) }).strict(),
      z
        .object({
          name: name.optional(),
          phone: phone.optional(),
          plate: short(20).optional(),
          make: short(100).optional(),
          model: short(100).optional(),
        })
        .strict(),
    ]),
    carId: z.string().uuid().optional(),
    lines: z.array(lineSchema).min(1).max(GARAGE_BOOK_LIMITS.linesMax),
    scheduledAt: z.string().datetime({ offset: true }),
    status: z.enum(['booked', 'in_progress', 'done']).default('booked'),
    payment: z.enum(JOB_PAYMENTS),
    remindInDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .strict()

export const updateJobSchema = z
  .object({
    status: z.enum(JOB_STATUSES).optional(),
    lines: z.array(lineSchema).min(1).max(GARAGE_BOOK_LIMITS.linesMax).optional(),
    payment: z.enum(JOB_PAYMENTS).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' })

export const customersQuerySchema = z.object({
  filter: z.enum(CUSTOMER_FILTERS).default('all'),
  q: z.string().trim().max(60).optional(),
  due: z.enum(['1', '0']).optional(),
})

export const createCustomerSchema = z
  .object({
    name,
    phone: phone.optional(),
    note: note.optional(),
    cars: z.array(carSchema).max(GARAGE_BOOK_LIMITS.carsMax).optional(),
  })
  .strict()

export const updateCustomerSchema = z
  .object({
    name: name.optional(),
    phone: phone.nullable().optional(),
    note: note.nullable().optional(),
    cars: z.array(carSchema).max(GARAGE_BOOK_LIMITS.carsMax).optional(),
  })
  .strict()

export const reminderMessageSchema = z
  .object({
    message: z.string().max(GARAGE_BOOK_LIMITS.messageMax + 50),
    defaultIntervalDays: z.number().int().min(1).max(365).optional(),
  })
  .strict()

export const markPaidSchema = z
  .object({
    amountPaise: z.number().int().min(100).max(10_000_000),
    method: z.enum(['upi', 'cash']),
  })
  .strict()

export const statsQuerySchema = z.object({
  month: month.optional(),
  filter: z.enum(CUSTOMER_FILTERS).default('all'),
})

export const adminVendorParamSchema = z.object({ id: z.string().uuid() })

export type CreateJobInput = z.infer<typeof createJobSchema>
export type UpdateJobInput = z.infer<typeof updateJobSchema>
export type CustomersQuery = z.infer<typeof customersQuerySchema>
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>
export type ReminderMessageInput = z.infer<typeof reminderMessageSchema>
export type MarkPaidInput = z.infer<typeof markPaidSchema>
export type StatsQuery = z.infer<typeof statsQuerySchema>
export type CarInput = z.infer<typeof carSchema>
export type LineInput = z.infer<typeof lineSchema>

// ─── Stages 2 and 3 (0073) ───────────────────────────────────────────────────

export const idParamSchema = z.object({ id: z.string().uuid() })
export const jobRefParamSchema = z.object({ ref: z.string().min(3).max(60) })
export const monthQuerySchema = z.object({ month: month.optional() })

const role = z.string().trim().max(GARAGE_BOOK_2_LIMITS.roleMax)

export const createMemberSchema = z
  .object({ name, role: role.optional(), phone: phone.optional() })
  .strict()

export const updateMemberSchema = z
  .object({
    name: name.optional(),
    role: role.nullable().optional(),
    phone: phone.nullable().optional(),
    /** "Day off today" on or off. */
    offToday: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' })

export const workersSchema = z
  .object({ memberIds: z.array(z.string().uuid()).max(GARAGE_BOOK_2_LIMITS.teamMax) })
  .strict()

const expensePaise = z.number().int().min(100).max(GARAGE_BOOK_2_LIMITS.expenseMaxRupees * 100)

export const createExpenseSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES),
    amountPaise: expensePaise,
    spentOn: dateKey,
    note: short(GARAGE_BOOK_2_LIMITS.expenseNoteMax).optional(),
    method: z.enum(EXPENSE_METHODS).optional(),
    memberId: z.string().uuid().optional(),
    everyMonth: z.boolean().optional(),
  })
  .strict()

export const updateExpenseSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    amountPaise: expensePaise.optional(),
    spentOn: dateKey.optional(),
    note: short(GARAGE_BOOK_2_LIMITS.expenseNoteMax).nullable().optional(),
    method: z.enum(EXPENSE_METHODS).nullable().optional(),
    memberId: z.string().uuid().nullable().optional(),
    everyMonth: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' })

export const createBillSchema = z.object({ ref: z.string().min(3).max(60) }).strict()

export const billTokenParamSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/) })

export const payQrUploadSchema = z.object({ contentType: z.enum(PAY_QR_TYPES) }).strict()

export const paymentDetailsSchema = z
  .object({
    /** The uploaded QR picture's key; null takes the QR off. */
    qrKey: z.string().max(1024).nullable().optional(),
    /** The phone for payments; null goes back to the garage's own phone. */
    phone: phone.nullable().optional(),
    apps: z.array(z.enum(PAY_APPS)).max(PAY_APPS.length).optional(),
    showOnBills: z.boolean().optional(),
    showOnReminders: z.boolean().optional(),
    showOnBookingPage: z.boolean().optional(),
  })
  .strict()

export const updateLinkSchema = z
  .object({
    active: z.boolean().optional(),
    services: z
      .array(z.object({ serviceId: z.string().uuid(), shown: z.boolean() }).strict())
      .max(200)
      .optional(),
  })
  .strict()

export const slugParamSchema = z.object({ slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).min(3).max(60) })

/** The public booking page's form: no sign-in, no OTP; rate-limited by address and by phone. */
export const linkBookSchema = z
  .object({
    serviceId: z.string().uuid(),
    at: z.string().datetime({ offset: true }),
    name,
    phone: z.string().trim().min(10).max(20),
  })
  .strict()

const importFileSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    dataBase64: z.string().min(1).max(4_000_000),
  })
  .strict()

/**
 * `POST /import/extract`: photos of the paper book (read by the AI), or an
 * Excel, CSV or Tally export (read by fixed rules). Base64 in JSON, like the
 * admin's garage import: the files live in this request's memory only.
 */
export const importExtractSchema = z.discriminatedUnion('source', [
  z
    .object({
      source: z.literal('photos'),
      files: z.array(importFileSchema).min(1).max(GARAGE_BOOK_2_LIMITS.importPhotosMax),
    })
    .strict(),
  z
    .object({
      source: z.literal('sheet'),
      name: z.string().trim().min(1).max(200),
      dataBase64: z.string().min(1).max(4_000_000),
    })
    .strict(),
])

export const importCommitSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            name: short(GARAGE_BOOK_LIMITS.nameMax).nullable().optional(),
            phone: short(40).nullable().optional(),
            plate: short(20).nullable().optional(),
            car: short(100).nullable().optional(),
            lastVisit: dateKey.nullable().optional(),
            owesPaise: z.number().int().min(0).max(100_000_000).nullable().optional(),
          })
          .passthrough()
      )
      .min(1)
      .max(GARAGE_BOOK_2_LIMITS.importRowsMax),
  })
  .strict()

const amount = z.number().min(0).max(GARAGE_BOOK_2_LIMITS.stockAmountMax)

export const createStockSchema = z
  .object({
    name,
    unit: z.enum(STOCK_UNITS),
    level: amount.default(0),
    lowAt: amount.default(0),
    packSize: z.number().positive().max(GARAGE_BOOK_2_LIMITS.stockAmountMax).nullable().optional(),
    packPricePaise: z.number().int().min(0).max(10_000_000).nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
  })
  .strict()

export const updateStockSchema = z
  .object({
    name: name.optional(),
    unit: z.enum(STOCK_UNITS).optional(),
    lowAt: amount.optional(),
    packSize: z.number().positive().max(GARAGE_BOOK_2_LIMITS.stockAmountMax).nullable().optional(),
    packPricePaise: z.number().int().min(0).max(10_000_000).nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' })

export const countStockSchema = z.object({ level: amount }).strict()

export const stockUsageSchema = z
  .array(z.object({ serviceId: z.string().uuid(), amount }).strict())
  .max(200)

export const supplierSchema = z.object({ name, phone: phone.optional() }).strict()

export const updateSupplierSchema = z
  .object({ name: name.optional(), phone: phone.nullable().optional() })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Nothing to change' })

export const supplyOrderSchema = z
  .object({
    supplierId: z.string().uuid(),
    lines: z
      .array(
        z
          .object({
            itemId: z.string().uuid(),
            packs: z.number().int().min(1).max(999),
            packPricePaise: z.number().int().min(0).max(10_000_000).optional(),
          })
          .strict()
      )
      .min(1)
      .max(GARAGE_BOOK_2_LIMITS.orderLinesMax),
  })
  .strict()

export const milestoneKeyParamSchema = z.object({ key: z.string().min(3).max(60) })

export type CreateMemberInput = z.infer<typeof createMemberSchema>
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>
export type PaymentDetailsInput = z.infer<typeof paymentDetailsSchema>
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>
export type LinkBookInput = z.infer<typeof linkBookSchema>
export type ImportExtractInput = z.infer<typeof importExtractSchema>
export type ImportCommitInput = z.infer<typeof importCommitSchema>
export type CreateStockInput = z.infer<typeof createStockSchema>
export type UpdateStockInput = z.infer<typeof updateStockSchema>
export type StockUsageInput = z.infer<typeof stockUsageSchema>
export type SupplierInput = z.infer<typeof supplierSchema>
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>
export type SupplyOrderInput = z.infer<typeof supplyOrderSchema>
