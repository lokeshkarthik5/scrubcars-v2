'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCheck, IconPhoto, IconPlus, IconTool } from '@tabler/icons-react'
import { useT } from '@repo/core/i18n'
import { t } from '@repo/core/i18n/translate'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { ScButton } from '@repo/ui/sc/button'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { Reveal } from '@repo/ui/sc/reveal'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { GraphiteTabsList, GraphiteTabsTrigger } from '@repo/ui/finish/graphite-tabs'
import { Tabs, TabsContent } from '@repo/ui/sc/tabs'
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
import {
  SERVICE_CATEGORY_OPTIONS,
  groupByCategory,
  showCategoryHeadings,
} from '@repo/core/categories'
import { ActiveGarage } from '@/components/active-garage'
import { CategoryHeading } from '@/components/category-heading'
import { RowAction } from './catalogue-row'
import { CatalogueCard, EditHeader } from '@/components/hub/catalogue-card'
import { HubPill, HubSectionHead, HubTile, TileRow } from '@/components/hub/parts'
import { AddOnsSection } from './add-ons-section'
import { PackagesPanel } from './packages-panel'
import {
  PRICING_TYPES,
  formatServicePrice,
  inspectionNoteUnderPrice,
} from '@repo/core/pricing'
import { InspectionPriceFields } from '@/components/inspection-price-fields'
import {
  approxBoxFrom,
  approxToSend,
  feeBoxFrom,
  inspectionPricingValid,
} from '@/lib/inspection-price'

const SERVICE_CATEGORIES = SERVICE_CATEGORY_OPTIONS

/** Said from an effect, so it reads the language in use without being one of the effect's dependencies. */
const loadFailed = () => t('Failed to load services')

type ServiceForm = {
  name: string
  description: string
  category: ServiceCategory
  pricingType: PricingType
  price: string
  priceHatchback: string
  priceSedan: string
  priceSuv: string
  /** On inspection only (0073): the optional approx price. */
  approxPrice: string
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
  approxPrice: '',
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
  // On inspection the fee is optional: empty is a free inspection (0073).
  if (form.pricingType === 'on_inspection') {
    return inspectionPricingValid(form.price, form.approxPrice)
  }
  return Number(form.price) > 0
}

