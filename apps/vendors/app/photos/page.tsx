'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { IconBuildingStore, IconPhoto, IconTrash, IconUpload } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { AppShell } from '@repo/ui/sc/app-shell'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { Reveal } from '@repo/ui/sc/reveal'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { TopBar } from '@repo/ui/sc/top-bar'
import { ApiError } from '@repo/core/api/client'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import {
  deleteVendorLogo,
  deleteVendorPhoto,
  getMyPhotos,
  getMyVendor,
  uploadVendorLogo,
  uploadVendorPhoto,
  type ApiVendorPhoto,
} from '@repo/core/api/vendors'

const ACCEPTED = 'image/jpeg,image/png,image/webp'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export default function VendorPhotosPage() {
  const isVendorAdmin = useIsVendorAdmin()
  const roleRouter = useRouter()

  // Catalogue and media are vendor_admin-only server-side, and an operator's
  // nav has no tab for either, so this is only reachable by typing the URL.
  useEffect(() => {
    if (!isVendorAdmin) roleRouter.replace('/home')
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
          router.replace('/login')
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
      <TopBar showBack backHref="/settings" title="Garage photos" />

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
        <SectionHeader title="Logo" subtitle="Shown next to your garage in customer listings." />
        <ScCard className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-surface-elevated">
            {logoUrl ? (
              <Image src={logoUrl} alt="Logo" fill sizes="64px" className="object-cover" />
            ) : (
              <IconBuildingStore size={26} className="text-text-muted" />
            )}
          </div>
          <div className="flex flex-1 flex-col items-start gap-1">
            <ScButton
              variant="secondary"
              disabled={logoBusy}
              onClick={() => logoRef.current?.click()}
              className="min-h-11 py-2 text-[13px]"
            >
              {logoBusy ? 'Working…' : logoUrl ? 'Change logo' : 'Add logo'}
            </ScButton>
            {/* A quiet text button: removing the logo is not what this
                screen is for, and red is kept for Add photos below. */}
            {logoUrl && (
              <button
                type="button"
                disabled={logoBusy}
                onClick={handleRemoveLogo}
                className="min-h-11 text-[12px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline disabled:opacity-50"
              >
                Remove logo
              </button>
            )}
          </div>
        </ScCard>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Photos"
          subtitle="JPEG, PNG or WebP · up to 5 MB each. These show on your public listing."
          action={
            photos.length > 0 ? (
              <span className="font-numeric text-[12px] text-text-muted">{photos.length}</span>
            ) : undefined
          }
        />

        {/* The screen's one main action. */}
        <ScButton
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-2"
        >
          <IconUpload size={18} aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Add photos'}
        </ScButton>

        {loading ? (
          <div role="status" aria-busy="true" className="grid grid-cols-2 gap-2">
            <span className="sr-only">Loading</span>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-square rounded-[12px]" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-border py-12 text-center">
            <IconPhoto size={28} stroke={1.5} className="text-text-muted" />
            <p className="text-sm font-semibold text-text-primary">No photos yet</p>
            <p className="text-[12px] text-text-secondary">Add photos of your garage and work</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {photos.map((photo, i) => (
              <Reveal
                key={photo.id}
                index={i}
                className="relative aspect-square overflow-hidden rounded-[12px] bg-surface"
              >
                <Image
                  src={photo.url}
                  alt="Garage photo"
                  fill
                  sizes="(max-width: 428px) 50vw, 200px"
                  className="object-cover"
                />
                {/* A full 44px target in the corner; the dark disc keeps it
                    legible on any photo. */}
                <button
                  type="button"
                  disabled={deletingId === photo.id}
                  onClick={() => handleDelete(photo.id)}
                  aria-label="Delete photo"
                  title="Delete photo"
                  className="absolute right-0 top-0 flex size-11 items-center justify-center text-white disabled:opacity-50"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-black/60 transition-colors hover:bg-black/80">
                    <IconTrash size={15} aria-hidden="true" />
                  </span>
                </button>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}
