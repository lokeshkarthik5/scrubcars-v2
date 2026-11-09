'use client'

import { useEffect, useMemo, useState } from 'react'
import { IconPackage } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { effectiveDurationMins } from '@repo/core/service-duration'
import { fill, useT } from '@repo/core/i18n'
import { t } from '@repo/core/i18n/translate'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { Chip } from '@repo/ui/sc/chip'
import { EmptyState } from '@repo/ui/sc/empty-state'
import { Figures } from '@repo/ui/sc/figures'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { Reveal } from '@repo/ui/sc/reveal'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import {
  createPackage,
  deletePackage,
  getMyPackages,
  updatePackage,
} from '@repo/core/api/packages'
import { toggleServiceActive } from '@repo/core/api/services'
import { garageMediaApi, type MediaConfig } from '@repo/core/api/service-media'
import { withMedia } from '@repo/core/service-media'
import { ServiceMediaEditor } from '@repo/ui/features/service-media-editor'
import { PRICING_TYPES, formatServicePrice } from '@repo/core/pricing'
import type {
  PricingType,
  Service,
  ServiceMedia,
  ServicePackage,
} from '@repo/core/types'
import { RowAction } from './catalogue-row'

/** Said from an effect, so it reads the language in use without being one of the effect's dependencies. */
const loadFailed = () => t('Failed to load packages')

type PackageForm = {
  name: string
  description: string
  pricingType: PricingType
  price: string
  priceHatchback: string
  priceSedan: string
  priceSuv: string
  durationMins: string
  serviceIds: string[]
}

const emptyPackageForm: PackageForm = {
  name: '',
  description: '',
  pricingType: 'flat',
  price: '',
  priceHatchback: '',
  priceSedan: '',
  priceSuv: '',
  durationMins: '60',
  serviceIds: [],
}

function hasValidPricing(form: PackageForm): boolean {
  if (form.pricingType === 'per_vehicle') {
    // Every tier, matching the server — see hasValidPricing in ./page.tsx.
    return [form.priceHatchback, form.priceSedan, form.priceSuv].every(
      (p) => Number(p) > 0
    )
  }
  return Number(form.price) > 0
}

