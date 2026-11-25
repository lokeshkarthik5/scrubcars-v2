import type { GoogleRating } from '../ratings'
import { apiClient, apiDownload } from './client'
import type { BookFilter, ExpenseCategory, ExpenseMethod, JobOrigin, JobPayment, JobStatus, PayApp, StockUnit } from '../garage-book'

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
  /** 0074: where it came from; 'link' shows "From your link". Absent from older servers. */
  origin?: JobOrigin
  /** 0074: who is on it (Today's list only). */
  workers?: TeamWorker[]
  /** 0074, owner only: it just became done and came back after a reminder (moment 5). */
  reminderPaidBack?: { amountPaise: number }
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
  /** What the job took: its payment plus a final bill paid in the app. Owner only. */
  amount?: string
  /** 0074: who is on it (Today's list only). */
  workers?: TeamWorker[]
  /** An inspection with no fee (0073): its bill once sent; null otherwise. Owner only; absent from older servers. */
  noFeeInspection?: NoFeeInspectionJob | null
}

/** A no-fee inspection job's final bill, as the book reads it (0073). */
export interface NoFeeInspectionJob {
  billTotal: string | null
  billPaid: boolean
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
    /** A Detlio job: an inspection with no fee (0073), its bill once sent. Owner only. */
    noFeeInspection?: NoFeeInspectionJob | null
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
  /** 0074, moment 5 (owner only): what visits after a reminder came to this month. */
  earnedThisMonthPaise?: number
  /** 0074, moment 5: how many came back after a reminder this month. */
  cameBack?: number
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
  /** 0074: "Pay on GPay/PhonePe 98400 00000" for Ask on WhatsApp, when the garage shows it on reminders. */
  payLine?: string | null
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
  /** 0074: what was spent this month; null with no expense written down (then profit is null too). */
  spentPaise?: number | null
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

/** What a garage types to add a customer of its own (POST /customers): a name, the rest optional. */
export interface NewBookCustomer {
  name: string
  phone?: string
  note?: string
  cars?: Array<{ plate?: string; make?: string; model?: string }>
}

/** Adds a customer with no job yet (the Customers tab's "+ Add"). 409 CUSTOMER_PHONE_TAKEN for a number already saved. */
export function createBookCustomer(input: NewBookCustomer): Promise<BookCustomer> {
  return apiClient(`${BASE}/customers`, { method: 'POST', ...json(input) })
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
  /** 0074: counts only. */
  team?: { members: number }
  expenses?: { month: string; count: number; spentPaise: number }
  stock?: { items: number; low: number }
}

export function getAdminBook(vendorId: string): Promise<AdminBook> {
  return apiClient(`/admin/vendors/${vendorId}/book`)
}

// ─── Stages 2 and 3 (0074) ───────────────────────────────────────────────────
//
// Money (any `*Paise`, a supplier, a price) is there for the owner only, as
// above. Owner-only endpoints say so; the rest any seat may call.

export interface TeamWorker {
  id: string
  name: string
}

export interface TeamMember {
  id: string
  name: string
  role: string | null
  phone: string | null
  offToday: boolean
  /** Finished jobs this month. */
  jobs: number
  jobsToday: number
  /** The job they are on now: the car and the first service. */
  onNow: { ref: string; plate: string | null; car: string | null; service: string | null } | null
  valuePaise?: number
  advancePaise?: number
  salaryPaise?: number
}

export interface BookTeam {
  month: string
  members: TeamMember[]
  /** Everyone not off today. */
  atWork: number
  jobsTodayTotal: number
}

export interface BookExpense {
  id: string
  category: ExpenseCategory
  amountPaise: number
  spentOn: string
  note: string | null
  method: ExpenseMethod | null
  member: TeamWorker | null
  everyMonth: boolean
  /** Written by "Received" on a supply order. */
  fromOrder: { id: string; supplier: string | null } | null
}

export interface BookExpenses {
  month: string
  expenses: BookExpense[]
  totals: Record<ExpenseCategory, number>
  spentPaise: number
  /** The whole garage's takings, as Stats counts them. */
  takenPaise: number
  profitPaise: number
}

export interface NewExpense {
  category: ExpenseCategory
  amountPaise: number
  spentOn: string
  note?: string
  method?: ExpenseMethod
  memberId?: string
  everyMonth?: boolean
}

/** The garage's payment details as a bill, a reminder or the booking page shows them. */
export interface ShownPay {
  qrUrl: string | null
  upiId: string | null
  upiName: string | null
  phone: string | null
  apps: PayApp[]
  appsText: string
  line: string | null
}

export interface BillSnapshot {
  number: number
  source: 'own' | 'detlio'
  date: string
  garage: { name: string; address: string; phone: string | null; gstin: string | null }
  /** Never a phone number. */
  customer: { firstName: string; plate: string | null; car: string | null }
  lines: Array<{ label: string; qty: number; pricePaise: number }>
  totalPaise: number
  paid: boolean
  method: 'upi' | 'cash' | 'online' | 'later' | null
  nextWashDue: string | null
}

/** `POST /bills` (owner): made the first time, the same bill after. */
export interface BookBill {
  id: string
  ref: string
  number: number
  numberText: string
  token: string
  shareUrl: string
  /** The garage's own customer with a mobile only; never for a Detlio customer. */
  whatsappUrl: string | null
  message: string
  snapshot: BillSnapshot
  pay: ShownPay | null
  madeWith: string
  createdAt: string
  created: boolean
}

/** The public bill page (/b/<token>). */
export type PublicBill = BillSnapshot & { numberText: string; pay: ShownPay | null; madeWith: string }

export interface PaymentDetails {
  set: boolean
  qrUrl: string | null
  qrKey: string | null
  upiId: string | null
  upiName: string | null
  /** 'unreadable': a QR picture is saved but couldn't be read: ask the owner to check it. */
  qrRead: 'read' | 'unreadable' | null
  phone: string | null
  phoneIsGarage: boolean
  apps: PayApp[]
  showOnBills: boolean
  showOnReminders: boolean
  showOnBookingPage: boolean
  updatedAt: string | null
}

export interface PaymentDetailsPatch {
  qrKey?: string | null
  phone?: string | null
  apps?: PayApp[]
  showOnBills?: boolean
  showOnReminders?: boolean
  showOnBookingPage?: boolean
}

export interface BookLink {
  slug: string
  url: string
  active: boolean
  bookingsThisMonth: number
  commissionPaise: 0
  services: Array<{ id: string; name: string; pricePaise: number; durationMins: number | null; isAddon: boolean; shown: boolean }>
}

export interface PublicLinkPage {
  garage: {
    name: string
    area: string
    openNow: boolean
    rating: number | null
    reviewCount: number
    /** Google's rating while it is the main one (21 Nov 2026), shown in place of Detlio's. Absent from an older API. */
    google?: GoogleRating | null
  }
  services: Array<{ id: string; name: string; durationMins: number | null; pricePaise: number }>
  /** The next open days, each with its start times (ISO instants). */
  days: Array<{ date: string; times: string[] }>
  pay: { phone: string | null; apps: PayApp[]; appsText: string; upiId: string | null } | null
}

export type LinkBookResult =
  | { detlio: true; url: string }
  | { detlio: false; booked: { garage: string; service: string; at: string; pricePaise: number } }

export interface ImportRow {
  name: string | null
  phone: string | null
  plate: string | null
  car: string | null
  lastVisit: string | null
  owesPaise: number | null
  unsure: string[]
  note: string | null
  /** A customer already in the book with this phone (or plate). */
  match: { customerId: string; name: string; by: 'phone' | 'plate' } | null
}

export interface ImportExtract {
  rows: ImportRow[]
  counts: { customers: number; cars: number; unsure: number }
}

export type ImportSource =
  | { source: 'photos'; files: Array<{ name: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'; dataBase64: string }> }
  | { source: 'sheet'; name: string; dataBase64: string }

export interface StockItem {
  id: string
  name: string
  unit: StockUnit
  level: number
  lowAt: number
  packSize: number | null
  /** 0–1, for the dial. */
  share: number
  low: boolean
  /** "About N washes"; null when no service uses it. */
  jobsLeft: number | null
  usedThisMonth: number
  jobsThisMonth: number
  supplier?: { id: string; name: string } | null
  packPricePaise?: number | null
}

export interface BookStock {
  items: StockItem[]
  lowCount: number
  lowNames: string[]
}

export interface StockMove {
  id: string
  kind: 'used' | 'counted' | 'received' | 'manual'
  delta: number
  levelAfter: number
  jobRef: string | null
  orderId: string | null
  by: { id: string; name: string | null } | null
  at: string
}

export interface StockItemDetail {
  item: StockItem
  usage: Array<{ serviceId: string; name: string; isAddon: boolean; amount: number }>
  moves: StockMove[]
}

export interface NewStockItem {
  name: string
  unit: StockUnit
  level?: number
  lowAt?: number
  packSize?: number | null
  packPricePaise?: number | null
  supplierId?: string | null
}

export interface Supplier {
  id: string
  name: string
  phone: string | null
  lastOrderAt: string | null
}

export interface SupplyOrderLine {
  itemId: string
  name: string
  packs: number
  packSize: number | null
  unit: StockUnit
  packPricePaise: number
}

export interface SupplyOrder {
  id: string
  supplier: { id: string; name: string }
  status: 'sent' | 'received' | 'cancelled'
  lines: SupplyOrderLine[]
  totalPaise: number
  sentAt: string
  receivedAt: string | null
  expenseId: string | null
}

export interface SupplySuggestions {
  groups: Array<{
    supplier: Supplier | null
    lines: Array<{ itemId: string; name: string; unit: StockUnit; level: number; packSize: number | null; packPricePaise: number | null; packs: number }>
    totalPaise: number
  }>
}

export type Milestone =
  | { key: string; kind: 'customers'; value: number; next: { kind: 'customers' | 'lakh_month'; value: number } | null; since: string | null }
  | { key: string; kind: 'lakh_month'; value: number; month: string; next: { kind: 'lakh_month'; value: number } | null; since: string | null }
  | { key: string; kind: 'best_month'; month: string; takenPaise: number; previousBestPaise: number; next: null; since: string | null }

/** Who did a job's ref: "own:<id>" for a walk-in, "detlio:<id>" for a Detlio booking. */
export function jobRef(job: { source: 'own' | 'detlio'; id: string }): string {
  return `${job.source}:${job.id}`
}

// Team
export function getBookTeam(month?: string): Promise<BookTeam> {
  return apiClient(`${BASE}/team`, { params: { month } })
}
export function addTeamMember(input: { name: string; role?: string; phone?: string }) {
  return apiClient<Pick<TeamMember, 'id' | 'name' | 'role' | 'phone' | 'offToday'>>(`${BASE}/team`, { method: 'POST', ...json(input) })
}
export function updateTeamMember(id: string, patch: { name?: string; role?: string | null; phone?: string | null; offToday?: boolean }) {
  return apiClient<Pick<TeamMember, 'id' | 'name' | 'role' | 'phone' | 'offToday'>>(`${BASE}/team/${id}`, { method: 'PATCH', ...json(patch) })
}
export function removeTeamMember(id: string) {
  return apiClient<{ id: string; deleted: true }>(`${BASE}/team/${id}`, { method: 'DELETE' })
}
/** "Who did it?": the whole set at once; [] clears it. Any seat. */
export function setJobWorkers(ref: string, memberIds: string[]) {
  return apiClient<{ ref: string; workers: TeamWorker[] }>(`${BASE}/jobs/${encodeURIComponent(ref)}/workers`, {
    method: 'PUT',
    ...json({ memberIds }),
  })
}

// Expenses (owner)
export function getBookExpenses(month?: string): Promise<BookExpenses> {
  return apiClient(`${BASE}/expenses`, { params: { month } })
}
export function addExpense(input: NewExpense): Promise<BookExpense> {
  return apiClient(`${BASE}/expenses`, { method: 'POST', ...json(input) })
}
export function updateExpense(
  id: string,
  patch: Partial<Omit<NewExpense, 'note' | 'method' | 'memberId'>> & { note?: string | null; method?: ExpenseMethod | null; memberId?: string | null }
): Promise<BookExpense> {
  return apiClient(`${BASE}/expenses/${id}`, { method: 'PATCH', ...json(patch) })
}
export function removeExpense(id: string) {
  return apiClient<{ id: string; deleted: true }>(`${BASE}/expenses/${id}`, { method: 'DELETE' })
}

// Bills (owner) and the public bill page
export function makeBill(ref: string): Promise<BookBill> {
  return apiClient(`${BASE}/bills`, { method: 'POST', ...json({ ref }) })
}
export function getPublicBill(token: string): Promise<PublicBill> {
  return apiClient(`/public/bills/${encodeURIComponent(token)}`, { auth: false })
}

// Payment details (owner)
export function getPaymentDetails(): Promise<PaymentDetails> {
  return apiClient(`${BASE}/payment-details`)
}
/** A presigned upload for the QR picture (PNG or JPEG, re-encoded in the app first); save its key with savePaymentDetails. */
export function getPayQrUpload(contentType: 'image/png' | 'image/jpeg') {
  return apiClient<{ uploadUrl: string; key: string }>(`${BASE}/payment-details/qr/upload`, { method: 'POST', ...json({ contentType }) })
}
export function savePaymentDetails(patch: PaymentDetailsPatch): Promise<PaymentDetails> {
  return apiClient(`${BASE}/payment-details`, { method: 'PUT', ...json(patch) })
}

// Booking link (owner) and the public booking page
export function getBookLink(): Promise<BookLink> {
  return apiClient(`${BASE}/link`)
}
export function updateBookLink(patch: { active?: boolean; services?: Array<{ serviceId: string; shown: boolean }> }): Promise<BookLink> {
  return apiClient(`${BASE}/link`, { method: 'PUT', ...json(patch) })
}
export function getPublicLinkPage(slug: string): Promise<PublicLinkPage> {
  return apiClient(`/public/g/${encodeURIComponent(slug)}`, { auth: false })
}
export function bookOnLink(slug: string, input: { serviceId: string; at: string; name: string; phone: string }): Promise<LinkBookResult> {
  return apiClient(`/public/g/${encodeURIComponent(slug)}/book`, { method: 'POST', auth: false, ...json(input) })
}

// Bring in your book (owner)
export function extractBookImport(input: ImportSource): Promise<ImportExtract> {
  return apiClient(`${BASE}/import/extract`, { method: 'POST', ...json(input) })
}
export function commitBookImport(rows: Array<Pick<ImportRow, 'name' | 'phone' | 'plate' | 'car' | 'lastVisit' | 'owesPaise'>>) {
  return apiClient<{ added: number; merged: number; skipped: number }>(`${BASE}/import/commit`, { method: 'POST', ...json({ rows }) })
}

// Stock (levels and Count it: any seat; the rest owner)
export function getBookStock(): Promise<BookStock> {
  return apiClient(`${BASE}/stock`)
}
export function getStockItem(id: string): Promise<StockItemDetail> {
  return apiClient(`${BASE}/stock/${id}`)
}
export function addStockItem(input: NewStockItem): Promise<StockItem> {
  return apiClient(`${BASE}/stock`, { method: 'POST', ...json(input) })
}
export function updateStockItem(id: string, patch: Partial<Omit<NewStockItem, 'level'>>): Promise<StockItem> {
  return apiClient(`${BASE}/stock/${id}`, { method: 'PATCH', ...json(patch) })
}
export function removeStockItem(id: string) {
  return apiClient<{ id: string; deleted: true }>(`${BASE}/stock/${id}`, { method: 'DELETE' })
}
export function countStockItem(id: string, level: number): Promise<StockItem> {
  return apiClient(`${BASE}/stock/${id}/count`, { method: 'POST', ...json({ level }) })
}
export function setStockUsage(id: string, rows: Array<{ serviceId: string; amount: number }>): Promise<StockItemDetail> {
  return apiClient(`${BASE}/stock/${id}/usage`, { method: 'PUT', ...json(rows) })
}

// Suppliers and supply orders (owner)
export function getSuppliers(): Promise<Supplier[]> {
  return apiClient(`${BASE}/suppliers`)
}
export function addSupplier(input: { name: string; phone?: string }): Promise<Supplier> {
  return apiClient(`${BASE}/suppliers`, { method: 'POST', ...json(input) })
}
export function updateSupplier(id: string, patch: { name?: string; phone?: string | null }): Promise<Supplier> {
  return apiClient(`${BASE}/suppliers/${id}`, { method: 'PATCH', ...json(patch) })
}
export function removeSupplier(id: string) {
  return apiClient<{ id: string; deleted: true }>(`${BASE}/suppliers/${id}`, { method: 'DELETE' })
}
export function getSupplyOrders(): Promise<SupplyOrder[]> {
  return apiClient(`${BASE}/supplies/orders`)
}
/** Writes the order as sent and gives the WhatsApp to open (null when the supplier has no mobile). */
export function sendSupplyOrder(input: { supplierId: string; lines: Array<{ itemId: string; packs: number; packPricePaise?: number }> }) {
  return apiClient<{ order: SupplyOrder; message: string; whatsappUrl: string | null }>(`${BASE}/supplies/orders`, {
    method: 'POST',
    ...json(input),
  })
}
/** Adds the stock and the bill to Expenses, once (`added: false` on a second tap). */
export function receiveSupplyOrder(id: string) {
  return apiClient<{ order: SupplyOrder; added: boolean }>(`${BASE}/supplies/orders/${id}/received`, { method: 'POST' })
}
export function getSupplySuggestions(): Promise<SupplySuggestions> {
  return apiClient(`${BASE}/supplies/suggest`)
}

// Milestones (moment 6, owner)
export function getMilestone(): Promise<{ milestone: Milestone | null }> {
  return apiClient(`${BASE}/milestones`)
}
export function markMilestoneSeen(key: string) {
  return apiClient<{ key: string; seen: true }>(`${BASE}/milestones/${encodeURIComponent(key)}/seen`, { method: 'POST' })
}
