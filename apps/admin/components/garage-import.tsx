'use client'

import { useId, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import {
  IconCamera,
  IconChevronRight,
  IconFileImport,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconLoader2,
  IconLock,
  IconMaximize,
  IconPencil,
  IconReplace,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import type { ImportedGarage } from '@repo/core/api/admin'
import { cn } from '@repo/core/utils'
import {
  importFileKind,
  importFilesMeta,
  tallyRowMeta,
  tallyRowTitle,
  type ImportSummary,
} from '@/lib/garage-import'

/** Accepted by the photo picker. HEIC is let through to be explained, not silently hidden. */
const PHOTO_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf'

/**
 * Add garage's first card: import from a form or poster. Nothing is saved
 * here; the files are read, and the review screen comes next.
 */
export function ImportStartCard({
  photosOn,
  reading,
  error,
  onPickFiles,
  onPickCsv,
}: {
  /** Reading photos and PDFs needs the AI key; the Tally file does not. */
  photosOn: boolean
  /** The file being read, while it is. */
  reading: string | null
  error: string | null
  onPickFiles: (files: File[]) => void
  onPickCsv: (file: File) => void
}) {
  const titleId = useId()
  const photoInput = useRef<HTMLInputElement>(null)
  const csvInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const busy = reading !== null

  // A drop on a desktop: a single CSV is a Tally file, anything else photos.
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 1 && /\.csv$/i.test(files[0].name)) onPickCsv(files[0])
    else if (files.length > 0 && photosOn) onPickFiles(files)
  }

  return (
    <section
      aria-labelledby={titleId}
      onDragOver={(e) => {
        e.preventDefault()
        if (!busy) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'rounded-[16px] border bg-surface px-4 pb-4 pt-[18px] transition-colors',
        dragging ? 'border-text-secondary' : 'border-border'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated">
          <IconFileImport size={19} stroke={1.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-[17px] font-medium leading-[22px] tracking-[-0.012em] text-text-primary"
          >
            Import from a form or poster
          </h2>
          <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">
            We read it and fill in the form for you. You check everything before
            it’s saved.
          </p>
        </div>
      </div>

      {photosOn && (
        <div className="mt-5 flex flex-col gap-2">
          {/* The page's one red: this is what the page is for. */}
          <ScButton
            disabled={busy}
            onClick={() => photoInput.current?.click()}
            aria-describedby={`${titleId}-photo-hint`}
            className="flex min-h-14 items-center justify-center gap-2 rounded-[14px] text-[15px] font-medium"
          >
            <IconCamera size={19} stroke={1.6} aria-hidden="true" />
            Upload photo or PDF
          </ScButton>
          <p
            id={`${titleId}-photo-hint`}
            className="px-2 text-center text-[12px] leading-[17px] text-text-muted"
          >
            Poster or price list · up to <span className="font-numeric">5</span>{' '}
            photos or PDFs
          </p>
        </div>
      )}

      <div className={cn('flex flex-col gap-2', photosOn ? 'mt-4' : 'mt-5')}>
        <ScButton
          variant="secondary"
          disabled={busy}
          onClick={() => csvInput.current?.click()}
          aria-describedby={`${titleId}-csv-hint`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-[14px] text-[15px] font-medium"
        >
          <IconFileSpreadsheet size={18} stroke={1.5} aria-hidden="true" />
          Upload Tally responses (CSV)
        </ScButton>
        <p
          id={`${titleId}-csv-hint`}
          className="px-2 text-center text-[12px] leading-[17px] text-text-muted [text-wrap:balance]"
        >
          The responses file you download from Tally. If it has several garages,
          you pick one next.
        </p>
      </div>

      {/* Always mounted, so reading and what went wrong are announced. */}
      <div role="status" className={reading ? 'mt-4' : 'sr-only'}>
        {reading && (
          <p className="flex items-center justify-center gap-2 text-[13px] text-text-secondary">
            <IconLoader2
              size={16}
              className="shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Reading {reading}… This can take up to a minute.
          </p>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 text-center text-[13px] leading-[18px] text-error"
        >
          {error}
        </p>
      )}

      <p className="mt-[18px] flex items-center justify-center gap-1.5 border-t border-border pt-3.5 text-[12px] leading-[17px] text-text-muted">
        <IconLock
          size={14}
          stroke={1.6}
          aria-hidden="true"
          className="shrink-0"
        />
        {photosOn
          ? 'Read by an AI service; the file isn’t stored'
          : 'The file isn’t stored'}
      </p>

      <input
        ref={photoInput}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          // Cleared, so picking the same file again after a fix still fires.
          e.target.value = ''
          if (files.length > 0) onPickFiles(files)
        }}
      />
      <input
        ref={csvInput}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPickCsv(file)
        }}
      />
    </section>
  )
}

/**
 * The quiet way in for a garage with nothing to import. Still a real link
 * (a new tab, a copied address), but a plain click is handed to `onOpen`,
 * which switches the page itself: router navigation between ?by=hand and
 * the bare page did not reliably re-render this prerendered page.
 */
