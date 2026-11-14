'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-toastify'
import { IconCamera, IconCheck, IconFileSpreadsheet } from '@tabler/icons-react'
import type { ImportExtract, ImportRow, ImportSource } from '@repo/core/api/garage-book'
import { useCommitBookImport, useExtractBookImport } from '@repo/core/api/hooks/use-garage-book'
import { GARAGE_BOOK_2_LIMITS, plateText, rupees } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { msg, useT, useTn } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { ScSheet } from '@repo/ui/sc/modal'
import { BackHeader, BookScreen, Field, Footnote, OwnerOnly, Seg, errorText, raised, redButton } from '@/components/book/parts'
import { resizeForUpload } from '@/lib/resize-image'

type Source = 'photos' | 'sheet'
type Row = ImportRow & { key: number; checked: boolean }

/** The most a file may be once read (the API takes 4 MB of base64). */
const MAX_FILE_BYTES = 2_900_000

/**
 * Bring in your book (I1, the owner's): photos of the paper book, or an
 * Excel/CSV/Tally export, read into rows; the unsure ones flagged for a
 * look ("Phone not clear", "Same phone as a customer you have"); nothing is
 * added until Add to my book. Adding twice never makes two of anyone: the
 * server matches by phone, then by plate. The files are never kept.
 */
