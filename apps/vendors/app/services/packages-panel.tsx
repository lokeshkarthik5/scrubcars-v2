'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { IconPackage } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
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
  deletePackageImage,
  getMyPackages,
  updatePackage,
  uploadPackageImage,
} from '@repo/core/api/packages'
import { MAX_IMAGES_PER_SERVICE, toggleServiceActive } from '@repo/core/api/services'
import { PRICING_TYPES, formatServicePrice } from '@repo/core/pricing'
import type { PricingType, Service, ServicePackage } from '@repo/core/types'
import { CatalogueImages, RowAction } from './catalogue-row'

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

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

function hasValidPricing(form: PackageForm): boolean {
  if (form.pricingType === 'per_vehicle') {
    // Every tier, matching the server — see hasValidPricing in ./page.tsx.
    return [form.priceHatchback, form.priceSedan, form.priceSuv].every(
      (p) => Number(p) > 0
    )
  }
  return Number(form.price) > 0
}

export function PackagesPanel({ services }: { services: Service[] }) {
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [form, setForm] = useState<PackageForm>(emptyPackageForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  // One hidden file input serves every row; this holds the package the next
  // pick belongs to.
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [imageTargetId, setImageTargetId] = useState<string | null>(null)
  const [imageBusyId, setImageBusyId] = useState<string | null>(null)

  // Only active services can be bundled — the server enforces this too, so
  // showing inactive ones as pickable would just produce a rejected save.
  const selectableServices = useMemo(
    () => services.filter((s) => s.isActive),
    [services]
  )

  useEffect(() => {
    getMyPackages()
      .then(setPackages)
      .catch(() => toast.error('Failed to load packages'))
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
  const suggestedDuration = selected.reduce((sum, s) => sum + s.durationMins, 0)

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
      priceHatchback: pkg.priceHatchback != null ? String(pkg.priceHatchback) : '',
      priceSedan: pkg.priceSedan != null ? String(pkg.priceSedan) : '',
      priceSuv: pkg.priceSuv != null ? String(pkg.priceSuv) : '',
      durationMins: String(pkg.durationMins),
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

  const replacePackage = (updated: ServicePackage) =>
    setPackages((current) =>
      current.map((p) => (p.id === updated.id ? updated : p))
    )

  const pickImage = (packageId: string) => {
    setImageTargetId(packageId)
    imageInputRef.current?.click()
  }

  const handleImageFile = async (files: FileList | null) => {
    const file = files?.[0]
    const packageId = imageTargetId
    // Clear the input first so picking the same file twice still fires change.
    if (imageInputRef.current) imageInputRef.current.value = ''
    if (!file || !packageId) return

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Unsupported type (use JPEG, PNG or WebP)')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Image too large (max 5 MB)')
      return
    }

    setImageBusyId(packageId)
    try {
      replacePackage(await uploadPackageImage(packageId, file))
      toast.success('Image added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setImageBusyId(null)
    }
  }

  const removeImage = async (packageId: string, imageId: string) => {
    setImageBusyId(packageId)
    try {
      replacePackage(await deletePackageImage(packageId, imageId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove image')
    } finally {
      setImageBusyId(null)
    }
  }

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
        title="Packages need two services"
        subtitle="Add at least 2 active services before building a package."
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
      <input
        ref={imageInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        hidden
        onChange={(e) => handleImageFile(e.target.files)}
      />

      <section className="flex flex-col gap-3">
        <SectionHeader
          title={editingId ? 'Edit package' : 'Build a package'}
          action={
            editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="-my-2 min-h-11 px-1 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
              >
                Cancel edit
              </button>
            ) : undefined
          }
        />
        <ScCard className="flex flex-col gap-3">
          <ScInput
            label="Package name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <ScTextarea
            label="Description (optional)"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div>
            <p className="mb-2 text-[11px] font-medium text-text-secondary">
              Services included (<span className="font-numeric">{form.serviceIds.length}</span>{' '}
              selected · minimum <span className="font-numeric">2</span>)
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
            <p className="mb-2 text-[11px] font-medium text-text-secondary">Pricing</p>
            <div className="flex flex-wrap gap-2">
              {PRICING_TYPES.map((pt) => (
                <Chip
                  key={pt.value}
                  label={pt.label}
                  selected={form.pricingType === pt.value}
                  onClick={() => setForm({ ...form, pricingType: pt.value })}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-text-muted">
              {PRICING_TYPES.find((pt) => pt.value === form.pricingType)?.hint}
            </p>
          </div>

          {(form.pricingType === 'flat' || form.pricingType === 'on_inspection') && (
            <ScInput
              label={
                form.pricingType === 'on_inspection'
                  ? 'Inspection fee (₹)'
                  : 'Package price (₹)'
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
                label="Hatchback (₹)"
                type="number"
                className="font-numeric"
                value={form.priceHatchback}
                onChange={(e) => setForm({ ...form, priceHatchback: e.target.value })}
              />
              <ScInput
                label="Sedan (₹)"
                type="number"
                className="font-numeric"
                value={form.priceSedan}
                onChange={(e) => setForm({ ...form, priceSedan: e.target.value })}
              />
              <ScInput
                label="SUV (₹)"
                type="number"
                className="font-numeric"
                value={form.priceSuv}
                onChange={(e) => setForm({ ...form, priceSuv: e.target.value })}
              />
            </div>
          )}

          <div>
            <ScInput
              label="Duration (mins)"
              type="number"
              className="font-numeric"
              value={form.durationMins}
              onChange={(e) => setForm({ ...form, durationMins: e.target.value })}
            />
            {suggestedDuration > 0 &&
              Number(form.durationMins) !== suggestedDuration && (
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, durationMins: String(suggestedDuration) })
                  }
                  className="mt-1 min-h-11 text-[12px] font-medium text-text-primary underline underline-offset-2"
                >
                  Services add up to <span className="font-numeric">{suggestedDuration}</span> min — use that
                </button>
              )}
          </div>

          {selected.length > 0 && (
            // Raised onto graphite: it is a preview of what the customer sees,
            // not part of the form. Savings in green, as the customer's own
            // discount line is.
            <div className="rounded-[12px] bg-surface-elevated p-3">
              <p className="text-[11px] text-text-secondary">
                Bought separately: <span className="font-numeric">₹{itemsTotal}</span>
              </p>
              {previewSavings > 0 ? (
                <p className="text-[12px] font-medium text-success">
                  Customers save <span className="font-numeric">₹{previewSavings}</span>
                </p>
              ) : (
                <p className="text-[11px] text-text-muted">
                  Price the package below <span className="font-numeric">₹{itemsTotal}</span> to show a savings badge.
                </p>
              )}
            </div>
          )}

          <ScButton disabled={!canSubmit || saving === 'package'} onClick={submit}>
            {saving === 'package'
              ? 'Saving...'
              : editingId
                ? 'Update package'
                : 'Create package'}
          </ScButton>
        </ScCard>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Your packages"
          action={
            packages.length > 0 ? (
              <span className="font-numeric text-[12px] text-text-muted">{packages.length}</span>
            ) : undefined
          }
        />
        {packages.length === 0 ? (
          <EmptyState
            icon={<IconPackage size={28} stroke={1.5} />}
            title="No packages yet"
            subtitle="Bundle 2 or more services to create one."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {packages.map((pkg, i) => (
              <Reveal key={pkg.id} index={i}>
                <ScCard className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-text-primary">{pkg.name}</p>
                      {pkg.description && (
                        <p className="line-clamp-2 text-[11px] text-text-muted">
                          {pkg.description}
                        </p>
                      )}
                      <p className="mt-0.5 text-[12px] text-text-secondary">
                        <Figures text={formatServicePrice(pkg)} /> ·{' '}
                        <span className="font-numeric">{pkg.durationMins}</span> min
                      </p>
                      <p className="mt-1 text-[11px] text-text-muted">
                        {pkg.items.map((item) => item.name).join(' + ')}
                      </p>
                      {pkg.savings !== null && (
                        <p className="mt-1 text-[11px] font-medium text-success">
                          Saves <span className="font-numeric">₹{pkg.savings}</span> vs{' '}
                          <span className="font-numeric">₹{pkg.itemsTotal}</span> separately
                        </p>
                      )}
                      {/* Amber: a problem to fix, not a button. */}
                      {pkg.hasInactiveItems && (
                        <p className="mt-1 text-[11px] text-warning">
                          Contains a disabled service — customers still see it listed.
                        </p>
                      )}
                    </div>
                    <ScBadge variant={pkg.isActive ? 'success' : 'muted'} className="shrink-0">
                      {pkg.isActive ? 'Active' : 'Inactive'}
                    </ScBadge>
                  </div>

                  {/* Images — shown to customers in the package details popup. */}
                  <CatalogueImages
                    name={pkg.name}
                    images={pkg.images}
                    max={MAX_IMAGES_PER_SERVICE}
                    busy={imageBusyId === pkg.id}
                    onAdd={() => pickImage(pkg.id)}
                    onRemove={(imageId) => removeImage(pkg.id, imageId)}
                  />

                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    <RowAction onClick={() => startEdit(pkg)}>Edit</RowAction>
                    <RowAction onClick={() => setPackageActive(pkg.id, !pkg.isActive)}>
                      {pkg.isActive ? 'Disable' : 'Enable'}
                    </RowAction>
                    <RowAction onClick={() => remove(pkg.id)}>Delete</RowAction>
                  </div>
                </ScCard>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
