'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ProgressBar } from '@repo/ui/sc/progress-bar'
import { createAddress, updateProfile } from '@repo/core/api/users'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { toast } from 'react-toastify'

const ADDRESS_LABELS = ['Home', 'Office', 'Other'] as const

export default function ProfileSetupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [label, setLabel] = useState<string>('Home')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)
  const coordsRef = useRef<{ lat: number; lng: number }>({ lat: 0, lng: 0 })

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      coordsRef.current = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }
    })
  }, [])

  const canSubmit = name.trim() && address.trim() && city.trim()

  const handleSubmit = async () => {
    if (!canSubmit) return
    const currentUser = useAuthStore.getState().user
    console.log('[profile-setup] submit clicked — auth state:', {
      userId: currentUser?.id,
      userName: currentUser?.name,
      isSessionReady: useAuthStore.getState().isSessionReady,
    })
    setLoading(true)
    try {
      console.log('[profile-setup] calling updateProfile + createAddress')
      await Promise.all([
        updateProfile({ name: name.trim() }),
        createAddress({
          label,
          address: address.trim(),
          city: city.trim(),
          lat: coordsRef.current.lat,
          lng: coordsRef.current.lng,
          isDefault: true,
        }),
      ])
      console.log('[profile-setup] both calls succeeded')
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, name: name.trim() } : s.user,
      }))
      router.push('/home?welcome=1')
    } catch (err) {
      console.log('[profile-setup] submit failed:', err)
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell className="gap-5 py-4">
      <ProgressBar progress={100} className="mb-2" />
      <h1 className="text-center text-[15px] font-semibold text-text-primary">
        Complete your profile
      </h1>

      <ScInput
        id="profile-name"
        label="Full name"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-text-secondary">Address label</label>
          <div className="flex gap-2">
            {ADDRESS_LABELS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={label === l}
                onClick={() => setLabel(l)}
                className={`rounded-[8px] border px-4 py-2 text-[12px] font-medium transition-colors ${
                  label === l
                    ? 'border-brand-red bg-accent-muted text-brand-red'
                    : 'border-border bg-surface text-text-primary'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <ScTextarea
          id="profile-address"
          label="Street address"
          placeholder="Flat no., building, street"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <ScInput
          id="profile-city"
          label="City"
          placeholder="Chennai"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </section>

      <div className="mt-auto space-y-3 pb-4">
        <ScButton disabled={!canSubmit || loading} onClick={handleSubmit}>
          {loading ? 'Saving...' : 'Get started'}
        </ScButton>
        <p className="text-center text-[11px] text-text-muted">
          You can update this anytime from your profile
        </p>
      </div>
    </AppShell>
  )
}