export default function ImportPage() {
  const t = useT()
  const isOwner = useIsVendorAdmin()
  return (
    <BookScreen nav={false} className="pb-28">
      <BackHeader title={t('Bring in your book')} back="/book/business" />
      {isOwner ? <ImportBody /> : <OwnerOnly />}
    </BookScreen>
  )
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function ImportBody() {
  const t = useT()
  const tn = useTn()
  const [source, setSource] = useState<Source>('photos')
  const [pages, setPages] = useState<Array<{ file: File; url: string | null }>>([])
  const [sheet, setSheet] = useState<File | null>(null)
  const [read, setRead] = useState<ImportExtract | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [checking, setChecking] = useState<Row | null>(null)
  const [done, setDone] = useState<{ added: number; merged: number; skipped: number } | null>(null)
  const [preparing, setPreparing] = useState(false)
  const extract = useExtractBookImport()
  const commit = useCommitBookImport()
  const photoRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLInputElement>(null)

  // The page thumbnails are local previews; let them go with the screen.
  const previews = useRef<string[]>([])
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), [])

  const addPages = (files: FileList | null) => {
    if (!files) return
    const room = GARAGE_BOOK_2_LIMITS.importPhotosMax - pages.length
    const picked = Array.from(files).slice(0, Math.max(0, room))
    if (files.length > room) toast.info(t('Up to {count} pages at a time.', { count: GARAGE_BOOK_2_LIMITS.importPhotosMax }))
    const added = picked.map((file) => ({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null }))
    previews.current.push(...added.flatMap((page) => (page.url ? [page.url] : [])))
    setPages((current) => [...current, ...added])
  }

  const readBook = async () => {
    setPreparing(true)
    let input: ImportSource
    try {
      if (source === 'photos') {
        const files = await Promise.all(
          pages.map(async ({ file }) => {
            const blob = file.type === 'application/pdf' ? file : await resizeForUpload(file)
            if (blob.size > MAX_FILE_BYTES) throw new Error(t('{name} is too big. Try a smaller photo.', { name: file.name }))
            return { name: file.name, mimeType: (file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg') as 'application/pdf' | 'image/jpeg', dataBase64: await toBase64(blob) }
          })
        )
        input = { source: 'photos', files }
      } else {
        if (!sheet) return
        if (sheet.size > MAX_FILE_BYTES) throw new Error(t('{name} is too big. Try a smaller file.', { name: sheet.name }))
        input = { source: 'sheet', name: sheet.name, dataBase64: await toBase64(sheet) }
      }
    } catch (error) {
      toast.error(errorText(error, t("Couldn't read that file. Try another.")))
      return
    } finally {
      setPreparing(false)
    }
    extract.mutate(input, {
      onSuccess: (answer) => {
        setRead(answer)
        setRows(answer.rows.map((row, key) => ({ ...row, key, checked: row.unsure.length === 0 && !row.match })))
      },
      onError: (error) => toast.error(errorText(error, t("Couldn't read your book. Try clearer photos."))),
    })
  }

  const add = () => {
    const kept = rows.map(({ name, phone, plate, car, lastVisit, owesPaise }) => ({ name, phone, plate, car, lastVisit, owesPaise }))
    commit.mutate(kept, {
      onSuccess: (counts) => {
        setDone(counts)
        setRows([])
        setRead(null)
        setPages([])
        setSheet(null)
      },
      onError: (error) => toast.error(errorText(error, t("Couldn't add them. Try again."))),
    })
  }

  if (done) {
    return (
      <div className="fx-edge flex flex-col gap-3 rounded-surface p-4">
        <p className="text-t2 font-semibold text-text-primary">{t('Added to your book')}</p>
        <p className="text-t4 text-[#A8A8B2]">
          {[
            tn(done.added, '{count} new customer', '{count} new customers'),
            done.merged ? tn(done.merged, '{count} matched one you had', '{count} matched ones you had') : null,
            done.skipped ? tn(done.skipped, '{count} left out', '{count} left out') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <Link href="/book/customers" className={cn(raised, 'grid h-12 place-items-center rounded-control text-t3 font-semibold text-text-primary')}>
          {t('See my customers')}
        </Link>
        <button type="button" onClick={() => setDone(null)} className="min-h-11 text-t4 font-medium text-[#A8A8B2]">
          {t('Bring in more')}
        </button>
      </div>
    )
  }

  const busy = preparing || extract.isPending
  const unsure = rows.filter((row) => !row.checked).length

  return (
    <>
      <Seg<Source>
        label={msg('Bring in from')}
        value={source}
        onChange={(next) => {
          setSource(next)
          setRead(null)
          setRows([])
        }}
        options={[
          { value: 'photos', label: msg('Photo of my book') },
          { value: 'sheet', label: msg('Excel or Tally') },
        ]}
      />

      {source === 'photos' ? (
        <div className="flex flex-wrap gap-2.5">
          {pages.map((page, index) => (
            <button
              key={index}
              type="button"
              aria-label={t('Take out page {count}', { count: index + 1 })}
              onClick={() => setPages((current) => current.filter((_, i) => i !== index))}
              className="relative h-[88px] w-16 shrink-0 overflow-hidden rounded-[8px] bg-[#e8e2d0] shadow-[0_6px_14px_-6px_rgb(0_0_0/0.9)]"
              style={{ transform: `rotate(${index % 2 ? 2 : -2}deg)` }}
            >
              {page.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview, never uploaded as is
                <img src={page.url} alt="" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-[11px] font-semibold text-[#55555f]">PDF</span>
              )}
            </button>
          ))}
          {pages.length < GARAGE_BOOK_2_LIMITS.importPhotosMax && (
            <button type="button" onClick={() => photoRef.current?.click()} className={cn(raised, 'flex h-[88px] w-16 flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-semibold text-text-primary')}>
              <IconCamera size={18} aria-hidden />
              {t('Add page')}
            </button>
          )}
          <input ref={photoRef} type="file" accept="image/*,application/pdf" multiple className="sr-only" aria-label={t('Choose photos of your book')} onChange={(event) => { addPages(event.target.files); event.target.value = '' }} />
        </div>
      ) : (
        <>
          <button type="button" onClick={() => sheetRef.current?.click()} className={cn(raised, 'flex min-h-14 items-center gap-3 rounded-control px-3.5 py-3 text-left')}>
            <IconFileSpreadsheet size={22} className="shrink-0 text-[#D4D4DA]" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-t3 font-semibold text-text-primary">{sheet ? sheet.name : t('Choose a file')}</span>
              <span className="block text-[12px] text-[#A8A8B2]">{t('Excel, CSV or a Tally export')}</span>
            </span>
          </button>
          <input ref={sheetRef} type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="sr-only" aria-label={t('Choose a spreadsheet')} onChange={(event) => setSheet(event.target.files?.[0] ?? null)} />
        </>
      )}

      {!read && (
        <Footnote>
          {source === 'photos'
            ? t('Take a clear photo of each page of your book, up to {count}. We read names, phones, number plates and what is owed. Nothing is added until you say so.', { count: GARAGE_BOOK_2_LIMITS.importPhotosMax })
            : t('An Excel or CSV file with a name, phone or number plate in each row, or a Tally export. Nothing is added until you say so.')}
        </Footnote>
      )}

      {!read && (
        <button
          type="button"
          disabled={busy || (source === 'photos' ? pages.length === 0 : !sheet)}
          onClick={() => void readBook()}
          className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary disabled:text-[#8E8E98]')}
        >
          {busy ? t('Reading your book…') : source === 'photos' ? t('Read my book') : t('Read the file')}
        </button>
      )}

      {read && (
        <>
          <div className="fx-edge rounded-surface px-4 py-3">
            <p className="text-t3 font-semibold text-text-primary">
              {t('We read {customers} and {cars}', {
                customers: tn(read.counts.customers, '{count} customer', '{count} customers'),
                cars: tn(read.counts.cars, '{count} car', '{count} cars'),
              })}
            </p>
            <p className="mt-0.5 text-[12px] text-[#A8A8B2]">
              {unsure > 0 ? `${tn(unsure, '{count} needs a look.', '{count} need a look.')} ${t('Nothing is added until you say so.')}` : t('Nothing is added until you say so.')}
            </p>
          </div>
          <div>
            {rows.map((row) => (
              <ImportLine key={row.key} row={row} onCheck={() => setChecking(row)} />
            ))}
          </div>
          {rows.length === 0 && <p className="fx-edge rounded-control px-4 py-4 text-t4 text-[#A8A8B2]">{t('We found no customers in that. Try clearer photos or another file.')}</p>}
          <Footnote>{t('Tap Check to fix a row, or leave it out. Someone already in your book is matched, never added twice.')}</Footnote>
        </>
      )}

      {read && rows.length > 0 && (
        <div className="fx-glass fixed bottom-0 left-1/2 z-50 flex w-full max-w-[428px] -translate-x-1/2 items-center gap-3 rounded-none border-x-0 border-b-0 px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <span className="min-w-0 flex-1">
            <span className="block text-over font-semibold uppercase text-[#8E8E98]">{unsure > 0 ? t('{count} to check', { count: unsure }) : t('Ready')}</span>
            <span className="block truncate font-numeric text-[18px] font-semibold text-text-primary">{tn(rows.length, '{count} customer', '{count} customers')}</span>
          </span>
          <button type="button" onClick={add} disabled={commit.isPending} className={cn(redButton, 'min-h-[52px] max-w-[60%] shrink-0 rounded-control px-5 py-1.5 text-t3 leading-tight font-semibold')}>
            {commit.isPending ? t('Adding…') : t('Add to my book')}
          </button>
        </div>
      )}

      {checking && (
        <CheckSheet
          key={checking.key}
          row={checking}
          onClose={() => setChecking(null)}
          onSave={(next) => {
            setRows((current) => current.map((row) => (row.key === next.key ? next : row)))
            setChecking(null)
          }}
          onLeaveOut={() => {
            setRows((current) => current.filter((row) => row.key !== checking.key))
            setChecking(null)
          }}
        />
      )}
    </>
  )
}

/** Why a row needs a look, in the mockup's words. */
function unsureLine(t: ReturnType<typeof useT>, row: Row): string | null {
  if (row.checked) return null
  if (row.match) return row.match.by === 'phone' ? t('Same phone as a customer you have') : t('Same number plate as a customer you have')
  const first = row.unsure[0]
  if (first === 'phone') return row.phone ? t('Phone not clear: {phone}', { phone: row.phone }) : t('Phone not clear')
  if (first === 'name') return t('Name not clear')
  if (first === 'plate') return row.plate ? t('Number plate not clear: {plate}', { plate: row.plate }) : t('Number plate not clear')
  if (first === 'lastVisit') return t('Date not clear')
  if (first === 'owes') return t('Amount owed not clear')
  return row.note ?? t('Needs a look')
}

function ImportLine({ row, onCheck }: { row: Row; onCheck: () => void }) {
  const t = useT()
  const doubt = unsureLine(t, row)
  const line = [row.phone, plateText(row.plate), row.car, row.owesPaise ? t('owes {amount}', { amount: rupees(row.owesPaise) ?? '' }) : null].filter(Boolean).join(' · ')
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-[#1d1d23] py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-t3 font-semibold text-text-primary">{row.name || t('No name')}</span>
        <span className={cn('mt-0.5 block truncate text-[12px]', doubt ? 'text-[#F5A524]' : 'text-[#A8A8B2]')}>{doubt ?? line}</span>
      </span>
      {doubt ? (
        <button type="button" onClick={onCheck} className={cn(raised, 'h-11 shrink-0 rounded-small px-3.5 text-t4 font-semibold text-[#F5A524]')}>
          {t('Check')}
        </button>
      ) : (
        <button type="button" onClick={onCheck} aria-label={t('Change {name}', { name: row.name || t('No name') })} className="grid size-11 shrink-0 place-items-center text-[#4ADE80]">
          <IconCheck size={18} aria-hidden />
        </button>
      )}
    </div>
  )
}

function CheckSheet({ row, onClose, onSave, onLeaveOut }: { row: Row; onClose: () => void; onSave: (row: Row) => void; onLeaveOut: () => void }) {
  const t = useT()
  const [name, setName] = useState(row.name ?? '')
  const [phone, setPhone] = useState(row.phone ?? '')
  const [plate, setPlate] = useState(row.plate ?? '')
  const [car, setCar] = useState(row.car ?? '')
  const [owes, setOwes] = useState(row.owesPaise ? String(row.owesPaise / 100) : '')
  const owesPaise = owes ? Math.round(Number(owes) * 100) : null
  return (
    <ScSheet open onClose={onClose} aria-label={t('Check this row')} className="px-4">
      <div className="flex flex-col gap-3.5 pb-2">
        <h2 className="text-t2 font-semibold text-text-primary">{t('Check this row')}</h2>
        {row.match && <p className="text-[13px] text-[#F5A524]">{t('{name} is already in your book. Adding it fills in what is new; no one is added twice.', { name: row.match.name })}</p>}
        {row.note && <p className="text-[13px] text-[#A8A8B2]">{row.note}</p>}
        <Field id="import-name" label={t('Name')} value={name} onChange={setName} />
        <Field id="import-phone" label={t('Phone')} value={phone} onChange={(next) => setPhone(next.replace(/[^\d +]/g, ''))} inputMode="tel" />
        <div className="grid grid-cols-2 gap-2">
          <Field id="import-plate" label={t('Number plate')} value={plate} onChange={(next) => setPlate(next.toUpperCase())} />
          <Field id="import-car" label={t('Car')} value={car} onChange={setCar} />
        </div>
        <Field id="import-owes" label={t('Owes (₹)')} value={owes} onChange={(next) => setOwes(next.replace(/[^\d.]/g, ''))} inputMode="decimal" />
        <button
          type="button"
          disabled={!name.trim() && !phone.trim() && !plate.trim()}
          onClick={() =>
            onSave({
              ...row,
              name: name.trim() || null,
              phone: phone.trim() || null,
              plate: plate.trim() || null,
              car: car.trim() || null,
              owesPaise: owesPaise && Number.isFinite(owesPaise) ? owesPaise : null,
              unsure: [],
              checked: true,
            })
          }
          className={cn(raised, 'h-12 rounded-control text-t3 font-semibold text-text-primary disabled:text-[#8E8E98]')}
        >
          {t('Looks right')}
        </button>
        <button type="button" onClick={onLeaveOut} className="min-h-11 text-t4 font-medium text-[#FF8A95]">
          {t('Leave this one out')}
        </button>
      </div>
    </ScSheet>
  )
}
