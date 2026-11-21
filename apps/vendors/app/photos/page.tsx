'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  IconBuildingStore,
  IconChevronLeft,
  IconChevronRight,
  IconPhoto,
  IconStar,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { useT } from '@repo/core/i18n'
import { t } from '@repo/core/i18n/translate'
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
  setVendorPhotoOrder,
  uploadVendorLogo,
  uploadVendorPhoto,
  type ApiVendorPhoto,
} from '@repo/core/api/vendors'
import {
  movedPhotos,
  PHOTO_ORDER_STALE,
  PHOTO_ORDER_WORDS,
  photoMoves,
  withOrderOf,
  type PhotoMove,
} from '@repo/core/photo-order'

const ACCEPTED = 'image/jpeg,image/png,image/webp'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

/** Said from an effect, so it reads the language in use without being one of the effect's dependencies. */
const loadFailed = () => t('Failed to load photos')

export default function VendorPhotosPage() {
  const t = useT()
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
  const [ordering, setOrdering] = useState(false)
  // Make cover and the arrows wait for an upload or delete to finish, so the
  // order sent is the list the server has (anything else is refused).
  const orderLocked = ordering || uploading || deletingId !== null

  useEffect(() => {
    Promise.all([getMyPhotos(), getMyVendor()])
      .then(([ps, vendor]) => {
        setPhotos(ps)
        setLogoUrl(vendor.logoUrl)
      })
      .catch((err) => {
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          router.replace('/login')
          return
        }
        toast.error(loadFailed())
      })
      .finally(() => setLoading(false))
  }, [router])

  const handleLogo = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!ACCEPTED.includes(file.type)) {
      toast.error(t('Unsupported type (use JPEG, PNG or WebP)'))
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('Logo too large (max 5 MB)'))
      return
    }
    setLogoBusy(true)
    try {
      const vendor = await uploadVendorLogo(file)
      setLogoUrl(vendor.logoUrl)
      toast.success(t('Logo updated'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Upload failed'))
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
      toast.error(t('Failed to remove logo'))
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
          toast.error(
            t('{name}: unsupported type (use JPEG, PNG or WebP)', { name: file.name })
          )
          continue
        }
        if (file.size > MAX_BYTES) {
          toast.error(t('{name}: too large (max 5 MB)', { name: file.name }))
          continue
        }
        const created = await uploadVendorPhoto(file)
        setPhotos((prev) => [...prev, created])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Upload failed'))
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
      toast.error(t('Failed to delete photo'))
    } finally {
      setDeletingId(null)
    }
  }

  // Make cover and the ← → arrows (@repo/core/photo-order): the new order
  // shows at once and saves at once. A failed save puts the order back; a
  // stale one (photos changed on another device) shows them as they are now.
  const handleMove = async (id: string, move: PhotoMove) => {
    if (orderLocked) return
    const next = movedPhotos(photos, id, move)
    if (!next) return
    const previousIds = photos.map((p) => p.id)
    setPhotos(next)
    setOrdering(true)
    try {
      const saved = await setVendorPhotoOrder(next.map((p) => p.id))
      setPhotos((prev) => withOrderOf(prev, saved.map((p) => p.id)))
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 401 || err.status === 403)
      ) {
        router.replace('/login')
        return
      }
      if (err instanceof ApiError && err.code === PHOTO_ORDER_STALE) {
        try {
          setPhotos(await getMyPhotos())
        } catch {
          setPhotos((prev) => withOrderOf(prev, previousIds))
        }
        toast.error(t(PHOTO_ORDER_WORDS.stale))
        return
      }
      setPhotos((prev) => withOrderOf(prev, previousIds))
      toast.error(t(PHOTO_ORDER_WORDS.failed))
    } finally {
      setOrdering(false)
    }
  }

  return (
    <AppShell showNav navType="vendor" className="gap-5 py-4">
      <TopBar showBack backHref="/settings" title={t('Garage photos')} />

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
        <SectionHeader
          title={t('Logo')}
          subtitle={t('Shown next to your garage in customer listings.')}
        />
        <ScCard className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-surface-elevated">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={t('Logo')}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <IconBuildingStore size={26} className="text-text-muted" />
            )}
          </div>
          <div className="flex flex-1 flex-col items-start gap-1">
            <ScButton
              variant="outline"
              size="md"
              disabled={logoBusy}
              onClick={() => logoRef.current?.click()}
            >
              {logoBusy ? t('Working…') : logoUrl ? t('Change logo') : t('Add logo')}
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
                {t('Remove logo')}
              </button>
            )}
          </div>
        </ScCard>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title={t('Photos')}
          subtitle={t('JPEG, PNG or WebP · up to 5 MB each. These show on your public listing.')}
          action={
            ordering ? (
              <span role="status" className="text-[12px] text-text-muted">
                {t('Saving…')}
              </span>
            ) : photos.length > 0 ? (
              <span className="font-numeric text-[12px] text-text-muted">
                {photos.length}
              </span>
            ) : undefined
          }
        />
        {photos.length > 1 && (
          <p className="text-[12px] text-text-secondary">
            {t(PHOTO_ORDER_WORDS.hint)}
          </p>
        )}

        {/* The screen's one main action. */}
        <ScButton
          variant="main"
          size="lg"
          disabled={uploading || ordering}
          onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-2"
        >
          <IconUpload size={18} aria-hidden="true" />
          {uploading ? t('Uploading…') : t('Add photos')}
        </ScButton>

        {loading ? (
          <div
            role="status"
            aria-busy="true"
            className="grid grid-cols-2 gap-2"
          >
            <span className="sr-only">{t('Loading')}</span>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="aspect-square rounded-[12px]" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-border py-12 text-center">
            <IconPhoto size={28} stroke={1.5} className="text-text-muted" />
            <p className="text-sm font-semibold text-text-primary">
              {t('No photos yet')}
            </p>
            <p className="text-[12px] text-text-secondary">
              {t('Add photos of your garage and work')}
            </p>
          </div>
        ) : (
          <ul
            aria-label={t('Photos')}
            aria-busy={ordering}
            className="grid grid-cols-2 gap-2"
          >
            {photos.map((photo, i) => {
              const moves = photoMoves(i, photos.length)
              return (
                <Reveal
                  as="li"
                  key={photo.id}
                  index={i}
                  className="relative aspect-square overflow-hidden rounded-[12px] bg-surface"
                >
                  <Image
                    src={photo.url}
                    // Numbered, so a screen reader can tell the photos apart.
                    alt={t('Garage photo {n}', { n: i + 1 })}
                    fill
                    sizes="(max-width: 428px) 50vw, 200px"
                    className="object-cover"
                  />
                  {moves.isCover && (
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[12px] font-semibold text-white">
                      {t(PHOTO_ORDER_WORDS.cover)}
                    </span>
                  )}
                  {/* A full 44px target in the corner; the dark disc keeps it
                      legible on any photo. */}
                  <button
                    type="button"
                    disabled={deletingId === photo.id || ordering}
                    onClick={() => handleDelete(photo.id)}
                    aria-label={t('Delete photo')}
                    title={t('Delete photo')}
                    className="absolute right-0 top-0 flex size-11 items-center justify-center text-white disabled:opacity-50"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-black/60 transition-colors hover:bg-black/80">
                      <IconTrash size={15} aria-hidden="true" />
                    </span>
                  </button>
                  {/* ← Make cover → along the bottom, 44px targets each. */}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between">
                    <MoveButton
                      label={t(PHOTO_ORDER_WORDS.left)}
                      disabled={orderLocked || !moves.left}
                      onClick={() => void handleMove(photo.id, 'left')}
                    >
                      <IconChevronLeft size={16} aria-hidden="true" />
                    </MoveButton>
                    {moves.cover ? (
                      <MoveButton
                        label={t(PHOTO_ORDER_WORDS.makeCover)}
                        disabled={orderLocked}
                        onClick={() => void handleMove(photo.id, 'cover')}
                      >
                        <IconStar size={15} aria-hidden="true" />
                      </MoveButton>
                    ) : (
                      <span className="size-11" aria-hidden="true" />
                    )}
                    <MoveButton
                      label={t(PHOTO_ORDER_WORDS.right)}
                      disabled={orderLocked || !moves.right}
                      onClick={() => void handleMove(photo.id, 'right')}
                    >
                      <IconChevronRight size={16} aria-hidden="true" />
                    </MoveButton>
                  </div>
                </Reveal>
              )
            })}
          </ul>
        )}
      </section>
    </AppShell>
  )
}

/** A 44px target with the dark disc drawn inside, as the delete button. */
function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-11 items-center justify-center text-white disabled:opacity-40"
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-black/60 transition-colors hover:bg-black/80">
        {children}
      </span>
    </button>
  )
}
