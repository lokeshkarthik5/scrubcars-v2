'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconTool } from '@tabler/icons-react'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { Figures } from '@repo/ui/sc/figures'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { Reveal } from '@repo/ui/sc/reveal'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/sc/tabs'
import { TopBar } from '@repo/ui/sc/top-bar'
import { Chip } from '@repo/ui/sc/chip'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import {
  createService,
  deleteService,
  getMyServices,
  toggleServiceActive,
  updateService,
} from '@repo/core/api/services'
import { garageMediaApi, type MediaConfig } from '@repo/core/api/service-media'
import { withMedia } from '@repo/core/service-media'
import type { ServiceMedia } from '@repo/core/types'
import { ServiceMediaEditor } from '@repo/ui/features/service-media-editor'
import { toast } from 'react-toastify'
import type { PricingType, Service, ServiceCategory } from '@repo/core/types'
import { SERVICE_CATEGORY_OPTIONS } from '@repo/core/categories'
import { ActiveGarage } from '@/components/active-garage'
import { RowAction } from './catalogue-row'
import { PackagesPanel } from './packages-panel'
import { PRICING_TYPES, formatServicePrice } from '@repo/core/pricing'

const SERVICE_CATEGORIES = SERVICE_CATEGORY_OPTIONS

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
    // Every tier, matching the server: a gap would leave that vehicle unable
    // to book (see refinePricing in vendors.validation.ts).
    return [form.priceHatchback, form.priceSedan, form.priceSuv].every(
      (p) => Number(p) > 0
    )
  }
  return Number(form.price) > 0
}

