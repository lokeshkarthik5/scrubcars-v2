'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { IconBuildingStore, IconPhoto, IconTrash, IconUpload } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { AppShell } from '@/components/sc/app-shell'
import { ScButton } from '@/components/sc/button'
import { TopBar } from '@/components/sc/top-bar'
import { ApiError } from '@/lib/api/client'
import { useIsVendorAdmin } from '@/lib/hooks/use-vendor-role'
import {
  deleteVendorLogo,
  deleteVendorPhoto,
  getMyPhotos,
  getMyVendor,
  uploadVendorLogo,
  uploadVendorPhoto,
  type ApiVendorPhoto,
} from '@/lib/api/vendors'

const ACCEPTED = 'image/jpeg,image/png,image/webp'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export default function VendorPhotosPage() {
  const isVendorAdmin = useIsVendorAdmin()
  const roleRouter = useRouter()

  // Catalogue and media are vendor_admin-only server-side, and an operator's
  // nav has no tab for either, so this is only reachable by typing the URL.
  useEffect(() => {
    if (!isVendorAdmin) roleRouter.replace('/vendor/home')
  }, [isVendorAdmin, roleRouter])
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<ApiVendorPhoto[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getMyPhotos(), getMyVendor()])
      .then(([ps, vendor]) => {
        setPhotos(ps)
        setLogoUrl(vendor.logoUrl)
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace('/vendor/login')
          return
        }
        toast.error('Failed to load photos')
      })
      .finally(() => setLoading(false))
  }, [router])

  const handleLogo = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Unsupported type (use JPEG, PNG or WebP)')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Logo too large (max 5 MB)')
      return
    }
    setLogoBusy(true)
    try {
      const vendor = await uploadVendorLogo(file)
      setLogoUrl(vendor.logoUrl)
      toast.success('Logo updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLogoBusy(false)
      if (logoRef.current) logoRef.current.value = ''
    }
  }

  const handleRemoveLogo = async () => {
    setLogoBusy(true)
    try {
      await deleteVendorLogo()
      setLogoUrl(null)
    } catch {
      toast.error('Failed to remove logo')
    } finally {
      setLogoBusy(false)
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (!ACCEPTED.includes(file.type)) {
          toast.error(`${file.name}: unsupported type (use JPEG, PNG or WebP)`)
          continue
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: too large (max 5 MB)`)
          continue
        }
        const created = await uploadVendorPhoto(file)
        setPhotos((prev) => [...prev, created])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteVendorPhoto(id)
      setPhotos((prev) => prev.filter((p) => p.id !== id))
    } catch {
      toast.error('Failed to delete photo')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar showBack backHref="/vendor/settings" title="Garage photos" />

      <input
        ref={logoRef}
        type="file"
        accept={ACCEPTED}
        hidden
        onChange={(e) => handleLogo(e.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-text-primary">Logo</h2>
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-surface">
            {logoUrl ? (
              <Image src={logoUrl} alt="Logo" fill sizes="64px" className="object-cover" />
            ) : (
              <IconBuildingStore size={26} className="text-text-muted" />
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <ScButton
              variant="secondary"
              disabled={logoBusy}
              onClick={() => logoRef.current?.click()}
              className="py-2 text-[12px]"
            >
              {logoBusy ? 'Working…' : logoUrl ? 'Change logo' : 'Add logo'}
            </ScButton>
            {logoUrl && (
              <button
                type="button"
                disabled={logoBusy}
                onClick={handleRemoveLogo}
                className="text-left text-[12px] text-brand-red disabled:opacity-50"
              >
                Remove logo
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-text-secondary">
          Shown next to your garage in customer listings.
        </p>
      </section>

      <div className="h-px bg-border" />

      <h2 className="-mb-2 text-sm font-semibold text-text-primary">Photos</h2>

      <ScButton
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="flex items-center justify-center gap-2"
      >
        <IconUpload size={18} />
        {uploading ? 'Uploading…' : 'Add photos'}
      </ScButton>
      <p className="-mt-3 text-[11px] text-text-secondary">
        JPEG, PNG or WebP · up to 5 MB each. These show on your public listing.
      </p>

      {loading ? (
        <p className="text-[13px] text-text-secondary">Loading…</p>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-border py-12 text-center">
          <IconPhoto size={28} className="text-text-muted" />
          <p className="text-[13px] text-text-secondary">No photos yet</p>
          <p className="text-[11px] text-text-muted">Add photos of your garage and work</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square overflow-hidden rounded-[10px] bg-surface">
              <Image
                src={photo.url}
                alt="Garage photo"
                fill
                sizes="(max-width: 428px) 50vw, 200px"
                className="object-cover"
              />
              <button
                type="button"
                disabled={deletingId === photo.id}
                onClick={() => handleDelete(photo.id)}
                title="Delete photo"
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 disabled:opacity-50"
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}