export function FillByHandLink({ onOpen }: { onOpen?: () => void }) {
  return (
    <>
      <div
        aria-hidden="true"
        className="mx-1 flex items-center gap-3 text-[12px] text-text-muted before:flex-1 before:border-t before:border-border after:flex-1 after:border-t after:border-border"
      >
        or
      </div>
      <Link
        href="/vendors/new?by=hand"
        onClick={(event) => {
          if (
            !onOpen ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return
          }
          event.preventDefault()
          onOpen()
        }}
        className="press flex min-h-16 items-center gap-3 rounded-[14px] border border-border pl-3.5 pr-1.5 transition-colors hover:bg-surface"
      >
        <IconPencil
          size={18}
          stroke={1.5}
          aria-hidden="true"
          className="shrink-0 text-text-secondary"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium leading-[19px] text-text-primary">
            Fill in by hand
          </span>
          <span className="block truncate text-[12px] leading-4 text-text-muted">
            Details, location, operations and services
          </span>
        </span>
        <span className="flex size-11 items-center justify-center text-text-muted">
          <IconChevronRight size={18} aria-hidden="true" />
        </span>
      </Link>
    </>
  )
}

/**
 * The top of the review screen: what was read (a thumbnail of the photo,
 * which opens it full size), a way back to pick another, and the counts.
 */
export function ImportSourceCard({
  source,
  summary,
  onChangeFile,
}: {
  source:
    | {
        kind: 'files'
        files: File[]
        /**
         * The first photo, from memory (an object URL the page lets go of
         * when the review is left); it was never uploaded anywhere to be
         * shown from. Null for a PDF.
         */
        previewUrl: string | null
      }
    | { kind: 'tally'; fileName: string; row: number; rows: number }
  summary: ImportSummary
  onChangeFile: () => void
}) {
  const first = source.kind === 'files' ? source.files[0] : null
  const url = source.kind === 'files' ? source.previewUrl : null
  const isPhoto = first ? importFileKind(first) === 'image' : false

  const name =
    source.kind === 'tally'
      ? source.fileName
      : source.files.length === 1
        ? source.files[0].name
        : `${source.files[0].name} and ${source.files.length - 1} more`
  const meta =
    source.kind === 'tally'
      ? source.rows === 1
        ? 'Tally responses'
        : `Tally responses · garage ${source.row} of ${source.rows}`
      : `${importFilesMeta(source.files)}${url ? ' · tap it to view' : ''}`

  const Icon = source.kind === 'tally' ? IconFileSpreadsheet : IconFileTypePdf
  const thumb = (
    <span className="relative flex h-28 w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-surface-elevated">
      {isPhoto && url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL, which next/image cannot load
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Icon
          size={28}
          stroke={1.4}
          aria-hidden="true"
          className="text-text-secondary"
        />
      )}
      {url && (
        <span className="absolute bottom-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/70">
          <IconMaximize size={13} stroke={1.8} aria-hidden="true" />
        </span>
      )}
    </span>
  )

  return (
    <section
      aria-label="What was read"
      className="flex flex-col gap-3.5 rounded-[16px] border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-3.5">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${first?.name ?? 'the file'}`}
            className="shrink-0"
          >
            {thumb}
          </a>
        ) : (
          thumb
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium leading-[19px] text-text-primary">
            {name}
          </p>
          <p className="mt-0.5 text-[12px] leading-4 text-text-muted">{meta}</p>
          <button
            type="button"
            onClick={onChangeFile}
            className="-mb-3 -ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-1 text-[13px] font-medium text-text-primary transition-colors hover:text-text-secondary"
          >
            <IconReplace
              size={15}
              stroke={1.6}
              aria-hidden="true"
              className="text-text-secondary"
            />
            Change file
          </button>
        </div>
      </div>
      <div className="border-t border-border" />
      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Filled in" value={summary.filled} />
        <Stat label="To check" value={summary.check} warn />
        <Stat label="To fill in" value={summary.missing} warn />
      </dl>
    </section>
  )
}

function Stat({
  label,
  value,
  warn = false,
}: {
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="whitespace-nowrap text-[12px] font-medium leading-[14px] text-text-secondary">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-0.5 font-numeric text-[22px] font-bold leading-7 tracking-[-0.02em]',
          warn && value > 0 ? 'text-warning' : 'text-text-primary'
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/** A Tally file with several garages: pick the one to add. */
export function TallyPickList({
  fileName,
  garages,
  onPick,
}: {
  fileName: string
  garages: ImportedGarage[]
  onPick: (index: number) => void
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div>
        <h2
          id={headingId}
          className="text-[15px] font-medium tracking-[-0.01em] text-text-primary"
        >
          Pick a garage
        </h2>
        <p className="mt-0.5 text-[12.5px] text-text-muted">
          <span className="font-numeric">{garages.length}</span> garages in{' '}
          {fileName}. You can come back for the others.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {garages.map((garage, index) => {
          const meta = tallyRowMeta(garage.label)
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => onPick(index)}
                className="press flex min-h-16 w-full items-center gap-3 rounded-[14px] border border-border bg-surface pl-3.5 pr-1.5 text-left transition-colors hover:border-text-secondary"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium leading-[19px] text-text-primary">
                    {tallyRowTitle(garage.label, index)}
                  </span>
                  {meta && (
                    <span className="block truncate text-[12px] leading-4 text-text-muted">
                      {meta}
                    </span>
                  )}
                </span>
                <span className="flex size-11 items-center justify-center text-text-muted">
                  <IconChevronRight size={18} aria-hidden="true" />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
