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
