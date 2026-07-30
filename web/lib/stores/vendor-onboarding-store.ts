'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PickupOption = 'yes' | 'nearby' | 'no' | ''

interface OnboardingData {
  businessName: string
  ownerName: string
  city: string
  phone: string
  whatsapp: string
  email: string
  yearsInOperation: string
  address: string
  pincode: string
  mapsUrl: string
  lat: number
  lng: number
  dropin: boolean
  doorstep: boolean
  pickup: PickupOption
  pickupRadiusKm: number | null
  bays: string
  jobsPerDay: string
  slotInterval: number
  workingDays: number[]
  openTime: string
  closeTime: string
  vehicleTypes: string[]
  areas: Array<{ pincode: string; name: string }>
}

interface VendorOnboardingState extends OnboardingData {
  isComplete: boolean
  update: (data: Partial<OnboardingData>) => void
  markComplete: () => void
  resetForm: () => void
  reset: () => void
}

const initialState: OnboardingData = {
  businessName: '',
  ownerName: '',
  city: '',
  phone: '',
  whatsapp: '',
  email: '',
  yearsInOperation: '',
  address: '',
  pincode: '',
  mapsUrl: '',
  lat: 13.0067,
  lng: 80.2574,
  dropin: true,
  doorstep: false,
  pickup: '',
  pickupRadiusKm: null,
  bays: '',
  jobsPerDay: '',
  slotInterval: 30,
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  openTime: '09:00',
  closeTime: '18:00',
  vehicleTypes: [],
  areas: [],
}

export const useVendorOnboardingStore = create<VendorOnboardingState>()(
  persist(
    (set) => ({
      ...initialState,
      isComplete: false,
      update: (data) => set((state) => ({ ...state, ...data })),
      markComplete: () => set({ isComplete: true }),
      resetForm: () => set((state) => ({ ...state, ...initialState })),
      reset: () => set({ ...initialState, isComplete: false }),
    }),
    { name: 'detlio-vendor-onboarding' }
  )
)
