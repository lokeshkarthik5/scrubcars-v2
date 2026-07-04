'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingData {
  businessName: string
  ownerName: string
  city: string
  phone: string
  address: string
  lat: number
  lng: number
  dropin: boolean
  slotInterval: number
  openTime: string
  closeTime: string
  areas: Array<{ pincode: string; name: string }>
}

interface VendorOnboardingState extends OnboardingData {
  update: (data: Partial<OnboardingData>) => void
  reset: () => void
}

const initialState: OnboardingData = {
  businessName: '',
  ownerName: '',
  city: '',
  phone: '',
  address: '',
  lat: 13.0067,
  lng: 80.2574,
  dropin: true,
  slotInterval: 30,
  openTime: '09:00',
  closeTime: '18:00',
  areas: [],
}

export const useVendorOnboardingStore = create<VendorOnboardingState>()(
  persist(
    (set) => ({
      ...initialState,
      update: (data) => set((state) => ({ ...state, ...data })),
      reset: () => set(initialState),
    }),
    { name: 'scrub-cars-vendor-onboarding' }
  )
)
