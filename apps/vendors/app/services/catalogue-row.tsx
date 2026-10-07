'use client'

import Image from 'next/image'
import { IconPhotoPlus, IconTrash } from '@tabler/icons-react'

/**
 * A row's small actions — Edit, Disable, Delete — as quiet outline buttons
 * with a full 44px height. They were 11px words, two of them in red, which
 * put three red things on every row of a screen whose one red is its Add
 * button.
 */
export function RowAction({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press min-h-11 rounded-[10px] border border-border px-3.5 text-[12px] font-medium text-text-primary transition-colors hover:bg-surface-elevated disabled:opacity-50"
    >
      {children}
    </button>
  )
}

interface CatalogueImagesProps {
  /** The service or package, for the images' alt text. */
  name: string
  images: { id: string; url: string }[]
  max: number
  /** An upload or removal for this row is in flight. */
  busy: boolean
  onAdd: () => void
  onRemove: (imageId: string) => void
}

/**
 * A service's or package's images, shown to customers in its details popup:
 * thumbnails, an add tile while there is room, and how many of the allowed
 * number are used. One component for both lists, which had a copy each.
 */
export function CatalogueImages({ name, images, max, busy, onAdd, onRemove }: CatalogueImagesProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {images.map((image) => (
        <div key={image.id} className="relative h-14 w-14 shrink-0">
          <div className="absolute inset-0 overflow-hidden rounded-[8px] bg-surface-elevated">
            <Image src={image.url} alt={name} fill sizes="56px" className="object-cover" />
          </div>
          {/* Removing is immediate, so the target is a full 44px even though
              the disc is small. It hangs off the corner, outside the clipped
              thumbnail, so it does not cover most of the photo. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(image.id)}
            aria-label={`Remove image of ${name}`}
            title="Remove image"
            className="absolute -right-2.5 -top-2.5 flex size-11 items-center justify-center text-white disabled:opacity-50"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-black/70 transition-colors hover:bg-black/85">
              <IconTrash size={12} aria-hidden="true" />
            </span>
          </button>
        </div>
      ))}

      {images.length < max && (
        <button
          type="button"
          disabled={busy}
          onClick={onAdd}
          aria-label={`Add an image of ${name}`}
          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[8px] border border-dashed border-border text-text-muted transition-colors hover:border-text-secondary hover:text-text-secondary disabled:opacity-50"
        >
          <IconPhotoPlus size={16} aria-hidden="true" />
          <span className="text-[9px]">{busy ? '…' : 'Add'}</span>
        </button>
      )}

      <p className="text-[11px] text-text-muted">
        <span className="font-numeric">
          {images.length}/{max}
        </span>{' '}
        images
      </p>
    </div>
  )
}
