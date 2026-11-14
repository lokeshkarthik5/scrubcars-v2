import { apiClient, apiDownload } from './client'
import type { BookFilter, JobPayment, JobStatus } from '../garage-book'

/**
 * Garage Book's API (0072): /vendors/me/book. Money figures (`*Paise`,
 * `amount`) are present for the owner seat only; staff get them left out,
 * so every one is optional here. A Detlio customer's `phone` is always null.
 */

export interface BookCar {
  id?: string
  plate: string | null
  make: string | null
  model: string | null
  colour?: string | null
}

export interface OwnJob {
  source: 'own'
  id: string
  clientId: string
  customerId: string
  name: string
  scheduledAt: string
  status: JobStatus
  doneAt: string | null
  car: (BookCar & { id: string }) | null
  lines: Array<{ serviceId: string | null; label: string; qty: number; pricePaise?: number }>
  payment: JobPayment
  remindInDays: number | null
  visitNumber: number
  totalPaise?: number
  /** Native only: saved on the phone with no signal, not sent yet. */
  pending?: boolean
}

export interface DetlioJob {
  source: 'detlio'
  id: string
  customerId: string
  name: string
  scheduledAt: string
  status: string
  bookingType: string
  durationMins: number
  paymentMethod: string
  completedAt: string | null
  car: BookCar
  lines: Array<{ label: string }>
  amount?: string
}

export type BookJob = OwnJob | DetlioJob

export interface BookDay {
  date: string
  jobs: BookJob[]
  counts: { all: number; detlio: number; own: number }
  allDone: boolean
  lastStartsAt: string | null
  taken?: { ownPaise: number; detlioPaise: number; upiPaise: number; cashPaise: number; totalPaise: number }
  closing?: { jobsDone: number; owing: Array<{ customerId: string; name: string; amountPaise: number }> }
}

export type DueState = 'none' | 'ok' | 'due_soon' | 'due_today' | 'overdue'

export interface BookCustomerRow {
  id: string
  source: 'own' | 'detlio'
  viaDetlio: boolean
  name: string
  phone: string | null
  cars: BookCar[]
  lastVisitAt: string | null
  visits: number
  remindedAt: string | null
  due: { state: DueState; dueOn: string | null; daysSince: number | null; intervalDays: number | null }
  spentPaise?: number
  owesPaise?: number
}

export interface BookCustomers {
  customers: BookCustomerRow[]
  counts: { all: number; detlio: number; own: number }
  dueCount: number
}

export interface CarWash {
  lastVisitAt: string | null
  daysSinceWash: number | null
  intervalDays: number
  dueOn: string | null
  dueState: DueState
}

export interface BookCustomer {
  id: string
  source: 'own' | 'detlio'
  viaDetlio: boolean
  name: string
  phone: string | null
  note: string | null
  since: string
  cars: Array<BookCar & { id: string; washIntervalDays: number | null; wash: CarWash }>
  visits: number
  spentPaise?: number
  owesPaise?: number
  history: Array<{
    source: 'own' | 'detlio'
    id: string
    at: string
    status: string
    lines: string[]
    payment: string
    amountPaise?: number
  }>
}

export interface ReminderEntry {
  customerId: string
  source: 'own' | 'detlio'
  name: string
  car: BookCar | null
  lastVisitAt: string | null
  daysSince: number | null
  intervalDays: number | null
  dueOn: string | null
  dueState: DueState
  channel: 'whatsapp' | 'detlio_push'
  canSend: boolean
  sentAt: string | null
}

export interface BookReminders {
  message: string
  defaultIntervalDays: number
  due: ReminderEntry[]
  week: ReminderEntry[]
}

export type ReminderSent =
  | { channel: 'whatsapp'; url: string; message: string; sentAt: string }
  | { channel: 'detlio_push'; sentAt: string }

export interface BookOwed {
  totalPaise: number
  oldestAt: string | null
  customers: Array<{
    customerId: string
    name: string
    phone: string | null
    balancePaise: number
    jobs: number
    lastLabel: string | null
    oldestAt: string | null
  }>
  recent: Array<{ name: string; amountPaise: number; method: 'upi' | 'cash' | null; at: string }>
}

