'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import {
  IconBuildingStore,
  IconChevronLeft,
  IconChevronRight,
  IconPhotoPlus,
  IconStar,
  IconTrash,
} from '@tabler/icons-react'
import { PHOTO_ORDER_WORDS, photoMoves } from '@repo/core/photo-order'
import { ScButton } from '@repo/ui/sc/button'
import { ScField, ScTextarea } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import { OnboardedByField } from '@/components/garage-form'
import { SavedNote } from '@/components/save-bar'
import type { GarageDraft, GarageDraftState } from '../use-garage-draft'

/**
 * Details: who the garage is and how to reach it, who brought it in, the
 * team's notes, and its logo and photos (which save the moment they are
 * picked; everything else here waits for Save changes).
 */
export function DetailsTab({
  g,
  draft,
}: {
  g: GarageDraftState
  draft: GarageDraft
}) {
  const {
    set,
    resetCount,
    logoUrl,
    photos,
    mediaBusy,
    mediaNote,
    logoInputRef,
    photoInputRef,
    handleRemoveLogo,
    handleRemovePhoto,
    handleMovePhoto,
  } = g
  // The arrows and Make cover wait for any other photo or logo action, so
  // the order sent is the one the server has.
  const orderLocked = mediaBusy !== null

  return (
    <>
      <div className="grid items-start gap-4 @4xl:grid-cols-2">
        <ScSection title="Business & contact">
          <ScField
            label="Business name"
            value={draft.form.businessName}
            onChange={set('businessName')}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <ScField
              label="Owner name"
              value={draft.form.ownerName}
              onChange={set('ownerName')}
            />
            <ScField
              label="Owner phone"
              value={draft.form.ownerPhone}
              onChange={set('ownerPhone')}
              placeholder="10 digits"
              inputMode="numeric"
              className="font-numeric"
            />
            <ScField
              label="Business phone"
              value={draft.form.phone}
              onChange={set('phone')}
              placeholder="10 digits"
              inputMode="numeric"
              className="font-numeric"
            />
            <ScField
              label="WhatsApp (optional)"
              value={draft.form.whatsapp}
              onChange={set('whatsapp')}
              placeholder="10 digits"
              inputMode="numeric"
              className="font-numeric"
            />
            <ScField
              label="Email (optional)"
              value={draft.form.email}
              onChange={set('email')}
              type="email"
            />
            <ScField
              label="Years in operation (optional)"
              value={draft.form.yearsInOperation}
              onChange={set('yearsInOperation')}
              placeholder="e.g. 5–10 years"
            />
          </div>
        </ScSection>

        <ScSection title="Onboarding">
          {/* Keyed so Discard puts the select back too: it remembers that
              "Someone else…" was picked while the name is still empty. */}
          <OnboardedByField
            key={resetCount}
            value={draft.form.onboardedByName}
            onChange={set('onboardedByName')}
          />
          <ScTextarea
            label="Notes (optional)"
            value={draft.form.notes}
            onChange={(e) => set('notes')(e.target.value)}
            rows={4}
          />
          <p className="text-[12px] text-text-muted">
            Only the team sees these. Stage and Show to customers are under Go live.
          </p>
        </ScSection>
      </div>

      <ScSection
        title="Logo & photos"
        action={<SavedNote state={mediaNote.state} />}
      >
        <p className="text-[12px] text-text-muted">
          Saves the moment a file is picked, not with “Save changes”. JPEG, PNG
          or WebP, up to 5 MB each. The first photo is the cover customers see
          first: use the star to make a photo the cover, or the arrows to move
          it.
        </p>

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-surface-elevated">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt="Logo"
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <IconBuildingStore size={26} className="text-text-muted" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <ScButton
                fullWidth={false}
                variant="secondary"
                disabled={mediaBusy === 'logo'}
                onClick={() => logoInputRef.current?.click()}
                className="min-h-11 px-3.5 py-2 text-[12px]"
              >
                {mediaBusy === 'logo'
                  ? 'Working…'
                  : logoUrl
                    ? 'Change logo'
                    : 'Add logo'}
              </ScButton>
              {logoUrl && (
                // A quiet text button: red on this page is Save changes.
                <button
                  type="button"
                  disabled={mediaBusy === 'logo'}
                  onClick={handleRemoveLogo}
                  className="min-h-11 text-left text-[12px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline disabled:opacity-50"
                >
                  Remove logo
                </button>
              )}
            </div>
          </div>

          <ul
            aria-label="Garage photos"
            aria-busy={mediaBusy === 'order'}
            className="flex flex-wrap gap-2"
          >
            {photos.map((photo, index) => {
              const moves = photoMoves(index, photos.length)
              return (
                <li
                  key={photo.id}
                  className="relative h-[100px] w-[132px] overflow-hidden rounded-[10px] bg-surface"
                >
                  <Image
                    src={photo.url}
                    alt={`Garage photo ${index + 1}`}
                    fill
                    sizes="132px"
                    className="object-cover"
                  />
                  {moves.isCover && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {PHOTO_ORDER_WORDS.cover}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={
                      mediaBusy === `photo-${photo.id}` || mediaBusy === 'order'
                    }
                    onClick={() => handleRemovePhoto(photo.id)}
                    aria-label="Delete photo"
                    title="Delete photo"
                    // A 44px target with the small disc drawn inside it, as on
                    // the garage's own Photos page: deleting is immediate.
                    className="absolute right-0 top-0 flex size-11 items-center justify-center text-white disabled:opacity-50"
                  >
                    <span className="flex size-7 items-center justify-center rounded-full bg-black/60 transition-colors hover:bg-black/80">
                      <IconTrash size={13} aria-hidden="true" />
                    </span>
                  </button>
                  {/* Three 44px targets along the bottom: ← Make cover →. */}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between">
                    <PhotoMoveButton
                      label={PHOTO_ORDER_WORDS.left}
                      disabled={orderLocked || !moves.left}
                      onClick={() => void handleMovePhoto(photo.id, 'left')}
                    >
                      <IconChevronLeft size={14} aria-hidden="true" />
                    </PhotoMoveButton>
                    {moves.cover ? (
                      <PhotoMoveButton
                        label={PHOTO_ORDER_WORDS.makeCover}
                        disabled={orderLocked}
                        onClick={() => void handleMovePhoto(photo.id, 'cover')}
                      >
                        <IconStar size={13} aria-hidden="true" />
                      </PhotoMoveButton>
                    ) : (
                      <span className="size-11" aria-hidden="true" />
                    )}
                    <PhotoMoveButton
                      label={PHOTO_ORDER_WORDS.right}
                      disabled={orderLocked || !moves.right}
                      onClick={() => void handleMovePhoto(photo.id, 'right')}
                    >
                      <IconChevronRight size={14} aria-hidden="true" />
                    </PhotoMoveButton>
                  </div>
                </li>
              )
            })}
            <li>
              <button
                type="button"
                disabled={mediaBusy === 'photos' || mediaBusy === 'order'}
                onClick={() => photoInputRef.current?.click()}
                aria-label="Add photos"
                className="flex h-[100px] w-20 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border text-text-muted transition-colors hover:border-text-secondary hover:text-text-secondary disabled:opacity-50"
              >
                <IconPhotoPlus size={18} aria-hidden="true" />
                <span className="text-[12px]">
                  {mediaBusy === 'photos' ? 'Uploading…' : 'Add'}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </ScSection>
    </>
  )
}

/** A 44px target with a small dark disc drawn inside, legible on any photo. */
function PhotoMoveButton({
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
      <span className="flex size-7 items-center justify-center rounded-full bg-black/60 transition-colors hover:bg-black/80">
        {children}
      </span>
    </button>
  )
}
