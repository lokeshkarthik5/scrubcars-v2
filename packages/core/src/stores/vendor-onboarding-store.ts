'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  /** Null until the owner pins the garage on the map in step 2. */
  lat: number | null
  lng: number | null
  dropin: boolean
  doorstep: boolean
  /** How far the garage travels for doorstep jobs. Null when it doesn't. */
  doorstepRadiusKm: number | null
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
  // Null until the owner drops a pin. Previously these defaulted to a hardcoded
  // Chennai point, which meant every garage submitted the same coordinates and
  // no distance sort could ever be right. A missing pin is now blocked at the
  // form rather than papered over with a plausible-looking lie.
  lat: null,
  lng: null,
  dropin: true,
  doorstep: false,
  doorstepRadiusKm: null,
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
