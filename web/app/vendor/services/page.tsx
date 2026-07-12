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
import { toast } from 'react-toastify'
import type { Service, ServiceCategory } from '@/lib/types'
import { cn } from '@/lib/utils'

const SERVICE_CATEGORIES: Array<{ value: ServiceCategory; label: string }> = [
  { value: 'car_wash', label: 'Car wash' },
  { value: 'detailing', label: 'Detailing' },
  { value: 'coating', label: 'Coating' },
  { value: 'scratch_removal', label: 'Scratch removal' },
  { value: 'others', label: 'Others' },
]

type ServiceForm = {
  name: string
  category: ServiceCategory
  price: string
  durationMins: string
}

const emptyServiceForm: ServiceForm = {
  name: '',
  category: 'car_wash',
  price: '',
  durationMins: '30',
}

export default function VendorServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [serviceForm, setServiceForm] = useState<ServiceForm>(emptyServiceForm)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    getMyServices()
      .then(setServices)
      .catch(() => toast.error('Failed to load services'))
      .finally(() => setLoading(false))
  }, [])

  const runAction = async (key: string, action: () => Promise<void>) => {
    setSaving(key)
    try {
      await action()
      toast.success('Saved successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

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
          current.map((svc) => (svc.id === editingServiceId ? updated : svc))
        )
      } else {
        const created = await createService(payload)
        setServices((current) => [...current, created])
      }

      resetServiceForm()
    })

  const startEditService = (svc: Service) => {
    setEditingServiceId(svc.id)
    setServiceForm({
      name: svc.name,
      category: svc.category,
      price: String(svc.price),
      durationMins: String(svc.durationMins),
    })
  }

  const setServiceActive = (id: string, isActive: boolean) =>
    runAction(`service-active-${id}`, async () => {
      const updated = await toggleServiceActive(id, isActive)
      setServices((current) =>
        current.map((svc) => (svc.id === id ? updated : svc))
      )
    })

  const removeService = (id: string) =>
    runAction(`service-delete-${id}`, async () => {
      await deleteService(id)
      setServices((current) => current.filter((svc) => svc.id !== id))
    })

  if (loading) {
    return (
      <AppShell showNav navType="vendor" className="gap-5 py-4">
        <TopBar title="Services" />
        <p className="text-[13px] text-text-secondary">Loading...</p>
      </AppShell>
    )
  }

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <div className="flex items-center justify-between">
        <TopBar title="Services" />
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

      <ScCard className="flex flex-col gap-3">
        <ScInput
          label="Service name"
          value={serviceForm.name}
          onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
        />
        <div>
          <p className="mb-2 text-[11px] font-medium text-text-secondary">Category</p>
          <div className="flex flex-wrap gap-2">
            {SERVICE_CATEGORIES.map((cat) => (
              <Chip
                key={cat.value}
                label={cat.label}
                selected={serviceForm.category === cat.value}
                onClick={() => setServiceForm({ ...serviceForm, category: cat.value })}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ScInput
            label="Price (₹)"
            type="number"
            value={serviceForm.price}
            onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
          />
          <ScInput
            label="Duration (mins)"
            type="number"
            value={serviceForm.durationMins}
            onChange={(e) => setServiceForm({ ...serviceForm, durationMins: e.target.value })}
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
        {services.length === 0 ? (
          <ScCard>
            <p className="text-[13px] text-text-secondary">No services added yet.</p>
          </ScCard>
        ) : (
          services.map((svc) => (
            <ScCard key={svc.id} className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium">{svc.name}</p>
                <p className="text-[11px] text-text-secondary">
                  ₹{svc.price} · {svc.durationMins} min
                </p>
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
                  className={cn('text-[11px]', svc.isActive ? 'text-text-secondary' : 'text-brand-red')}
                >
                  {svc.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => removeService(svc.id)}
                  className="text-[11px] text-text-muted"
                >
                  Delete
                </button>
                <ScBadge variant={svc.isActive ? 'success' : 'muted'}>
                  {svc.isActive ? 'Active' : 'Inactive'}
                </ScBadge>
              </div>
            </ScCard>
          ))
        )}
      </div>
    </AppShell>
  )
}