export function PackagesPanel({
  services,
  mediaConfig,
}: {
  services: Service[]
  /** The photo-and-video block's config, fetched once by the page. */
  mediaConfig: MediaConfig | null
}) {
  const t = useT()
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [form, setForm] = useState<PackageForm>(emptyPackageForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // Only active services can be bundled — the server enforces this too, so
  // showing inactive ones as pickable would just produce a rejected save.
  const selectableServices = useMemo(
    () => services.filter((s) => s.isActive),
    [services]
  )

  useEffect(() => {
    getMyPackages()
      .then(setPackages)
      .catch(() => toast.error(loadFailed()))
      .finally(() => setLoading(false))
  }, [])

  const selected = useMemo(
    () => selectableServices.filter((s) => form.serviceIds.includes(s.id)),
    [selectableServices, form.serviceIds]
  )

  // Live preview of what the customer will see, computed from the same base
  // prices the server uses so the badge here matches the badge there.
  const itemsTotal = selected.reduce((sum, s) => sum + s.price, 0)
  const previewPrice =
    form.pricingType === 'per_vehicle'
      ? Math.min(
          ...[form.priceHatchback, form.priceSedan, form.priceSuv]
            .map(Number)
            .filter((n) => n > 0)
        )
      : Number(form.price)
  const previewSavings =
    Number.isFinite(previewPrice) && previewPrice > 0
      ? itemsTotal - previewPrice
      : 0
  // A member with no duration set holds the default 60 min (0064).
  const suggestedDuration = selected.reduce(
    (sum, s) => sum + effectiveDurationMins(s),
    0
  )

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

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyPackageForm)
  }

  const toggleItem = (serviceId: string) =>
    setForm((current) => ({
      ...current,
      serviceIds: current.serviceIds.includes(serviceId)
        ? current.serviceIds.filter((id) => id !== serviceId)
        : [...current.serviceIds, serviceId],
    }))

  const submit = () =>
    runAction('package', async () => {
      const num = (v: string) => (Number(v) > 0 ? Number(v) : undefined)
      const payload = {
        name: form.name,
        description: form.description,
        pricingType: form.pricingType,
        price: num(form.price),
        priceHatchback: num(form.priceHatchback),
        priceSedan: num(form.priceSedan),
        priceSuv: num(form.priceSuv),
        durationMins: Number(form.durationMins),
        serviceIds: form.serviceIds,
      }

      if (editingId) {
        const updated = await updatePackage(editingId, payload)
        setPackages((current) =>
          current.map((p) => (p.id === editingId ? updated : p))
        )
      } else {
        const created = await createPackage(payload)
        setPackages((current) => [...current, created])
      }

      resetForm()
    })

  const startEdit = (pkg: ServicePackage) => {
    setEditingId(pkg.id)
    setForm({
      name: pkg.name,
      description: pkg.description ?? '',
      pricingType: pkg.pricingType,
      price:
        pkg.pricingType === 'flat' || pkg.pricingType === 'on_inspection'
          ? String(pkg.price)
          : '',
      priceHatchback:
        pkg.priceHatchback != null ? String(pkg.priceHatchback) : '',
      priceSedan: pkg.priceSedan != null ? String(pkg.priceSedan) : '',
      priceSuv: pkg.priceSuv != null ? String(pkg.priceSuv) : '',
      durationMins: pkg.durationMins != null ? String(pkg.durationMins) : '',
      serviceIds: pkg.items.map((item) => item.serviceId),
    })
  }

  const setPackageActive = (id: string, isActive: boolean) =>
    runAction(`package-active-${id}`, async () => {
      await toggleServiceActive(id, isActive)
      setPackages((current) =>
        current.map((p) => (p.id === id ? { ...p, isActive } : p))
      )
    })

  // A package is a services row, so it shares the services' photo and video
  // routes.
  const setPackageMedia = (packageId: string, media: ServiceMedia[]) =>
    setPackages((current) =>
      current.map((p) => (p.id === packageId ? withMedia(p, media) : p))
    )

  // Delete asks first, as a service's does (UX audit, garage finding 5).
  const [deleting, setDeleting] = useState<(typeof packages)[number] | null>(
    null
  )

  const remove = (id: string) =>
    runAction(`package-delete-${id}`, async () => {
      await deletePackage(id)
      setPackages((current) => current.filter((p) => p.id !== id))
      if (editingId === id) resetForm()
    })

  if (loading) {
    return <SkeletonList count={2} itemClassName="h-28" />
  }

  if (selectableServices.length < 2) {
    return (
      <EmptyState
        icon={<IconPackage size={28} stroke={1.5} />}
        title={t('Packages need two services')}
        subtitle={t('Add at least 2 active services before building a package.')}
      />
    )
  }

  const canSubmit =
    form.name.trim().length > 0 &&
    form.serviceIds.length >= 2 &&
    hasValidPricing(form) &&
    Number(form.durationMins) > 0

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={editingId ? t('Edit package') : t('Build a package')}
          action={
            editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="-my-2 min-h-11 px-1 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
              >
                {t('Cancel edit')}
              </button>
            ) : undefined
          }
        />
        <ScCard className="flex flex-col gap-3">
          <ScInput
            label={t('Package name')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <ScTextarea
            label={t('Description (optional)')}
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div>
            <p className="mb-2 text-[11px] font-medium text-text-secondary">
              {fill(t('Services included ({count} selected · minimum {min})'), {
                count: <span className="font-numeric">{form.serviceIds.length}</span>,
                min: <span className="font-numeric">2</span>,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              {selectableServices.map((svc) => (
                <Chip
                  key={svc.id}
                  label={`${svc.name} · ₹${svc.price}`}
                  selected={form.serviceIds.includes(svc.id)}
                  onClick={() => toggleItem(svc.id)}
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
                  selected={form.pricingType === pt.value}
                  onClick={() => setForm({ ...form, pricingType: pt.value })}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-text-muted">
              {t(PRICING_TYPES.find((pt) => pt.value === form.pricingType)?.hint ?? '')}
            </p>
          </div>

          {(form.pricingType === 'flat' ||
            form.pricingType === 'on_inspection') && (
            <ScInput
              label={
                form.pricingType === 'on_inspection'
                  ? t('Inspection fee (₹)')
                  : t('Package price (₹)')
              }
              type="number"
              className="font-numeric"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          )}

          {form.pricingType === 'per_vehicle' && (
            <div className="grid grid-cols-3 gap-2">
              <ScInput
                label={t('Hatchback (₹)')}
                type="number"
                className="font-numeric"
                value={form.priceHatchback}
                onChange={(e) =>
                  setForm({ ...form, priceHatchback: e.target.value })
                }
              />
              <ScInput
                label={t('Sedan (₹)')}
                type="number"
                className="font-numeric"
                value={form.priceSedan}
                onChange={(e) =>
                  setForm({ ...form, priceSedan: e.target.value })
                }
              />
              <ScInput
                label={t('SUV (₹)')}
                type="number"
                className="font-numeric"
                value={form.priceSuv}
                onChange={(e) => setForm({ ...form, priceSuv: e.target.value })}
              />
            </div>
          )}

          <div>
            <ScInput
              label={t('Duration (mins)')}
              type="number"
              className="font-numeric"
              value={form.durationMins}
              onChange={(e) =>
                setForm({ ...form, durationMins: e.target.value })
              }
            />
            {suggestedDuration > 0 &&
              Number(form.durationMins) !== suggestedDuration && (
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      durationMins: String(suggestedDuration),
                    })
                  }
                  className="mt-1 min-h-11 text-[12px] font-medium text-text-primary underline underline-offset-2"
                >
                  {fill(t('Services add up to {mins} min — use that'), {
                    mins: <span className="font-numeric">{suggestedDuration}</span>,
                  })}
                </button>
              )}
          </div>

          {selected.length > 0 && (
            // Raised onto graphite: it is a preview of what the customer sees,
            // not part of the form. Savings in green, as the customer's own
            // discount line is.
            <div className="rounded-[12px] bg-surface-elevated p-3">
              <p className="text-[11px] text-text-secondary">
                {fill(t('Bought separately: {amount}'), {
                  amount: <span className="font-numeric">₹{itemsTotal}</span>,
                })}
              </p>
              {previewSavings > 0 ? (
                <p className="text-[12px] font-medium text-success">
                  {fill(t('Customers save {amount}'), {
                    amount: <span className="font-numeric">₹{previewSavings}</span>,
                  })}
                </p>
              ) : (
                <p className="text-[11px] text-text-muted">
                  {fill(t('Price the package below {amount} to show a savings badge.'), {
                    amount: <span className="font-numeric">₹{itemsTotal}</span>,
                  })}
                </p>
              )}
            </div>
          )}

          <ScButton
            variant="main"
            size="lg"
            disabled={!canSubmit || saving === 'package'}
            onClick={submit}
          >
            {saving === 'package'
              ? t('Saving...')
              : editingId
                ? t('Update package')
                : t('Create package')}
          </ScButton>
        </ScCard>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title={t('Your packages')}
          action={
            packages.length > 0 ? (
              <span className="font-numeric text-[12px] text-text-muted">
                {packages.length}
              </span>
            ) : undefined
          }
        />
        {packages.length === 0 ? (
          <EmptyState
            icon={<IconPackage size={28} stroke={1.5} />}
            title={t('No packages yet')}
            subtitle={t('Bundle 2 or more services to create one.')}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {packages.map((pkg, i) => (
              <Reveal key={pkg.id} index={i}>
                <ScCard className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-text-primary">
                        {pkg.name}
                      </p>
                      {pkg.description && (
                        <p className="line-clamp-2 text-[11px] text-text-muted">
                          {pkg.description}
                        </p>
                      )}
                      <p className="mt-0.5 text-[12px] text-text-secondary">
                        <Figures text={formatServicePrice(pkg)} />
                        {pkg.durationMins != null && (
                          <>
                            {' '}
                            ·{' '}
                            <span className="font-numeric">
                              {pkg.durationMins}
                            </span>{' '}
                            min
                          </>
                        )}
                      </p>
                      <p className="mt-1 text-[11px] text-text-muted">
                        {pkg.items.map((item) => item.name).join(' + ')}
                      </p>
                      {pkg.savings !== null && (
                        <p className="mt-1 text-[11px] font-medium text-success">
                          {fill(t('Saves {amount} vs {total} separately'), {
                            amount: <span className="font-numeric">₹{pkg.savings}</span>,
                            total: (
                              <span className="font-numeric">
                                ₹{pkg.itemsTotal}
                              </span>
                            ),
                          })}
                        </p>
                      )}
                      {/* Amber: a problem to fix, not a button. */}
                      {pkg.hasInactiveItems && (
                        <p className="mt-1 text-[11px] text-warning">
                          {t('Contains a disabled service — customers still see it listed.')}
                        </p>
                      )}
                    </div>
                    <ScBadge
                      variant={pkg.isActive ? 'success' : 'muted'}
                      className="shrink-0"
                    >
                      {pkg.isActive ? t('Active') : t('Inactive')}
                    </ScBadge>
                  </div>

                  {/* Photos and video — shown to customers in the package
                      details sheet, the same block as a service's. */}
                  <div className="border-t border-border pt-3">
                    <ServiceMediaEditor
                      serviceId={pkg.id}
                      serviceName={pkg.name}
                      media={pkg.media}
                      onMediaChange={(media) => setPackageMedia(pkg.id, media)}
                      api={garageMediaApi}
                      config={mediaConfig}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    <RowAction onClick={() => startEdit(pkg)}>{t('Edit')}</RowAction>
                    <RowAction
                      onClick={() => setPackageActive(pkg.id, !pkg.isActive)}
                    >
                      {pkg.isActive ? t('Disable') : t('Enable')}
                    </RowAction>
                    <RowAction onClick={() => setDeleting(pkg)}>
                      {t('Delete')}
                    </RowAction>
                  </div>
                </ScCard>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        level="firm"
        title={
          deleting
            ? t('Delete {name}?', { name: deleting.name })
            : t('Delete this package?')
        }
        body={t(
          "Customers can't book it any more, and it can't be undone. To stop it for a while, Disable it instead."
        )}
        confirmLabel={t('Delete package')}
        onConfirm={async () => {
          if (deleting) await remove(deleting.id)
          setDeleting(null)
        }}
      />
    </div>
  )
}
