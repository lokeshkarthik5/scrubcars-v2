'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput } from '@/components/sc/input'
import { TopBar } from '@/components/sc/top-bar'
import { Chip } from '@/components/sc/chip'
import {
  createService,
  deleteService,
  getMyServices,
  toggleServiceActive,
  updateService,
} from '@/lib/api/services'
import {
  createServiceArea,
  deleteServiceArea,
  getMyVendor,
  getServiceAreas,
  getWorkingHours,
  setVendorWorkingHours,
  updateSlotInterval,
  updateVendorJobTypes,
  updateVendorSettings,
} from '@/lib/api/vendors'
import type {
  ApiServiceArea,
  ApiVendorProfile,
  ApiWorkingHours,
} from '@/lib/api/types'
import type { Service, ServiceCategory } from '@/lib/types'
import { cn } from '@/lib/utils'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SLOT_INTERVALS = [30, 45, 60] as const
const SERVICE_CATEGORIES: Array<{ value: ServiceCategory; label: string }> = [
  { value: 'car_wash', label: 'Car wash' },
  { value: 'detailing', label: 'Detailing' },
  { value: 'coating', label: 'Coating' },
  { value: 'scratch_removal', label: 'Scratch removal' },
]

type WorkingHoursForm = {
  dayOfWeek: number
  openTime: string
  closeTime: string
  isClosed: boolean
}

type ServiceForm = {
  name: string
  category: ServiceCategory
  price: string
  durationMins: string
}

function normalizeTimeForInput(time: string) {
  return time.slice(0, 5)
}

function normalizeTimeForApi(time: string) {
  return time.length === 5 ? `${time}:00` : time
}

function defaultWorkingHours(): WorkingHoursForm[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00',
    closeTime: '18:00',
    isClosed: false,
  }))
}

function mapWorkingHours(hours: ApiWorkingHours[]): WorkingHoursForm[] {
  const byDay = new Map(hours.map((day) => [day.dayOfWeek, day]))
  return defaultWorkingHours().map((fallback) => {
    const day = byDay.get(fallback.dayOfWeek)
    return day
      ? {
          dayOfWeek: day.dayOfWeek,
          openTime: normalizeTimeForInput(day.openTime),
          closeTime: normalizeTimeForInput(day.closeTime),
          isClosed: day.isClosed,
        }
      : fallback
  })
}

const emptyServiceForm: ServiceForm = {
  name: '',
  category: 'car_wash',
  price: '',
  durationMins: '30',
}

