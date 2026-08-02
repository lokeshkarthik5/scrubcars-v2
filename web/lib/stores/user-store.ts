'use client'

import { create } from 'zustand'
import {
  createAddress as apiCreateAddress,
  deleteAvatar as apiDeleteAvatar,
  getAddresses,
  getProfileWithAddresses,
  getVehicles,
  updateProfile as apiUpdateProfile,
  uploadAvatar as apiUploadAvatar,
} from '@/lib/api/users'
import type { Address, User, Vehicle } from '@/lib/types'

interface UserState {
  profile: User | null
  vehicles: Vehicle[]
  addresses: Address[]
  isLoading: boolean

  fetchProfile: () => Promise<User>
  updateProfile: (data: {
    name: string
    area?: string
    pincode?: string
    lat?: number
    lng?: number
  }) => Promise<User>
  fetchVehicles: () => Promise<Vehicle[]>
  fetchAddresses: () => Promise<Address[]>
  uploadAvatar: (file: File) => Promise<User>
  removeAvatar: () => Promise<User>
  reset: () => void
}

export const useUserStore = create<UserState>((set, get) => ({
  profile: null,
  vehicles: [],
  addresses: [],
  isLoading: false,

  async fetchProfile() {
    const existing = get().profile
    if (existing) return existing
    set({ isLoading: true })
    try {
      const { user, addresses } = await getProfileWithAddresses()
      set({ profile: user, addresses })
      return user
    } finally {
      set({ isLoading: false })
    }
  },

  async updateProfile(data) {
    set({ isLoading: true })
    try {
      const profile = await apiUpdateProfile({ name: data.name })
      set({ profile })

      if (data.area && data.pincode) {
        const addresses = get().addresses
        if (addresses.length === 0) {
          await apiCreateAddress({
            label: 'Home',
            address: `${data.area}, ${data.pincode}`,
            city: data.area,
            lat: data.lat ?? 13.0067,
            lng: data.lng ?? 80.2574,
            isDefault: true,
          })
          const updated = await getAddresses()
          set({ addresses: updated })
          const withArea = {
            ...profile,
            area: data.area,
            pincode: data.pincode,
          }
          set({ profile: withArea })
          return withArea
        }
      }

      return profile
    } finally {
      set({ isLoading: false })
    }
  },

  async fetchVehicles() {
    const existing = get().vehicles
    if (existing.length > 0) return existing
    const vehicles = await getVehicles()
    set({ vehicles })
    return vehicles
  },

  async fetchAddresses() {
    const existing = get().addresses
    if (existing.length > 0) return existing
    const addresses = await getAddresses()
    set({ addresses })
    return addresses
  },

  async uploadAvatar(file) {
    const profile = await apiUploadAvatar(file)
    // Only the avatar changed — keep the cached area/pincode and other fields.
    set((s) => ({
      profile: s.profile
        ? { ...s.profile, avatarUrl: profile.avatarUrl }
        : profile,
    }))
    return profile
  },

  async removeAvatar() {
    const profile = await apiDeleteAvatar()
    set((s) => ({
      profile: s.profile ? { ...s.profile, avatarUrl: null } : profile,
    }))
    return profile
  },

  reset() {
    set({ profile: null, vehicles: [], addresses: [] })
  },
}))
