'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/sc/app-shell'
import { ScBadge } from '@/components/sc/badge'
import { ScButton } from '@/components/sc/button'
import { ScCard } from '@/components/sc/card'
import { ScInput, ScTextarea } from '@/components/sc/input'
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
import type { PricingType, Service, ServiceCategory } from '@/lib/types'
import { PRICING_TYPES, formatServicePrice } from '@/lib/pricing'
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
  description: string
  category: ServiceCategory
  pricingType: PricingType
  price: string
  priceHatchback: string
  priceSedan: string
  priceSuv: string
  durationMins: string
}

const emptyServiceForm: ServiceForm = {
  name: '',
  description: '',
  category: 'car_wash',
  pricingType: 'flat',
  price: '',
  priceHatchback: '',
  priceSedan: '',
  priceSuv: '',
  durationMins: '30',
}

// A form's pricing block is valid to submit when the right price(s) are present
// for the chosen pricing type.
function hasValidPricing(form: ServiceForm): boolean {
  if (form.pricingType === 'per_vehicle') {
    return [form.priceHatchback, form.priceSedan, form.priceSuv].some(
      (p) => Number(p) > 0
    )
  }
  return Number(form.price) > 0
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
      const num = (v: string) => (Number(v) > 0 ? Number(v) : undefined)
      const payload = {
        name: serviceForm.name,
        description: serviceForm.description,
        category: serviceForm.category,
        pricingType: serviceForm.pricingType,
        price: num(serviceForm.price),
        priceHatchback: num(serviceForm.priceHatchback),
        priceSedan: num(serviceForm.priceSedan),
        priceSuv: num(serviceForm.priceSuv),
        durationMins: Number(serviceForm.durationMins),
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
      description: svc.description ?? '',
      category: svc.category,
      pricingType: svc.pricingType,
      price:
        svc.pricingType === 'flat' || svc.pricingType === 'on_inspection'
          ? String(svc.price)
          : '',
      priceHatchback: svc.priceHatchback != null ? String(svc.priceHatchback) : '',
      priceSedan: svc.priceSedan != null ? String(svc.priceSedan) : '',
      priceSuv: svc.priceSuv != null ? String(svc.priceSuv) : '',
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
        <ScTextarea
          label="Description (optional)"
          rows={2}
          value={serviceForm.description}
          onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
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
        <div>
          <p className="mb-2 text-[11px] font-medium text-text-secondary">Pricing</p>
          <div className="flex flex-wrap gap-2">
            {PRICING_TYPES.map((pt) => (
              <Chip
                key={pt.value}
                label={pt.label}
                selected={serviceForm.pricingType === pt.value}
                onClick={() => setServiceForm({ ...serviceForm, pricingType: pt.value })}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted">
            {PRICING_TYPES.find((pt) => pt.value === serviceForm.pricingType)?.hint}
          </p>
        </div>

        {(serviceForm.pricingType === 'flat' ||
          serviceForm.pricingType === 'on_inspection') && (
          <ScInput
            label={
              serviceForm.pricingType === 'on_inspection'
                ? 'Inspection fee (₹)'
                : 'Price (₹)'
            }
            type="number"
            value={serviceForm.price}
            onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
          />
        )}

        {serviceForm.pricingType === 'per_vehicle' && (
          <div className="grid grid-cols-3 gap-2">
            <ScInput
              label="Hatchback (₹)"
              type="number"
              value={serviceForm.priceHatchback}
              onChange={(e) => setServiceForm({ ...serviceForm, priceHatchback: e.target.value })}
            />
            <ScInput
              label="Sedan (₹)"
              type="number"
              value={serviceForm.priceSedan}
              onChange={(e) => setServiceForm({ ...serviceForm, priceSedan: e.target.value })}
            />
            <ScInput
              label="SUV (₹)"
              type="number"
              value={serviceForm.priceSuv}
              onChange={(e) => setServiceForm({ ...serviceForm, priceSuv: e.target.value })}
            />
          </div>
        )}

        <ScInput
          label="Duration (mins)"
          type="number"
          value={serviceForm.durationMins}
          onChange={(e) => setServiceForm({ ...serviceForm, durationMins: e.target.value })}
        />
        <ScButton
          disabled={!serviceForm.name || !hasValidPricing(serviceForm) || saving === 'service'}
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
              <div className="min-w-0 pr-2">
                <p className="text-[13px] font-medium">{svc.name}</p>
                {svc.description && (
                  <p className="text-[11px] text-text-muted line-clamp-2">{svc.description}</p>
                )}
                <p className="text-[11px] text-text-secondary">
                  {formatServicePrice(svc)} · {svc.durationMins} min
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
