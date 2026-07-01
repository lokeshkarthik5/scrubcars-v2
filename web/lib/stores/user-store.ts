'use client'

import { create } from 'zustand'
import {
  createAddress as apiCreateAddress,
  getAddresses,
  getProfile,
  getVehicles,
  updateProfile as apiUpdateProfile,
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
  reset: () => void
}

export const useUserStore = create<UserState>((set, get) => ({
  profile: null,
  vehicles: [],
  addresses: [],
  isLoading: false,

  async fetchProfile() {
    set({ isLoading: true })
    try {
      const profile = await getProfile()
      set({ profile })
      return profile
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
    const vehicles = await getVehicles()
    set({ vehicles })
    return vehicles
  },

  async fetchAddresses() {
    const addresses = await getAddresses()
    set({ addresses })
    return addresses
  },

  reset() {
    set({ profile: null, vehicles: [], addresses: [] })
  },
}))
