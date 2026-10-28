'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changeOwnAdminPassword,
  createAdminLogin,
  getAdminMe,
  listAdminLogins,
  resetAdminLoginPassword,
  setAdminLoginStatus,
  updateAdminLogin,
  type AdminLogin,
  type AdminLoginList,
  type AdminLoginStatus,
  type CreateAdminLoginInput,
  type UpdateAdminLoginInput,
} from '@repo/core/api/admin'

/** Who is signed in, and the team's logins (0058). */
export const adminLoginKeys = {
  me: ['admin-me'] as const,
  list: ['admin-logins'] as const,
}

/**
 * The signed-in admin: the name every action is signed with. AdminScope's
 * session check fills the same key, so a page reading this rarely waits.
 * Who you are does not change within a session, so it is not refetched on
 * focus.
 */
export function useAdminMe(enabled = true) {
  return useQuery({
    queryKey: adminLoginKeys.me,
    queryFn: getAdminMe,
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

/** Settings → Team logins: every personal login, and which one is yours. */
export function useAdminLogins() {
  return useQuery({
    queryKey: adminLoginKeys.list,
    queryFn: listAdminLogins,
  })
}

/** A changed or added login, put into the list without waiting for a reload. */
function usePutLogin() {
  const queryClient = useQueryClient()
  return (login: AdminLogin) => {
    queryClient.setQueryData<AdminLoginList>(adminLoginKeys.list, (list) => {
      if (!list) return list
      const others = list.logins.filter((row) => row.id !== login.id)
      const at = list.logins.findIndex((row) => row.id === login.id)
      if (at === -1) return { ...list, logins: [...list.logins, login] }
      others.splice(at, 0, login)
      return { ...list, logins: others }
    })
    void queryClient.invalidateQueries({ queryKey: adminLoginKeys.list })
  }
}

export function useCreateAdminLogin() {
  const put = usePutLogin()
  return useMutation({
    mutationFn: (input: CreateAdminLoginInput) => createAdminLogin(input),
    onSuccess: put,
  })
}

export function useResetAdminLoginPassword() {
  const put = usePutLogin()
  return useMutation({
    mutationFn: (input: { id: string; password: string }) => resetAdminLoginPassword(input.id, input.password),
    onSuccess: put,
  })
}

/** A login's phone (0059), for "Also send on WhatsApp" with a collection list. */
export function useUpdateAdminLogin() {
  const put = usePutLogin()
  return useMutation({
    mutationFn: (input: { id: string } & UpdateAdminLoginInput) => {
      const { id, ...patch } = input
      return updateAdminLogin(id, patch)
    },
    onSuccess: put,
  })
}

export function useSetAdminLoginStatus() {
  const put = usePutLogin()
  return useMutation({
    mutationFn: (input: { id: string; status: AdminLoginStatus }) => setAdminLoginStatus(input.id, input.status),
    onSuccess: put,
  })
}

/** Your own password: this session stays signed in, your others end. */
export function useChangeOwnAdminPassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => changeOwnAdminPassword(input),
  })
}
