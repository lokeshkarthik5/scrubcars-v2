'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { ScButton } from '@/components/sc/button'
import { ApiError } from '@/lib/api/client'
import { createAdminVendor } from '@/lib/api/admin'

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}

function Field({ label, value, onChange, placeholder, type = 'text' }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-text-secondary">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-brand-red"
      />
    </div>
  )
}

export default function NewVendorPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    ownerName: '',
    ownerPhone: '',
    businessName: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
    lat: '',
    lng: '',
    email: '',
    whatsapp: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }))

  const isValid =
    form.ownerName &&
    /^\d{10}$/.test(form.ownerPhone) &&
    form.businessName &&
    /^\d{10}$/.test(form.phone) &&
    form.address &&
    form.city &&
    /^\d{6}$/.test(form.pincode) &&
    form.lat !== '' &&
    form.lng !== ''

  const handleSubmit = async () => {
    if (!isValid) return
    setLoading(true)
    setError('')
    try {
      await createAdminVendor({
        ownerName: form.ownerName.trim(),
        ownerPhone: form.ownerPhone.trim(),
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        lat: Number(form.lat),
        lng: Number(form.lng),
        email: form.email.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
      })
      router.replace('/admin/vendors')
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/admin/login')
        return
      }
      setError(err instanceof ApiError ? err.message : 'Failed to create vendor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-[560px] space-y-5">
      <Link
        href="/admin/vendors"
        className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
      >
        <IconArrowLeft size={16} /> Back to vendors
      </Link>

      <h1 className="text-lg font-semibold text-text-primary">Add vendor</h1>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner name" value={form.ownerName} onChange={set('ownerName')} />
          <Field label="Owner phone" value={form.ownerPhone} onChange={set('ownerPhone')} placeholder="10 digits" />
        </div>
        <Field label="Business name" value={form.businessName} onChange={set('businessName')} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Business phone" value={form.phone} onChange={set('phone')} placeholder="10 digits" />
          <Field label="WhatsApp (optional)" value={form.whatsapp} onChange={set('whatsapp')} placeholder="10 digits" />
        </div>
        <Field label="Address" value={form.address} onChange={set('address')} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" value={form.city} onChange={set('city')} />
          <Field label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="6 digits" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude" value={form.lat} onChange={set('lat')} type="number" />
          <Field label="Longitude" value={form.lng} onChange={set('lng')} type="number" />
        </div>
        <Field label="Email (optional)" value={form.email} onChange={set('email')} type="email" />

        {error && <p className="text-[13px] text-brand-red">{error}</p>}

        <ScButton disabled={!isValid || loading} onClick={handleSubmit}>
          {loading ? 'Creating…' : 'Create vendor'}
        </ScButton>
      </div>
    </div>
  )
}