export interface BookStats {
  month: string
  filter: BookFilter
  takenPaise: number
  split: { ownPaise: number; detlioPaise: number }
  changePercent: number | null
  cameBackPercent: number | null
  newCustomers: number
  newFromDetlio: number
  profitPaise: number | null
  owedPaise: number
  owedCustomers: number
  busiestDays: number[]
}

export interface NewWalkIn {
  clientId: string
  customer: { id: string } | { name?: string; phone?: string; plate?: string; make?: string; model?: string }
  carId?: string
  lines: Array<{ serviceId?: string; label?: string; pricePaise?: number; qty?: number }>
  scheduledAt: string
  status?: 'booked' | 'in_progress' | 'done'
  payment: JobPayment
  remindInDays?: number | null
}

const BASE = '/vendors/me/book'
const json = (body: unknown) => ({ body: JSON.stringify(body) })

export function getBookDay(date?: string): Promise<BookDay> {
  return apiClient<BookDay>(`${BASE}/today`, { params: { date } })
}

export interface BookService {
  id: string
  name: string
  pricePaise: number
  durationMins: number | null
  isAddon: boolean
}

export function getBookServices(): Promise<BookService[]> {
  return apiClient(`${BASE}/services`)
}

export function addWalkIn(input: NewWalkIn): Promise<OwnJob & { created: boolean }> {
  return apiClient(`${BASE}/jobs`, { method: 'POST', ...json(input) })
}

export function updateWalkIn(
  id: string,
  patch: Partial<{ status: JobStatus; payment: JobPayment; scheduledAt: string; lines: NewWalkIn['lines'] }>
): Promise<OwnJob> {
  return apiClient(`${BASE}/jobs/${id}`, { method: 'PATCH', ...json(patch) })
}

export function getBookCustomers(params: { filter?: BookFilter; q?: string; due?: boolean } = {}): Promise<BookCustomers> {
  return apiClient(`${BASE}/customers`, {
    params: { filter: params.filter, q: params.q || undefined, due: params.due ? '1' : undefined },
  })
}

export function getBookCustomer(id: string): Promise<BookCustomer> {
  return apiClient(`${BASE}/customers/${encodeURIComponent(id)}`)
}

export function updateBookCustomer(
  id: string,
  patch: Partial<{ name: string; phone: string | null; note: string | null; cars: Array<BookCar & { washIntervalDays?: number | null }> }>
): Promise<BookCustomer> {
  return apiClient(`${BASE}/customers/${encodeURIComponent(id)}`, { method: 'PATCH', ...json(patch) })
}

export function getBookReminders(): Promise<BookReminders> {
  return apiClient(`${BASE}/reminders`)
}

export function saveReminderMessage(message: string, defaultIntervalDays?: number) {
  return apiClient<{ message: string; defaultIntervalDays: number }>(`${BASE}/reminders/message`, {
    method: 'PUT',
    ...json({ message, ...(defaultIntervalDays ? { defaultIntervalDays } : {}) }),
  })
}

export function sendBookReminder(customerId: string): Promise<ReminderSent> {
  return apiClient(`${BASE}/reminders/${encodeURIComponent(customerId)}/send`, { method: 'POST' })
}

export function getBookOwed(): Promise<BookOwed> {
  return apiClient(`${BASE}/owed`)
}

export function markOwedPaid(customerId: string, amountPaise: number, method: 'upi' | 'cash'): Promise<BookOwed> {
  return apiClient(`${BASE}/owed/${encodeURIComponent(customerId)}/paid`, { method: 'POST', ...json({ amountPaise, method }) })
}

export function getBookStats(month?: string, filter: BookFilter = 'all'): Promise<BookStats> {
  return apiClient(`${BASE}/stats`, { params: { month, filter } })
}

/** The book as an Excel file's bytes (owner only). */
export function downloadBook(): Promise<ArrayBuffer> {
  return apiDownload(`${BASE}/export.xlsx`)
}

/** Detlio staff's read-only view of one garage's book. */
export interface AdminBook {
  vendor: { id: string; name: string }
  counts: { all: number; detlio: number; own: number }
  customers: BookCustomerRow[]
  jobs: OwnJob[]
  owed: BookOwed
  stats: BookStats
}

export function getAdminBook(vendorId: string): Promise<AdminBook> {
  return apiClient(`/admin/vendors/${vendorId}/book`)
}
