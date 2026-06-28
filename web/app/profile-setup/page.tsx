'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCheck, IconCurrentLocation, IconSearch } from '@tabler/icons-react'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { ScInput } from '@/components/sc/input'
import { ProgressBar } from '@/components/sc/progress-bar'
import { detectLocation, resolvePincode, updateProfile } from '@/lib/api/users'

export default function ProfileSetupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [pincode, setPincode] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchPincode, setSearchPincode] = useState('')

  const handleGps = async () => {
    // TODO: use navigator.geolocation when permissions are wired
    const result = await detectLocation(13.0067, 80.2574)
    setArea(result.area)
    setPincode(result.pincode)
  }

  const handleSearch = async () => {
    if (searchPincode.length !== 6) return
    const result = await resolvePincode(searchPincode)
    setArea(result.area)
    setPincode(result.pincode)
    setShowSearch(false)
  }

  const handleSubmit = async () => {
    if (!name.trim() || !area) return
    setLoading(true)
    try {
      await updateProfile({ name, area, pincode })
      router.push('/home?welcome=1')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="py-4">
      <ProgressBar progress={100} className="mb-6" />

      <h1 className="mb-6 text-center text-[15px] font-semibold text-text-primary">
        Complete your profile
      </h1>

      <div className="flex flex-1 flex-col gap-5">
        <ScInput
          label="Full name"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-text-secondary">Your area</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleGps}
              className="flex items-center justify-center gap-2 rounded-[10px] border border-border bg-surface py-3 text-[12px] font-medium text-brand-red"
            >
              <IconCurrentLocation size={16} />
              Detect via GPS
            </button>
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="flex items-center justify-center gap-2 rounded-[10px] border border-border bg-surface py-3 text-[12px] font-medium text-text-primary"
            >
              <IconSearch size={16} />
              Search area
            </button>
          </div>

          {showSearch && (
            <div className="mt-2 flex gap-2">
              <ScInput
                placeholder="Enter pincode"
                value={searchPincode}
                onChange={(e) => setSearchPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="flex-1"
              />
              <ScButton fullWidth={false} className="px-4" onClick={handleSearch}>
                Find
              </ScButton>
            </div>
          )}

          {area && (
            <div className="mt-2 flex items-center justify-between rounded-[10px] border border-brand-red bg-surface px-3 py-2.5">
              <span className="text-[13px] text-brand-red">
                {area} – {pincode}
              </span>
              <IconCheck size={18} className="text-brand-red" />
            </div>
          )}
        </div>

        <div className="mt-auto space-y-3 pb-4">
          <ScButton disabled={!name.trim() || !area || loading} onClick={handleSubmit}>
            {loading ? 'Saving...' : 'Get started'}
          </ScButton>
          <p className="text-center text-[11px] text-text-muted">
            You can update this anytime from your profile
          </p>
        </div>
      </div>
    </AppShell>
  )
}