export default function VendorServicesPage() {
  const isVendorAdmin = useIsVendorAdmin()
  const roleRouter = useRouter()

  // Catalogue and media are vendor_admin-only server-side, and an operator's
  // nav has no tab for either, so this is only reachable by typing the URL.
  useEffect(() => {
    if (!isVendorAdmin) roleRouter.replace('/home')
  }, [isVendorAdmin, roleRouter])
  const [tab, setTab] = useState<'services' | 'packages'>('services')
  const [services, setServices] = useState<Service[]>([])
  const [serviceForm, setServiceForm] = useState<ServiceForm>(emptyServiceForm)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  // What the photo-and-video block may offer (video only once Stream is set
  // up on the server). Shared by every service and package on the screen.
  const [mediaConfig, setMediaConfig] = useState<MediaConfig | null>(null)

  useEffect(() => {
    getMyServices()
      .then(setServices)
      .catch(() => toast.error('Failed to load services'))
      .finally(() => setLoading(false))
    garageMediaApi
      .config()
      .then(setMediaConfig)
      .catch(() => undefined)
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

  const setServiceMedia = (serviceId: string, media: ServiceMedia[]) =>
    setServices((current) =>
      current.map((svc) => (svc.id === serviceId ? withMedia(svc, media) : svc))
    )

  const removeService = (id: string) =>
    runAction(`service-delete-${id}`, async () => {
      await deleteService(id)
      setServices((current) => current.filter((svc) => svc.id !== id))
    })

  if (loading) {
    return (
      <AppShell
        showNav
        navType="vendor"
        showBrand
        brandRight={<ActiveGarage />}
        className="gap-5 py-4"
      >
        <TopBar title="Services" />
        <SkeletonList count={3} itemClassName="h-28" />
      </AppShell>
    )
  }

  return (
    <AppShell
      showNav
      navType="vendor"
      showBrand
      brandRight={<ActiveGarage />}
      className="gap-5 py-4"
    >
      <TopBar title="Services" />

      {/* Real tabs, as in Settings: each is its own panel, and only the open
          one is mounted, so Packages still loads when it is opened. */}
      <Tabs value={tab} onValueChange={(value) => setTab(value as 'services' | 'packages')}>
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
        </TabsList>

        <TabsContent value="packages">
          <PackagesPanel services={services} mediaConfig={mediaConfig} />
        </TabsContent>

        <TabsContent value="services">
          <section className="flex flex-col gap-3">
            <SectionHeader
              title={editingServiceId ? 'Edit service' : 'Add a service'}
              action={
                editingServiceId ? (
                  <button
                    type="button"
                    onClick={resetServiceForm}
                    className="-my-2 min-h-11 px-1 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                  >
                    Cancel edit
                  </button>
                ) : undefined
              }
            />
            <ScCard className="flex flex-col gap-3">
              <ScInput
                id="service-name"
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
                  id="service-price"
                  label={
                    serviceForm.pricingType === 'on_inspection'
                      ? 'Inspection fee (₹)'
                      : 'Price (₹)'
                  }
                  type="number"
                  className="font-numeric"
                  value={serviceForm.price}
                  onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
                />
              )}

              {serviceForm.pricingType === 'per_vehicle' && (
                <div className="grid grid-cols-3 gap-2">
                  <ScInput
                    label="Hatchback (₹)"
                    type="number"
                    className="font-numeric"
                    value={serviceForm.priceHatchback}
                    onChange={(e) => setServiceForm({ ...serviceForm, priceHatchback: e.target.value })}
                  />
                  <ScInput
                    label="Sedan (₹)"
                    type="number"
                    className="font-numeric"
                    value={serviceForm.priceSedan}
                    onChange={(e) => setServiceForm({ ...serviceForm, priceSedan: e.target.value })}
                  />
                  <ScInput
                    label="SUV (₹)"
                    type="number"
                    className="font-numeric"
                    value={serviceForm.priceSuv}
                    onChange={(e) => setServiceForm({ ...serviceForm, priceSuv: e.target.value })}
                  />
                </div>
              )}

              <ScInput
                id="service-duration"
                label="Duration (mins)"
                type="number"
                className="font-numeric"
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
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Your services"
              action={
                services.length > 0 ? (
                  <span className="font-numeric text-[12px] text-text-muted">{services.length}</span>
                ) : undefined
              }
            />
            {services.length === 0 ? (
              <EmptyState
                icon={<IconTool size={28} stroke={1.5} />}
                title="No services yet"
                subtitle="Add what you offer above. Customers can book a service once it is active."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {services.map((svc, i) => (
                  <Reveal key={svc.id} index={i}>
                    <ScCard className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-text-primary">{svc.name}</p>
                          {svc.description && (
                            <p className="line-clamp-2 text-[11px] text-text-muted">{svc.description}</p>
                          )}
                          <p className="mt-0.5 text-[12px] text-text-secondary">
                            <Figures text={formatServicePrice(svc)} /> ·{' '}
                            <span className="font-numeric">{svc.durationMins}</span> min
                          </p>
                        </div>
                        <ScBadge variant={svc.isActive ? 'success' : 'muted'} className="shrink-0">
                          {svc.isActive ? 'Active' : 'Inactive'}
                        </ScBadge>
                      </div>

                      {/* Photos and video, shown to customers on the garage
                          page: the card's thumbnail and the details sheet. */}
                      <div className="border-t border-border pt-3">
                        <ServiceMediaEditor
                          serviceId={svc.id}
                          serviceName={svc.name}
                          media={svc.media}
                          onMediaChange={(media) => setServiceMedia(svc.id, media)}
                          api={garageMediaApi}
                          config={mediaConfig}
                        />
                      </div>

                      {/* Quiet outlines, all three: none of them is what this
                          screen is for, and its red is the form's Add service. */}
                      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                        <RowAction onClick={() => startEditService(svc)}>Edit</RowAction>
                        <RowAction onClick={() => setServiceActive(svc.id, !svc.isActive)}>
                          {svc.isActive ? 'Disable' : 'Enable'}
                        </RowAction>
                        <RowAction onClick={() => removeService(svc.id)}>Delete</RowAction>
                      </div>
                    </ScCard>
                  </Reveal>
                ))}
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </AppShell>
  )
}
