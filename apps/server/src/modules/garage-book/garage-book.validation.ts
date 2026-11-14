import { z } from 'zod'
import { CUSTOMER_FILTERS, GARAGE_BOOK_LIMITS, JOB_PAYMENTS, JOB_STATUSES } from '../../lib/garage-book.js'

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