export default function VendorSettingsPage() {
  const [vendor, setVendor] = useState<ApiVendorProfile | null>(null)
  const [profileForm, setProfileForm] = useState({
    businessName: '',
    phone: '',
    address: '',
    city: '',
    lat: '',
    lng: '',
  })
  const [workingHours, setWorkingHours] = useState<WorkingHoursForm[]>(
    defaultWorkingHours()
  )
  const [areas, setAreas] = useState<ApiServiceArea[]>([])
  const [areaForm, setAreaForm] = useState({
    areaName: '',
    pincode: '',
    radiusKm: '',
  })
  const [services, setServices] = useState<Service[]>([])
  const [serviceForm, setServiceForm] = useState<ServiceForm>(emptyServiceForm)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)
      setError(null)
      try {
        const [vendorData, hoursData, areasData, servicesData] =
          await Promise.all([
            getMyVendor(),
            getWorkingHours(),
            getServiceAreas(),
            getMyServices(),
          ])

        setVendor(vendorData)
        setProfileForm({
          businessName: vendorData.businessName,
          phone: vendorData.phone,
          address: vendorData.address,
          city: vendorData.city,
          lat: String(vendorData.lat),
          lng: String(vendorData.lng),
        })
        setWorkingHours(mapWorkingHours(hoursData))
        setAreas(areasData)
        setServices(servicesData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
  }, [])

  const runAction = async (key: string, action: () => Promise<void>) => {
    setSaving(key)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage('Saved successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  const detectGps = () => {
    if (!navigator.geolocation) {
      setError('GPS is not supported by this browser.')
      return
    }

    setSaving('gps')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setProfileForm((form) => ({
          ...form,
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        }))
        setSaving(null)
        setMessage('GPS location detected. Save profile to apply it.')
      },
      () => {
        setSaving(null)
        setError('Unable to detect GPS location. Please allow location access.')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }

  const saveProfile = () =>
    runAction('profile', async () => {
      const updated = await updateVendorSettings({
        businessName: profileForm.businessName,
        phone: profileForm.phone,
        address: profileForm.address,
        city: profileForm.city,
        lat: Number(profileForm.lat),
        lng: Number(profileForm.lng),
      })
      setVendor(updated)
    })

  const saveJobTypes = () =>
    vendor &&
    runAction('job-types', async () => {
      const updated = await updateVendorJobTypes({
        doorstepEnabled: vendor.doorstepEnabled,
        dropinEnabled: vendor.dropinEnabled,
      })
      setVendor(updated)
    })

  const saveSlotInterval = (slotIntervalMins: 30 | 45 | 60) =>
    runAction('slot-interval', async () => {
      const updated = await updateSlotInterval(slotIntervalMins)
      setVendor(updated)
    })

  const saveWorkingHours = () =>
    runAction('working-hours', async () => {
      const updated = await setVendorWorkingHours(
        workingHours.map((day) => ({
          ...day,
          openTime: normalizeTimeForApi(day.openTime),
          closeTime: normalizeTimeForApi(day.closeTime),
        }))
      )
      setWorkingHours(mapWorkingHours(updated))
    })

  const addServiceArea = () =>
    runAction('area', async () => {
      const area = await createServiceArea({
        areaName: areaForm.areaName,
        pincode: areaForm.pincode,
        ...(areaForm.radiusKm ? { radiusKm: Number(areaForm.radiusKm) } : {}),
      })
      setAreas((current) => [...current, area])
      setAreaForm({ areaName: '', pincode: '', radiusKm: '' })
    })

  const removeServiceArea = (id: string) =>
    runAction(`area-${id}`, async () => {
      await deleteServiceArea(id)
      setAreas((current) => current.filter((area) => area.id !== id))
    })

  const resetServiceForm = () => {
    setEditingServiceId(null)
    setServiceForm(emptyServiceForm)
  }

  const submitService = () =>
    runAction('service', async () => {
      const payload = {
        name: serviceForm.name,
        category: serviceForm.category,
        price: Number(serviceForm.price),
        durationMins: Number(serviceForm.durationMins),
        isActive: true,
      }

      if (editingServiceId) {
        const updated = await updateService(editingServiceId, payload)
        setServices((current) =>
          current.map((service) =>
            service.id === editingServiceId ? updated : service
          )
        )
      } else {
        const created = await createService(payload)
        setServices((current) => [...current, created])
      }

      resetServiceForm()
    })

  const startEditService = (service: Service) => {
    setEditingServiceId(service.id)
    setServiceForm({
      name: service.name,
      category: service.category,
      price: String(service.price),
      durationMins: String(service.durationMins),
    })
  }

  const setServiceActive = (id: string, isActive: boolean) =>
    runAction(`service-active-${id}`, async () => {
      const updated = await toggleServiceActive(id, isActive)
      setServices((current) =>
        current.map((service) => (service.id === id ? updated : service))
      )
    })

  const removeService = (id: string) =>
    runAction(`service-delete-${id}`, async () => {
      await deleteService(id)
      setServices((current) => current.filter((service) => service.id !== id))
    })

  if (loading) {
    return (
      <AppShell showNav navType="vendor" className="gap-5 py-4">
        <TopBar title="Settings" />
        <p className="text-[13px] text-text-secondary">Loading settings...</p>
      </AppShell>
    )
  }

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar title="Settings" />

      {message && (
        <div className="rounded-[10px] border border-success bg-success-muted px-3 py-2 text-[12px] text-success">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-[10px] border border-brand-red bg-accent-muted px-3 py-2 text-[12px] text-brand-red">
          {error}
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Profile</h2>
          {vendor && (
            <ScBadge variant={vendor.isVerified ? 'success' : 'pending'}>
              {vendor.isVerified ? 'Verified' : 'Under review'}
            </ScBadge>
          )}
        </div>
        <ScCard className="flex flex-col gap-3">
          <ScInput
            label="Business name"
            value={profileForm.businessName}
            onChange={(e) =>
              setProfileForm({ ...profileForm, businessName: e.target.value })
            }
          />
          <ScInput
            label="Phone"
            value={profileForm.phone}
            onChange={(e) =>
              setProfileForm({
                ...profileForm,
                phone: e.target.value.replace(/\D/g, '').slice(0, 10),
              })
            }
          />
          <ScInput
            label="Address"
            value={profileForm.address}
            onChange={(e) =>
              setProfileForm({ ...profileForm, address: e.target.value })
            }
          />
          <ScInput
            label="City"
            value={profileForm.city}
            onChange={(e) =>
              setProfileForm({ ...profileForm, city: e.target.value })
            }
          />
          <div className="grid grid-cols-2 gap-2">
            <ScInput
              label="Latitude"
              type="number"
              value={profileForm.lat}
              onChange={(e) =>
                setProfileForm({ ...profileForm, lat: e.target.value })
              }
            />
            <ScInput
              label="Longitude"
              type="number"
              value={profileForm.lng}
              onChange={(e) =>
                setProfileForm({ ...profileForm, lng: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ScButton
              variant="secondary"
              disabled={saving === 'gps'}
              onClick={detectGps}
            >
              {saving === 'gps' ? 'Detecting...' : 'Detect GPS'}
            </ScButton>
            <ScButton disabled={saving === 'profile'} onClick={saveProfile}>
              {saving === 'profile' ? 'Saving...' : 'Save profile'}
            </ScButton>
          </div>
        </ScCard>
      </section>

      {vendor && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Job types & slots</h2>
          <ScCard className="flex flex-col gap-3">
            {[
              {
                label: 'Doorstep jobs',
                key: 'doorstepEnabled' as const,
                value: vendor.doorstepEnabled,
              },
              {
                label: 'Drop-in jobs',
                key: 'dropinEnabled' as const,
                value: vendor.dropinEnabled,
              },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-[13px]">{item.label}</span>
                <button
                  type="button"
                  onClick={() =>
                    setVendor({
                      ...vendor,
                      [item.key]: !item.value,
                    })
                  }
                  className={cn(
                    'h-6 w-11 rounded-full transition-colors',
                    item.value ? 'bg-brand-red' : 'bg-border'
                  )}
                >
                  <div
                    className={cn(
                      'h-5 w-5 rounded-full bg-white transition-transform',
                      item.value ? 'translate-x-5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </div>
            ))}
            <ScButton
              variant="secondary"
              disabled={saving === 'job-types'}
              onClick={saveJobTypes}
            >
              Save job types
            </ScButton>
            <div>
              <p className="mb-2 text-[11px] font-medium text-text-secondary">
                Slot interval
              </p>
              <div className="flex gap-2">
                {SLOT_INTERVALS.map((interval) => (
                  <Chip
                    key={interval}
                    label={`${interval} min`}
                    selected={vendor.slotIntervalMins === interval}
                    onClick={() => saveSlotInterval(interval)}
                    disabled={saving === 'slot-interval'}
                  />
                ))}
              </div>
            </div>
          </ScCard>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Working hours</h2>
        <div className="flex flex-col gap-2">
          {workingHours.map((day) => (
            <ScCard
              key={day.dayOfWeek}
              className={cn('flex items-center gap-2', day.isClosed && 'opacity-50')}
            >
              <span className="w-8 text-[12px] font-medium">{DAYS[day.dayOfWeek]}</span>
              <input
                type="time"
                value={day.openTime}
                onChange={(e) =>
                  setWorkingHours((current) =>
                    current.map((item) =>
                      item.dayOfWeek === day.dayOfWeek
                        ? { ...item, openTime: e.target.value }
                        : item
                    )
                  )
                }
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
                disabled={day.isClosed}
              />
              <input
                type="time"
                value={day.closeTime}
                onChange={(e) =>
                  setWorkingHours((current) =>
                    current.map((item) =>
                      item.dayOfWeek === day.dayOfWeek
                        ? { ...item, closeTime: e.target.value }
                        : item
                    )
                  )
                }
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-[12px]"
                disabled={day.isClosed}
              />
              <button
                type="button"
                onClick={() =>
                  setWorkingHours((current) =>
                    current.map((item) =>
                      item.dayOfWeek === day.dayOfWeek
                        ? { ...item, isClosed: !item.isClosed }
                        : item
                    )
                  )
                }
                className={cn(
                  'text-[10px] font-medium',
                  day.isClosed ? 'text-brand-red' : 'text-text-secondary'
                )}
              >
                {day.isClosed ? 'Closed' : 'Open'}
              </button>
            </ScCard>
          ))}
          <ScButton
            disabled={saving === 'working-hours'}
            onClick={saveWorkingHours}
          >
            {saving === 'working-hours' ? 'Saving...' : 'Save working hours'}
          </ScButton>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Service areas</h2>
        <div className="grid gap-2">
          <ScInput
            label="Area name"
            value={areaForm.areaName}
            onChange={(e) =>
              setAreaForm({ ...areaForm, areaName: e.target.value })
            }
          />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <ScInput
              placeholder="Pincode"
              value={areaForm.pincode}
              onChange={(e) =>
                setAreaForm({
                  ...areaForm,
                  pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                })
              }
            />
            <ScButton
              fullWidth={false}
              className="px-4"
              disabled={!areaForm.areaName || areaForm.pincode.length !== 6 || saving === 'area'}
              onClick={addServiceArea}
            >
            Add
            </ScButton>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => removeServiceArea(area.id)}
              className="rounded-md border border-border bg-surface px-2 py-1 text-[11px]"
            >
              {area.pincode} — {area.areaName} ×
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Services</h2>
          {editingServiceId && (
            <button
              type="button"
              onClick={resetServiceForm}
              className="text-[12px] text-brand-red"
            >
              Cancel edit
            </button>
          )}
        </div>
        <ScCard className="mb-2 flex flex-col gap-3">
          <ScInput
            label="Service name"
            value={serviceForm.name}
            onChange={(e) =>
              setServiceForm({ ...serviceForm, name: e.target.value })
            }
          />
          <div>
            <p className="mb-2 text-[11px] font-medium text-text-secondary">Category</p>
            <div className="flex flex-wrap gap-2">
              {SERVICE_CATEGORIES.map((category) => (
                <Chip
                  key={category.value}
                  label={category.label}
                  selected={serviceForm.category === category.value}
                  onClick={() =>
                    setServiceForm({
                      ...serviceForm,
                      category: category.value,
                    })
                  }
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ScInput
              label="Price"
              type="number"
              value={serviceForm.price}
              onChange={(e) =>
                setServiceForm({ ...serviceForm, price: e.target.value })
              }
            />
            <ScInput
              label="Duration (mins)"
              type="number"
              value={serviceForm.durationMins}
              onChange={(e) =>
                setServiceForm({
                  ...serviceForm,
                  durationMins: e.target.value,
                })
              }
            />
          </div>
          <ScButton
            disabled={!serviceForm.name || !serviceForm.price || saving === 'service'}
            onClick={submitService}
          >
            {saving === 'service'
              ? 'Saving...'
              : editingServiceId
                ? 'Update service'
                : 'Add service'}
          </ScButton>
        </ScCard>
        <div className="flex flex-col gap-2">
          {services.map((svc) => (
            <ScCard key={svc.id} className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium">{svc.name}</p>
                <p className="text-[11px] text-text-secondary">₹{svc.price} · {svc.durationMins} min</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEditService(svc)}
                  className="text-[11px] text-brand-red"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setServiceActive(svc.id, !svc.isActive)}
                  className="text-[11px] text-text-secondary"
                >
                  {svc.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => removeService(svc.id)}
                  className="text-[11px] text-brand-red"
                >
                  Delete
                </button>
                <ScBadge variant={svc.isActive ? 'success' : 'muted'}>
                  {svc.isActive ? 'Active' : 'Inactive'}
                </ScBadge>
              </div>
            </ScCard>
          ))}
        </div>
      </section>
    </AppShell>
  )
}
