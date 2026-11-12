import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BookFilter } from '../../garage-book'
import {
  addWalkIn,
  getAdminBook,
  getBookCustomer,
  getBookCustomers,
  getBookDay,
  getBookOwed,
  getBookReminders,
  getBookServices,
  getBookStats,
  markOwedPaid,
  saveReminderMessage,
  sendBookReminder,
  updateBookCustomer,
  updateWalkIn,
  type NewWalkIn,
  addExpense,
  addStockItem,
  addSupplier,
  addTeamMember,
  bookOnLink,
  commitBookImport,
  countStockItem,
  extractBookImport,
  getBookExpenses,
  getBookLink,
  getBookStock,
  getBookTeam,
  getMilestone,
  getPaymentDetails,
  getPublicBill,
  getPublicLinkPage,
  getStockItem,
  getSupplyOrders,
  getSupplySuggestions,
  getSuppliers,
  makeBill,
  markMilestoneSeen,
  receiveSupplyOrder,
  removeExpense,
  removeStockItem,
  removeSupplier,
  removeTeamMember,
  savePaymentDetails,
  sendSupplyOrder,
  setJobWorkers,
  setStockUsage,
  updateBookLink,
  updateExpense,
  updateStockItem,
  updateSupplier,
  updateTeamMember,
  type ImportSource,
  type NewExpense,
  type NewStockItem,
  type PaymentDetailsPatch,
} from '../garage-book'

/**
 * Garage Book's queries, shared by the web portal and the native app. Every
 * key starts ['book'], so one write refreshes everything the book shows.
 * `enabled` follows the GARAGE_BOOK switch: off, nothing is asked for.
 */
export const BOOK_KEY = ['book'] as const

export function useBookDay(date: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...BOOK_KEY, 'day', date ?? 'today'],
    queryFn: () => getBookDay(date),
    enabled,
    refetchInterval: 15_000,
  })
}

export function useBookCustomers(params: { filter: BookFilter; q?: string; due?: boolean }, enabled = true) {
  return useQuery({
    queryKey: [...BOOK_KEY, 'customers', params.filter, params.q ?? '', params.due ? 'due' : 'all'],
    queryFn: () => getBookCustomers(params),
    enabled,
    staleTime: 15_000,
  })
}

export function useBookCustomer(id: string | null, enabled = true) {
  return useQuery({
    queryKey: [...BOOK_KEY, 'customer', id ?? 'none'],
    queryFn: () => getBookCustomer(id!),
    enabled: enabled && id !== null,
  })
}

export function useBookServices(enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'services'], queryFn: getBookServices, enabled, staleTime: 5 * 60_000 })
}

export function useBookReminders(enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'reminders'], queryFn: getBookReminders, enabled })
}

export function useBookOwed(enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'owed'], queryFn: getBookOwed, enabled })
}

export function useBookStats(month: string | undefined, filter: BookFilter, enabled = true) {
  return useQuery({
    queryKey: [...BOOK_KEY, 'stats', month ?? 'now', filter],
    queryFn: () => getBookStats(month, filter),
    enabled,
  })
}

export function useAdminBook(vendorId: string | null) {
  return useQuery({
    queryKey: ['admin', 'garage-book', vendorId ?? 'none'],
    queryFn: () => getAdminBook(vendorId!),
    enabled: vendorId !== null,
  })
}

function useRefreshBook() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: BOOK_KEY })
}

export function useAddWalkIn() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (input: NewWalkIn) => addWalkIn(input), onSuccess: refresh })
}

export function useUpdateWalkIn() {
  const refresh = useRefreshBook()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateWalkIn>[1] }) => updateWalkIn(id, patch),
    onSuccess: refresh,
  })
}

export function useUpdateBookCustomer() {
  const refresh = useRefreshBook()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateBookCustomer>[1] }) => updateBookCustomer(id, patch),
    onSuccess: refresh,
  })
}

export function useSendReminder() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (customerId: string) => sendBookReminder(customerId), onSuccess: refresh })
}

export function useSaveReminderMessage() {
  const refresh = useRefreshBook()
  return useMutation({
    mutationFn: ({ message, defaultIntervalDays }: { message: string; defaultIntervalDays?: number }) =>
      saveReminderMessage(message, defaultIntervalDays),
    onSuccess: refresh,
  })
}

export function useMarkPaid() {
  const refresh = useRefreshBook()
  return useMutation({
    mutationFn: ({ customerId, amountPaise, method }: { customerId: string; amountPaise: number; method: 'upi' | 'cash' }) =>
      markOwedPaid(customerId, amountPaise, method),
    onSuccess: refresh,
  })
}

// ─── Stages 2 and 3 (0073) ───────────────────────────────────────────────────
//
// Garage queries live under ['book'] like Stage 1's, so any write refreshes
// the lot (a finished job changes the team, the stock and the day at once).
// The two public pages (a bill, a booking page) have their own keys and no
// sign-in.

export function useBookTeam(month: string | undefined, enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'team', month ?? 'now'], queryFn: () => getBookTeam(month), enabled })
}

export function useAddTeamMember() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: addTeamMember, onSuccess: refresh })
}