export default function VendorServicesPage() {
  const t = useT()
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
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  // What the photo-and-video block may offer (video only once Stream is set
  // up on the server). Shared by every service and package on the screen.
  const [mediaConfig, setMediaConfig] = useState<MediaConfig | null>(null)

  useEffect(() => {
    getMyServices()
      .then(setServices)
      .catch(() => toast.error(loadFailed()))
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
      toast.success(t('Saved successfully'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Something went wrong'))
    } finally {
      setSaving(null)
    }
  }

  const resetServiceForm = () => {
    setEditingServiceId(null)
    setAdding(false)
    setServiceForm(emptyServiceForm)
  }

  // The add form opens from "Add a service" (and is simply there while the
  // garage has no services yet, as the first thing to do).
  const openAddForm = () => {
    setEditingServiceId(null)
    setServiceForm(emptyServiceForm)
    setAdding(true)
    window.scrollTo({ top: 0 })
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
        // Sent for On inspection only (core's pricingPayload); null clears it.
        approxPrice: approxToSend(serviceForm.approxPrice),
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
    setAdding(false)
    setEditingServiceId(svc.id)
    // The edit view opens at its top, wherever the card was in the list.
    window.scrollTo({ top: 0 })
    setServiceForm({
      name: svc.name,
      description: svc.description ?? '',
      category: svc.category,
      pricingType: svc.pricingType,
      price:
        svc.pricingType === 'flat'
          ? String(svc.price)
          : svc.pricingType === 'on_inspection'
            ? // A free inspection's box starts empty, never "0" (0073).
              feeBoxFrom(svc)
            : '',
      priceHatchback:
        svc.priceHatchback != null ? String(svc.priceHatchback) : '',
      priceSedan: svc.priceSedan != null ? String(svc.priceSedan) : '',
      priceSuv: svc.priceSuv != null ? String(svc.priceSuv) : '',
      approxPrice: approxBoxFrom(svc),
      // Admin may leave a duration unset (0064): the box starts empty.
      durationMins: svc.durationMins != null ? String(svc.durationMins) : '',
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

  // Delete asks first (UX audit, garage finding 5): one brushed tap used to
  // remove a priced service at once.
  const [deleting, setDeleting] = useState<(typeof services)[number] | null>(
    null
  )

  const removeService = (id: string) =>
    runAction(`service-delete-${id}`, async () => {
      await deleteService(id)
      setServices((current) => current.filter((svc) => svc.id !== id))
      if (editingServiceId === id) resetServiceForm()
    })

  // "Your services" by category, in the order used everywhere.
  const serviceGroups = groupByCategory(services, (svc) => svc.category)
  const editingService = editingServiceId
    ? (services.find((svc) => svc.id === editingServiceId) ?? null)
    : null
  const addOpen = !editingService && (adding || services.length === 0)
  const activeCount = services.filter((svc) => svc.isActive).length
  const withPhotos = services.filter((svc) => svc.media.length > 0).length

  // The one service form: Add a service's, and the edit view's.
  const serviceFormCard = (
    <div className="hub-card flex flex-col gap-3 px-5 py-5">
      <ScInput
        id="service-name"
        label={t('Service name')}
        value={serviceForm.name}
        onChange={(e) =>
          setServiceForm({ ...serviceForm, name: e.target.value })
        }
      />
      <ScTextarea
        label={t('Description (optional)')}
        rows={2}
        value={serviceForm.description}
        onChange={(e) =>
          setServiceForm({
            ...serviceForm,
            description: e.target.value,
          })
        }
      />
      <div>
        <p className="mb-2 text-[11px] font-medium text-text-secondary">
          {t('Category')}
        </p>
        <div className="flex flex-wrap gap-2">
          {SERVICE_CATEGORIES.map((cat) => (
            <Chip
              key={cat.value}
              label={t(cat.label)}
              selected={serviceForm.category === cat.value}
              onClick={() =>
                setServiceForm({ ...serviceForm, category: cat.value })
              }
            />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium text-text-secondary">
          {t('Pricing')}
        </p>
        <div className="flex flex-wrap gap-2">
          {PRICING_TYPES.map((pt) => (
            <Chip
              key={pt.value}
              label={t(pt.label)}
              selected={serviceForm.pricingType === pt.value}
              onClick={() =>
                setServiceForm({
                  ...serviceForm,
                  pricingType: pt.value,
                })
              }
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-text-muted">
          {t(
            PRICING_TYPES.find(
              (pt) => pt.value === serviceForm.pricingType
            )?.hint ?? ''
          )}
        </p>
      </div>

      {serviceForm.pricingType === 'flat' && (
        <ScInput
          id="service-price"
          label={t('Price (₹)')}
          type="number"
          className="font-numeric"
          value={serviceForm.price}
          onChange={(e) =>
            setServiceForm({ ...serviceForm, price: e.target.value })
          }
        />
      )}

      {serviceForm.pricingType === 'on_inspection' && (
        <InspectionPriceFields
          idPrefix="service"
          fee={serviceForm.price}
          approx={serviceForm.approxPrice}
          onFee={(price) => setServiceForm({ ...serviceForm, price })}
          onApprox={(approxPrice) =>
            setServiceForm({ ...serviceForm, approxPrice })
          }
        />
      )}

      {serviceForm.pricingType === 'per_vehicle' && (
        <div className="grid grid-cols-3 gap-2">
          <ScInput
            label={t('Hatchback (₹)')}
            type="number"
            className="font-numeric"
            value={serviceForm.priceHatchback}
            onChange={(e) =>
              setServiceForm({
                ...serviceForm,
                priceHatchback: e.target.value,
              })
            }
          />
          <ScInput
            label={t('Sedan (₹)')}
            type="number"
            className="font-numeric"
            value={serviceForm.priceSedan}
            onChange={(e) =>
              setServiceForm({
                ...serviceForm,
                priceSedan: e.target.value,
              })
            }
          />
          <ScInput
            label={t('SUV (₹)')}
            type="number"
            className="font-numeric"
            value={serviceForm.priceSuv}
            onChange={(e) =>
              setServiceForm({
                ...serviceForm,
                priceSuv: e.target.value,
              })
            }
          />
        </div>
      )}

      <ScInput
        id="service-duration"
        label={t('Duration (mins)')}
        type="number"
        className="font-numeric"
        value={serviceForm.durationMins}
        onChange={(e) =>
          setServiceForm({
            ...serviceForm,
            durationMins: e.target.value,
          })
        }
      />
      <ScButton
        variant="main"
        size="lg"
        disabled={
          !serviceForm.name ||
          !hasValidPricing(serviceForm) ||
          saving === 'service'
        }
        onClick={submitService}
      >
        {saving === 'service'
          ? t('Saving...')
          : editingServiceId
            ? t('Update service')
            : t('Add service')}
      </ScButton>
    </div>
  )

  if (loading) {
    return (
      <AppShell
        showNav
        navType="vendor"
        showBrand
        brandRight={<ActiveGarage />}
        className="gap-3 py-4"
      >
        <TopBar title={t('Services')} large />
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
      className="gap-3 py-4"
    >
      <TopBar title={t('Services')} large />

      {/* Real tabs, as in Settings: each is its own panel, and only the open
          one is mounted, so Packages still loads when it is opened. */}
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as 'services' | 'packages')}
      >
        <GraphiteTabsList value={tab} aria-label={t('Services')}>
          <GraphiteTabsTrigger value="services">{t('Services')}</GraphiteTabsTrigger>
          <GraphiteTabsTrigger value="packages">{t('Packages')}</GraphiteTabsTrigger>
        </GraphiteTabsList>

        <TabsContent value="packages">
          <PackagesPanel services={services} mediaConfig={mediaConfig} />
        </TabsContent>

        <TabsContent value="services">
          {editingService ? (
            // A service's edit view (mockup garage-hub 3): its form, then the
            // photo-and-video block and Disable and Delete, which used to sit
            // on every card of the list.
            <div className="flex flex-col gap-3">
              <EditHeader
                title={t('Edit service')}
                onBack={resetServiceForm}
                backLabel={t('Cancel edit')}
              />
              {serviceFormCard}
              {/* Photos and video, shown to customers on the garage page:
                  the card's thumbnail and the details sheet. */}
              <div className="hub-card px-5 py-5">
                <ServiceMediaEditor
                  serviceId={editingService.id}
                  serviceName={editingService.name}
                  media={editingService.media}
                  onMediaChange={(media) =>
                    setServiceMedia(editingService.id, media)
                  }
                  api={garageMediaApi}
                  config={mediaConfig}
                />
              </div>

              {/* Quiet outlines: the screen's one red is Update service. */}
              <div className="flex flex-wrap gap-2">
                <RowAction
                  onClick={() =>
                    setServiceActive(editingService.id, !editingService.isActive)
                  }
                >
                  {editingService.isActive ? t('Disable') : t('Enable')}
                </RowAction>
                <RowAction onClick={() => setDeleting(editingService)}>
                  {t('Delete')}
                </RowAction>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {services.length > 0 && (
                <TileRow>
                  <HubTile
                    label={t('Active')}
                    icon={IconCheck}
                    value={activeCount}
                    line={t('On your listing')}
                  />
                  <HubTile
                    label={t('Photos & video')}
                    icon={IconPhoto}
                    value={`${withPhotos} / ${services.length}`}
                    line={t('Services with photos')}
                  />
                </TileRow>
              )}

              {addOpen && (
                <section className="flex flex-col gap-3">
                  <HubSectionHead
                    title={t('Add a service')}
                    action={
                      services.length > 0 ? (
                        <button
                          type="button"
                          onClick={resetServiceForm}
                          className="-my-2 min-h-11 px-1 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                        >
                          {t('Cancel')}
                        </button>
                      ) : undefined
                    }
                  />
              {serviceFormCard}
                </section>
              )}

              {services.length === 0 ? (
                <EmptyState
                  icon={<IconTool size={28} stroke={1.5} />}
                  title={t('No services yet')}
                  subtitle={t(
                    'Add what you offer above. Customers can book a service once it is active.'
                  )}
                />
              ) : (
                <section aria-label={t('Your services')} className="flex flex-col gap-3">
                  {/* Under small category headings when the garage sells two
                      or more kinds of work (16 Nov 2026); one run otherwise. */}
                  {(showCategoryHeadings(serviceGroups)
                    ? serviceGroups
                    : [{ category: null, items: services }]
                  ).map((group) => (
                    <div
                      key={group.category ?? 'all'}
                      className="flex flex-col gap-3"
                    >
                      {group.category && (
                        <CategoryHeading
                          category={group.category}
                          count={group.items.length}
                        />
                      )}
                      {group.items.map((svc) => (
                        <Reveal key={svc.id} index={services.indexOf(svc)}>
                          <CatalogueCard
                            name={svc.name}
                            description={svc.description}
                            priceText={formatServicePrice(svc)}
                            note={inspectionNoteUnderPrice(svc)}
                            minutes={svc.durationMins}
                            active={svc.isActive}
                            media={svc.media}
                            onOpen={() => startEditService(svc)}
                          />
                        </Reveal>
                      ))}
                    </div>
                  ))}
                </section>
              )}

              <div className="flex flex-wrap gap-2">
                {!addOpen && (
                  <HubPill onClick={openAddForm} className="flex-1">
                    <IconPlus size={16} aria-hidden="true" />
                    {t('Add a service')}
                  </HubPill>
                )}
              </div>

              {/* Its own "Add add-on" is right under the services, so none sits up here. */}
              <AddOnsSection />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        level="firm"
        title={
          deleting
            ? t('Delete {name}?', { name: deleting.name })
            : t('Delete this service?')
        }
        body={t(
          "Customers can't book it any more, and it can't be undone. To stop it for a while, Disable it instead."
        )}
        confirmLabel={t('Delete service')}
        onConfirm={async () => {
          if (deleting) await removeService(deleting.id)
          setDeleting(null)
        }}
      />
    </AppShell>
  )
}
