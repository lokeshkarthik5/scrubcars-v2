'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { ScButton } from '@/components/sc/button'
import { ApiError } from '@/lib/api/client'
import { getAdminVendor, updateAdminVendor } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

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

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
        selected
          ? 'border-brand-red bg-brand-red/10 text-brand-red'
          : 'border-border bg-surface text-text-secondary'
      )}
    >
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[14px] border border-border p-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h2>
      {children}
    </section>
  )
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const VEHICLE_TYPES = ['Hatchback', 'Sedan', 'SUV / MUV', 'Luxury / Premium', 'Electric (EV)', 'Commercial / Van']
const PICKUP_OPTIONS = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'nearby' as const, label: 'Nearby only' },
  { value: 'no' as const, label: 'No' },
]
const SLOT_INTERVALS = [30, 45, 60] as const
const STATUS_OPTIONS = [
  { value: 'pending' as const, label: 'Pending' },
  { value: 'active' as const, label: 'Active (live)' },
  { value: 'suspended' as const, label: 'Suspended' },
  { value: 'archived' as const, label: 'Archived' },
]

export default function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [form, setForm] = useState({
    ownerName: '',
    ownerPhone: '',
    businessName: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
    email: '',
    whatsapp: '',
    yearsInOperation: '',
    mapsUrl: '',
    bays: '',
    jobsPerDay: '',
    pickupRadiusKm: '',
    openTime: '09:00',
    closeTime: '18:00',
    notes: '',
  })
  const [pickup, setPickup] = useState<'yes' | 'nearby' | 'no' | ''>('')
  const [dropinEnabled, setDropinEnabled] = useState(true)
  const [doorstepEnabled, setDoorstepEnabled] = useState(false)
  const [slotIntervalMins, setSlotIntervalMins] = useState<30 | 45 | 60>(30)
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6])
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([])
  const [status, setStatus] = useState<'pending' | 'active' | 'suspended' | 'archived'>('pending')
  const [isVerified, setIsVerified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const v = await getAdminVendor(id)
      setForm({
        ownerName: v.owner?.name ?? '',
        ownerPhone: v.owner?.phone ?? '',
        businessName: v.businessName,
        phone: v.phone,
        address: v.address,
        city: v.city,
        pincode: v.pincode,
        email: v.email ?? '',
        whatsapp: v.whatsapp ?? '',
        yearsInOperation: v.yearsInOperation ?? '',
        mapsUrl: v.mapsUrl ?? '',
        bays: v.bays != null ? String(v.bays) : '',
        jobsPerDay: v.jobsPerDay != null ? String(v.jobsPerDay) : '',
        pickupRadiusKm: v.pickupRadiusKm != null ? String(v.pickupRadiusKm) : '',
        openTime: '09:00',
        closeTime: '18:00',
        notes: v.notes ?? '',
      })
      setPickup(v.pickup ?? '')
      setDropinEnabled(v.dropinEnabled)
      setDoorstepEnabled(v.doorstepEnabled)
      setSlotIntervalMins((v.slotIntervalMins as 30 | 45 | 60) ?? 30)
      setVehicleTypes(v.vehicleTypes ?? [])
      setStatus(v.status as 'pending' | 'active' | 'suspended' | 'archived')
      setIsVerified(v.isVerified)

      // Derive the weekly schedule from stored working hours: open days and the
      // shared open/close time (falls back to defaults when none are stored).
      const openDays = v.workingHours.filter((h) => !h.isClosed)
      if (v.workingHours.length > 0) {
        setWorkingDays(openDays.map((h) => h.dayOfWeek).sort())
      }
      const sample = openDays[0]
      if (sample) {
        setForm((prev) => ({
          ...prev,
          openTime: sample.openTime.slice(0, 5),
          closeTime: sample.closeTime.slice(0, 5),
        }))
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/admin/login')
        return
      }
      setError('Failed to load vendor')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

  const isValid =
    form.ownerName &&
    /^\d{10}$/.test(form.ownerPhone) &&
    form.businessName &&
    /^\d{10}$/.test(form.phone) &&
    form.address &&
    form.city &&
    /^\d{6}$/.test(form.pincode)

  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  const handleSubmit = async () => {
    if (!isValid) return
    setSaving(true)
    setError('')
    try {
      await updateAdminVendor(id, {
        ownerName: form.ownerName.trim(),
        ownerPhone: form.ownerPhone.trim(),
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        email: form.email.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        yearsInOperation: form.yearsInOperation.trim() || null,
        mapsUrl: form.mapsUrl.trim() || null,
        pickup: pickup || null,
        pickupRadiusKm: num(form.pickupRadiusKm),
        dropinEnabled,
        doorstepEnabled,
        slotIntervalMins,
        bays: num(form.bays),
        jobsPerDay: num(form.jobsPerDay),
        vehicleTypes,
        workingDays,
        openTime: form.openTime,
        closeTime: form.closeTime,
        status,
        isVerified,
        notes: form.notes.trim() || null,
      })
      router.replace('/admin/vendors')
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace('/admin/login')
        return
      }
      setError(err instanceof ApiError ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[640px] space-y-5">
      <Link
        href="/admin/vendors"
        className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
      >
        <IconArrowLeft size={16} /> Back to vendors
      </Link>

      <h1 className="text-lg font-semibold text-text-primary">Edit vendor</h1>

      {loading ? (
        <p className="text-[13px] text-text-secondary">Loading…</p>
      ) : (
        <div className="space-y-4">
          <Section title="Business & contact">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Owner name" value={form.ownerName} onChange={set('ownerName')} />
              <Field label="Owner phone" value={form.ownerPhone} onChange={set('ownerPhone')} placeholder="10 digits" />
            </div>
            <Field label="Business name" value={form.businessName} onChange={set('businessName')} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Business phone" value={form.phone} onChange={set('phone')} placeholder="10 digits" />
              <Field label="WhatsApp (optional)" value={form.whatsapp} onChange={set('whatsapp')} placeholder="10 digits" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email (optional)" value={form.email} onChange={set('email')} type="email" />
              <Field label="Years in operation (optional)" value={form.yearsInOperation} onChange={set('yearsInOperation')} placeholder="e.g. 5–10 years" />
            </div>
          </Section>

          <Section title="Location">
            <Field label="Address" value={form.address} onChange={set('address')} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" value={form.city} onChange={set('city')} />
              <Field label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="6 digits" />
            </div>
            <Field label="Google Maps link (optional)" value={form.mapsUrl} onChange={set('mapsUrl')} placeholder="https://maps.app.goo.gl/…" />
          </Section>

          <Section title="Operations">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary">Pickup &amp; drop</label>
              <div className="flex flex-wrap gap-2">
                {PICKUP_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    selected={pickup === o.value}
                    onClick={() => setPickup(pickup === o.value ? '' : o.value)}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pickup radius km (optional)" value={form.pickupRadiusKm} onChange={set('pickupRadiusKm')} type="number" placeholder="e.g. 5" />
              <div className="flex items-end gap-4 pb-1">
                <label className="flex items-center gap-2 text-[12px] text-text-primary">
                  <input type="checkbox" checked={dropinEnabled} onChange={(e) => setDropinEnabled(e.target.checked)} /> Drop-in
                </label>
                <label className="flex items-center gap-2 text-[12px] text-text-primary">
                  <input type="checkbox" checked={doorstepEnabled} onChange={(e) => setDoorstepEnabled(e.target.checked)} /> Doorstep
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary">Working days</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((label, day) => (
                  <Chip
                    key={day}
                    label={label}
                    selected={workingDays.includes(day)}
                    onClick={() => setWorkingDays((d) => toggle(d, day).sort())}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opening time" value={form.openTime} onChange={set('openTime')} type="time" />
              <Field label="Closing time" value={form.closeTime} onChange={set('closeTime')} type="time" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary">Slot interval</label>
              <div className="flex gap-2">
                {SLOT_INTERVALS.map((mins) => (
                  <Chip
                    key={mins}
                    label={`${mins} min`}
                    selected={slotIntervalMins === mins}
                    onClick={() => setSlotIntervalMins(mins)}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bays (optional)" value={form.bays} onChange={set('bays')} type="number" placeholder="e.g. 10" />
              <Field label="Jobs per day (optional)" value={form.jobsPerDay} onChange={set('jobsPerDay')} type="number" placeholder="e.g. 15" />
            </div>
          </Section>

          <Section title="Vehicle types">
            <div className="flex flex-wrap gap-2">
              {VEHICLE_TYPES.map((v) => (
                <Chip
                  key={v}
                  label={v}
                  selected={vehicleTypes.includes(v)}
                  onClick={() => setVehicleTypes((list) => toggle(list, v))}
                />
              ))}
            </div>
          </Section>

          <Section title="Onboarding status">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary">Stage</label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    selected={status === o.value}
                    onClick={() => setStatus(o.value)}
                  />
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-text-primary">
              <input type="checkbox" checked={isVerified} onChange={(e) => setIsVerified(e.target.checked)} /> Mark as verified
            </label>
            <p className="text-[11px] text-text-muted">
              A vendor is visible to customers only when stage is <b>Active</b> and it is <b>verified</b>.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-text-secondary">Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => set('notes')(e.target.value)}
                rows={3}
                className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-brand-red"
              />
            </div>
          </Section>

          <p className="text-[11px] text-text-muted">
            Services offered are managed separately and are not edited here.
          </p>

          {error && <p className="text-[13px] text-brand-red">{error}</p>}

          <ScButton disabled={!isValid || saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Save changes'}
          </ScButton>
        </div>
      )}
    </div>
  )
}