export function useUpdateTeamMember() {
  const refresh = useRefreshBook()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateTeamMember>[1] }) => updateTeamMember(id, patch),
    onSuccess: refresh,
  })
}

export function useRemoveTeamMember() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (id: string) => removeTeamMember(id), onSuccess: refresh })
}

/** "Who did it?" on a job: `ref` is jobRef(job). */
export function useSetJobWorkers() {
  const refresh = useRefreshBook()
  return useMutation({
    mutationFn: ({ ref, memberIds }: { ref: string; memberIds: string[] }) => setJobWorkers(ref, memberIds),
    onSuccess: refresh,
  })
}

export function useBookExpenses(month: string | undefined, enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'expenses', month ?? 'now'], queryFn: () => getBookExpenses(month), enabled })
}

export function useAddExpense() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (input: NewExpense) => addExpense(input), onSuccess: refresh })
}

export function useUpdateExpense() {
  const refresh = useRefreshBook()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateExpense>[1] }) => updateExpense(id, patch),
    onSuccess: refresh,
  })
}

export function useRemoveExpense() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (id: string) => removeExpense(id), onSuccess: refresh })
}

/** The bill for a job, made the first time (owner). */
export function useMakeBill() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (ref: string) => makeBill(ref), onSuccess: refresh })
}

/** The public bill page: no sign-in. */
export function usePublicBill(token: string | null) {
  return useQuery({
    queryKey: ['public-bill', token ?? 'none'],
    queryFn: () => getPublicBill(token!),
    enabled: token !== null,
    retry: false,
  })
}

export function usePaymentDetails(enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'payment-details'], queryFn: getPaymentDetails, enabled })
}

export function useSavePaymentDetails() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (patch: PaymentDetailsPatch) => savePaymentDetails(patch), onSuccess: refresh })
}

export function useBookLink(enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'link'], queryFn: getBookLink, enabled })
}

export function useUpdateBookLink() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (patch: Parameters<typeof updateBookLink>[0]) => updateBookLink(patch), onSuccess: refresh })
}

/** The public booking page: no sign-in. */
export function usePublicLinkPage(slug: string | null) {
  return useQuery({
    queryKey: ['public-link', slug ?? 'none'],
    queryFn: () => getPublicLinkPage(slug!),
    enabled: slug !== null,
    retry: false,
  })
}

export function useBookOnLink(slug: string) {
  return useMutation({ mutationFn: (input: Parameters<typeof bookOnLink>[1]) => bookOnLink(slug, input) })
}

export function useExtractBookImport() {
  return useMutation({ mutationFn: (input: ImportSource) => extractBookImport(input) })
}

export function useCommitBookImport() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (rows: Parameters<typeof commitBookImport>[0]) => commitBookImport(rows), onSuccess: refresh })
}

export function useBookStock(enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'stock'], queryFn: getBookStock, enabled })
}

export function useStockItem(id: string | null, enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'stock', id ?? 'none'], queryFn: () => getStockItem(id!), enabled: enabled && id !== null })
}

export function useAddStockItem() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (input: NewStockItem) => addStockItem(input), onSuccess: refresh })
}

export function useUpdateStockItem() {
  const refresh = useRefreshBook()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateStockItem>[1] }) => updateStockItem(id, patch),
    onSuccess: refresh,
  })
}

export function useRemoveStockItem() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (id: string) => removeStockItem(id), onSuccess: refresh })
}

/** "Count it": any seat. */
export function useCountStock() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: ({ id, level }: { id: string; level: number }) => countStockItem(id, level), onSuccess: refresh })
}

export function useSetStockUsage() {
  const refresh = useRefreshBook()
  return useMutation({
    mutationFn: ({ id, rows }: { id: string; rows: Array<{ serviceId: string; amount: number }> }) => setStockUsage(id, rows),
    onSuccess: refresh,
  })
}

export function useSuppliers(enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'suppliers'], queryFn: getSuppliers, enabled })
}

export function useAddSupplier() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: addSupplier, onSuccess: refresh })
}

export function useUpdateSupplier() {
  const refresh = useRefreshBook()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateSupplier>[1] }) => updateSupplier(id, patch),
    onSuccess: refresh,
  })
}

export function useRemoveSupplier() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (id: string) => removeSupplier(id), onSuccess: refresh })
}

export function useSupplyOrders(enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'supply-orders'], queryFn: getSupplyOrders, enabled })
}

export function useSendSupplyOrder() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (input: Parameters<typeof sendSupplyOrder>[0]) => sendSupplyOrder(input), onSuccess: refresh })
}

export function useReceiveSupplyOrder() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (id: string) => receiveSupplyOrder(id), onSuccess: refresh })
}

export function useSupplySuggestions(enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'supply-suggest'], queryFn: getSupplySuggestions, enabled })
}

/** Moment 6: the milestone card to show once (owner). */
export function useMilestone(enabled = true) {
  return useQuery({ queryKey: [...BOOK_KEY, 'milestone'], queryFn: getMilestone, enabled, staleTime: 5 * 60_000 })
}

export function useMarkMilestoneSeen() {
  const refresh = useRefreshBook()
  return useMutation({ mutationFn: (key: string) => markMilestoneSeen(key), onSuccess: refresh })
}
