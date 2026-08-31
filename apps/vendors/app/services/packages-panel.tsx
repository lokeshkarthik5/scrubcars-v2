'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { IconPhotoPlus, IconTrash } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Chip } from '@repo/ui/sc/chip'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
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
import { cn } from '@repo/core/utils'

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
    return <p className="text-[13px] text-text-secondary">Loading...</p>
  }

  if (selectableServices.length < 2) {
    return (
      <ScCard>
        <p className="text-[13px] text-text-secondary">
          Add at least 2 active services before building a package.
        </p>
      </ScCard>
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

      <ScCard className="flex flex-col gap-3">
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="self-end text-[12px] text-brand-red"
          >
            Cancel edit
          </button>
        )}

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
            Services included ({form.serviceIds.length} selected · minimum 2)
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
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        )}

        {form.pricingType === 'per_vehicle' && (
          <div className="grid grid-cols-3 gap-2">
            <ScInput
              label="Hatchback (₹)"
              type="number"
              value={form.priceHatchback}
              onChange={(e) => setForm({ ...form, priceHatchback: e.target.value })}
            />
            <ScInput
              label="Sedan (₹)"
              type="number"
              value={form.priceSedan}
              onChange={(e) => setForm({ ...form, priceSedan: e.target.value })}
            />
            <ScInput
              label="SUV (₹)"
              type="number"
              value={form.priceSuv}
              onChange={(e) => setForm({ ...form, priceSuv: e.target.value })}
            />
          </div>
        )}

        <div>
          <ScInput
            label="Duration (mins)"
            type="number"
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
                className="mt-1.5 text-[11px] text-brand-red"
              >
                Services add up to {suggestedDuration} min — use that
              </button>
            )}
        </div>

        {selected.length > 0 && (
          <div className="rounded-[12px] bg-surface p-3">
            <p className="text-[11px] text-text-secondary">
              Bought separately: ₹{itemsTotal}
            </p>
            {previewSavings > 0 ? (
              <p className="text-[12px] font-medium text-brand-red">
                Customers save ₹{previewSavings}
              </p>
            ) : (
              <p className="text-[11px] text-text-muted">
                Price the package below ₹{itemsTotal} to show a savings badge.
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

      <div className="flex flex-col gap-2">
        {packages.length === 0 ? (
          <ScCard>
            <p className="text-[13px] text-text-secondary">
              No packages yet. Bundle 2 or more services to create one.
            </p>
          </ScCard>
        ) : (
          packages.map((pkg) => (
            <ScCard key={pkg.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div className="min-w-0 pr-2">
                  <p className="text-[13px] font-medium">{pkg.name}</p>
                  {pkg.description && (
                    <p className="text-[11px] text-text-muted line-clamp-2">
                      {pkg.description}
                    </p>
                  )}
                  <p className="text-[11px] text-text-secondary">
                    {formatServicePrice(pkg)} · {pkg.durationMins} min
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {pkg.items.map((item) => item.name).join(' + ')}
                  </p>
                  {pkg.savings !== null && (
                    <p className="mt-1 text-[11px] font-medium text-brand-red">
                      Saves ₹{pkg.savings} vs ₹{pkg.itemsTotal} separately
                    </p>
                  )}
                  {pkg.hasInactiveItems && (
                    <p className="mt-1 text-[11px] text-brand-red">
                      Contains a disabled service — customers still see it listed.
                    </p>
                  )}
                </div>
                <ScBadge variant={pkg.isActive ? 'success' : 'muted'}>
                  {pkg.isActive ? 'Active' : 'Inactive'}
                </ScBadge>
              </div>
              {/* Images — shown to customers in the package details popup. */}
              <div className="flex items-center gap-2">
                {pkg.images.map((image) => (
                  <div
                    key={image.id}
                    className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] bg-surface"
                  >
                    <Image
                      src={image.url}
                      alt={pkg.name}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                    <button
                      type="button"
                      disabled={imageBusyId === pkg.id}
                      onClick={() => removeImage(pkg.id, image.id)}
                      title="Remove image"
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-1 text-white disabled:opacity-50"
                    >
                      <IconTrash size={11} />
                    </button>
                  </div>
                ))}

                {pkg.images.length < MAX_IMAGES_PER_SERVICE && (
                  <button
                    type="button"
                    disabled={imageBusyId === pkg.id}
                    onClick={() => pickImage(pkg.id)}
                    className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[8px] border border-dashed border-border text-text-muted disabled:opacity-50"
                  >
                    <IconPhotoPlus size={16} />
                    <span className="text-[9px]">
                      {imageBusyId === pkg.id ? '…' : 'Add'}
                    </span>
                  </button>
                )}

                <p className="text-[10px] text-text-muted">
                  {pkg.images.length}/{MAX_IMAGES_PER_SERVICE} images
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => startEdit(pkg)}
                  className="text-[11px] text-brand-red"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setPackageActive(pkg.id, !pkg.isActive)}
                  className={cn(
                    'text-[11px]',
                    pkg.isActive ? 'text-text-secondary' : 'text-brand-red'
                  )}
                >
                  {pkg.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(pkg.id)}
                  className="text-[11px] text-text-muted"
                >
                  Delete
                </button>
              </div>
            </ScCard>
          ))
        )}
      </div>
    </div>
  )
}
