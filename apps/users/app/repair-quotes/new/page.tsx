'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconAlertTriangle,
  IconCamera,
  IconCheck,
  IconChevronRight,
  IconInfoCircle,
  IconLoader2,
  IconMapPin,
  IconPencil,
  IconPlayerPlayFilled,
  IconPlus,
  IconVideo,
  IconX,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { RedLight } from '@repo/ui/finish/red-light'
import { useT } from '@repo/core/i18n'
import { ApiError } from '@repo/core/api/client'
import { prepareCarPhoto } from '@repo/core/api/job-records'
import {
  uploadRepairMedia,
  writeRepairBrief,
  type BriefSource,
  type RepairBrief,
} from '@repo/core/api/repair-quotes'
import {
  repairQuotesOn,
  useCreateRepairRequest,
  useMyRepairRequests,
  useRepairQuotesConfig,
} from '@repo/core/api/hooks/use-repair-quotes'
import { REPAIR_QUOTE_RULES, videoProblem, videoShortHint } from '@repo/core/repair-quotes'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { coarse, isCitywide, useLocationStore } from '@repo/core/stores/location-store'
import { useUserStore } from '@repo/core/stores/user-store'
import { VEHICLE_TIERS } from '@repo/core/vehicles'
import { cn } from '@repo/core/utils'
import { CustomerShell } from '@/components/customer-shell'
import { PageHeader } from '@/components/ui/page-header'
import { AreaPicker } from '@/components/area/area-picker'
import { BoxedPhoto } from '@/components/repair-quotes/boxed-photo'
import { briefImage, extractFrames, videoDuration, wipeVideo } from '@/lib/repair-media'

const R = REPAIR_QUOTE_RULES

interface PickedVideo {
  file: File
  preview: string
  secs: number
}

interface Picture {
  id: string
  kind: 'photo' | 'frame'
  blob: Blob
  preview: string
}

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)

/**
 * Repair quotes (0076), the two steps before sending: the car, a 15–30 s
 * video and/or up to 3 photos, and one line about what happened (step 1);
 * then what garages will see — a picture with Detlio's box on the damage
 * and a one-line brief the customer can edit — and Send (step 2).
 *
 * The AI reads pictures, so 4 frames are taken from the video here, on the
 * phone, and sent with the photos (small copies, no metadata). The video is
 * wiped of where it was recorded and every file goes straight to the private
 * bucket. If Detlio can't write the brief, the customer writes it.
 * Signed-in customers only (CUSTOMER_ROUTES).
 */
export default function NewRepairRequestPage() {
  const t = useT()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const config = useRepairQuotesConfig()
  const vehicles = useUserStore((s) => s.vehicles)
  const fetchVehicles = useUserStore((s) => s.fetchVehicles)
  const location = useLocationStore((s) => s.location)
  const create = useCreateRepairRequest()
  const mine = useMyRepairRequests(!!user && repairQuotesOn(config.data))

  const [step, setStep] = useState<1 | 2>(1)
  const [carId, setCarId] = useState<string | null>(null)
  const [video, setVideo] = useState<PickedVideo | null>(null)
  const [photos, setPhotos] = useState<Picture[]>([])
  const [frames, setFrames] = useState<Picture[]>([])
  const [note, setNote] = useState('')
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [mediaHint, setMediaHint] = useState<string | null>(null)
  const [busy, setBusy] = useState<'video' | 'photo' | null>(null)
  const [areaOpen, setAreaOpen] = useState(false)

  const [preparing, setPreparing] = useState(false)
  const [brief, setBrief] = useState<RepairBrief | null>(null)
  const [briefFailed, setBriefFailed] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  // From the tap: Send first waits for the uploads (a video can take a
  // while), so the button is held from then, not only once the request goes.
  const [sending, setSending] = useState(false)
  const sendingNow = useRef(false)
  const uploads = useRef(new Map<string, Promise<string>>())
  const videoInput = useRef<HTMLInputElement>(null)
  const angleInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (user) void fetchVehicles().catch(() => undefined)
  }, [user, fetchVehicles])

  // The default car, picked for them.
  const car = vehicles.find((v) => v.id === carId) ?? vehicles.find((v) => v.isDefault) ?? vehicles[0] ?? null
  const place = location && !isCitywide(location) ? location : null
  const pictures = [...frames, ...photos]

  if (config.isSuccess && !repairQuotesOn(config.data)) {
    return (
      <CustomerShell className="gap-4 py-2">
        <PageHeader title={t('Repair quotes')} backHref="/home" />
        <ErrorState message={t('Repair quotes aren’t available yet.')} />
      </CustomerShell>
    )
  }

  // ── Step 1: picking ───────────────────────────────────────────────────────

  const pickVideo = async (file: File | undefined) => {
    if (!file) return
    setMediaError(null)
    setMediaHint(null)
    setBusy('video')
    try {
      const secs = await videoDuration(file)
      const problem = videoProblem({ durationSecs: secs, sizeBytes: file.size, type: file.type || 'video/mp4' })
      if (problem) {
        setMediaError(t(problem))
        return
      }
      const hint = videoShortHint(secs)
      setMediaHint(hint ? t(hint) : null)
      if (video) URL.revokeObjectURL(video.preview)
      // A new video: its own upload and frames, never the old one's.
      uploads.current.delete('video')
      setVideo({ file, preview: URL.createObjectURL(file), secs: Math.max(1, Math.round(secs)) })
      setFrames([])
    } catch (error) {
      setMediaError(errorText(error, t('This video can’t be played. Try recording again.')))
    } finally {
      setBusy(null)
    }
  }

  const addPhoto = async (file: File | undefined): Promise<Picture | null> => {
    if (!file || photos.length >= R.maxPhotos) return null
    setMediaError(null)
    setBusy('photo')
    try {
      // A JPEG, PNG or WebP without its metadata (location, camera), as every customer upload.
      const blob = await prepareCarPhoto(file)
      const picture: Picture = { id: crypto.randomUUID(), kind: 'photo', blob, preview: URL.createObjectURL(blob) }
      setPhotos((current) => [...current, picture])
      return picture
    } catch (error) {
      setMediaError(errorText(error, t('This photo can’t be read. Try another one.')))
      return null
    } finally {
      setBusy(null)
    }
  }

  const removePhoto = (id: string) => {
    setPhotos((current) => current.filter((photo) => photo.id !== id))
    uploads.current.delete(id)
  }

  const step1Problem = !car
    ? t('Add your car first')
    : !video && photos.length === 0
      ? t('Add a video or a photo of the damage')
      : !note.trim()
        ? t('Say what happened in a line')
        : !place
          ? t('Choose where the car is')
          : null

  /** Starts an upload once per picture (or the video) and keeps its promise for Send. */
  const startUpload = (id: string, run: () => Promise<string>) => {
    if (!uploads.current.has(id)) {
      const promise = run()
      // Seen at Send; never an unhandled rejection meanwhile.
      promise.catch(() => undefined)
      uploads.current.set(id, promise)
    }
  }

  const readBrief = async (all: Picture[]) => {
    setBrief(null)
    setBriefFailed(null)
    setEditing(false)
    if (config.data?.ai === false) {
      setBriefFailed(t('Write a line for the garages: where the damage is and what it looks like.'))
      setText('')
      return
    }
    try {
      const images = []
      for (const picture of all) images.push(await briefImage(picture.blob))
      const written = await writeRepairBrief({ note: note.trim(), images })
      setBrief(written)
      setText(written.text)
    } catch (error) {
      setBriefFailed(
        error instanceof ApiError && error.message
          ? error.message
          : t('Detlio couldn’t write a summary. Write a line for the garages yourself.')
      )
      setText('')
    }
  }

  const next = async () => {
    if (step1Problem) return
    setPreparing(true)
    setSendError(null)
    setStep(2)
    try {
      let taken = frames
      if (video && frames.length === 0) {
        const blobs = await extractFrames(video.file, R.maxFrames).catch(() => [] as Blob[])
        taken = blobs.map((blob) => ({ id: crypto.randomUUID(), kind: 'frame' as const, blob, preview: URL.createObjectURL(blob) }))
        setFrames(taken)
      }
      const all = [...taken, ...photos]
      if (video) startUpload('video', async () => uploadRepairMedia('video', await wipeVideo(video.file)))
      for (const picture of all) startUpload(picture.id, () => uploadRepairMedia('photo', picture.blob))
      if (all.length === 0) {
        setBriefFailed(t('Write a line for the garages: where the damage is and what it looks like.'))
      } else {
        await readBrief(all)
      }
    } finally {
      setPreparing(false)
    }
  }

  // ── Step 2: the brief ─────────────────────────────────────────────────────

  const addAngle = async (file: File | undefined) => {
    const added = await addPhoto(file)
    if (!added) return
    startUpload(added.id, () => uploadRepairMedia('photo', added.blob))
    setPreparing(true)
    try {
      await readBrief([...frames, ...photos, added])
    } finally {
      setPreparing(false)
    }
  }

  const source: BriefSource = brief ? (text.trim() === brief.text ? 'ai' : 'ai_edited') : 'customer'
  const sendProblem = preparing
    ? t('Detlio is looking at your video…')
    : text.trim().length < 3
      ? t('Write a line for the garages')
      : null

  const send = async () => {
    if (sendProblem || !car || !place || sendingNow.current) return
    sendingNow.current = true
    setSending(true)
    setSendError(null)
    try {
      const videoKey = video ? await uploads.current.get('video') : undefined
      const sent = []
      for (const picture of pictures) {
        const key = await uploads.current.get(picture.id)
        if (key) sent.push({ key, kind: picture.kind })
      }
      const point = coarse(place)
      const request = await create.mutateAsync({
        vehicleId: car.id,
        lat: point.lat,
        lng: point.lng,
        note: note.trim(),
        brief: {
          text: text.trim(),
          area: brief?.area ?? null,
          damage: brief?.damage ?? null,
          // The box is the AI's: kept only while its brief is, and on a picture that was sent.
          box: brief?.box && brief.box.image < sent.length ? brief.box : null,
          source,
        },
        video: videoKey && video ? { key: videoKey, secs: Math.min(R.videoMaxSecs, video.secs) } : null,
        photos: sent,
      })
      router.replace(`/repair-quotes/${request.id}`)
    } catch (error) {
      setSendError(errorText(error, t('Couldn’t send it. Check your connection and try again.')))
      // A failed upload is tried again on the next Send.
      for (const [id, promise] of uploads.current) {
        promise.catch(() => uploads.current.delete(id))
      }
    } finally {
      sendingNow.current = false
      setSending(false)
    }
  }

  const boxed = brief?.box ? pictures[brief.box.image] : undefined
  const shown = boxed ?? pictures[0]
  const open = (mine.data ?? []).filter((request) => request.state === 'open' || request.state === 'booked').slice(0, 3)

  return (
    <CustomerShell className="gap-4 py-2">
      <PageHeader
        title={t('Repair quotes')}
        backHref={step === 1 ? '/home' : undefined}
        onBack={step === 2 ? () => setStep(1) : undefined}
        right={
          <span className="text-t4 text-dim">
            {t('Step {n} of {total}', { n: step, total: 2 })}
          </span>
        }
      />

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <p className="text-t3 text-text-secondary">
            {t('Show garages the damage and get quotes back, usually within a few hours. Free, nothing to pay now.')}
          </p>

          {open.length > 0 && (
            <div className="flex flex-col gap-2">
              {open.map((request) => (
                <Link
                  key={request.id}
                  href={`/repair-quotes/${request.id}`}
                  className="fx-raised fx-press flex min-h-12 items-center justify-between gap-3 rounded-[14px] px-4 text-t4"
                >
                  <span className="min-w-0 truncate text-text-primary">
                    {request.vehicle.label} · {request.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-dim">
                    {request.state === 'booked' ? t('Visit booked') : t('See quotes')}
                    <IconChevronRight size={16} aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          )}

          <section aria-labelledby="rq-car" className="flex flex-col gap-2">
            <h2 id="rq-car" className="text-t3 font-semibold text-text-primary">
              {t('Which car?')}
            </h2>
            {vehicles.length === 0 ? (
              <Link
                href="/profile"
                className="fx-raised fx-press inline-flex h-11 items-center gap-1.5 self-start rounded-[14px] px-4 text-t4 font-semibold text-text-primary"
              >
                <IconPlus size={15} aria-hidden className="text-[#ff4d66]" /> {t('Add a car')}
              </Link>
            ) : (
              <div className="flex flex-col gap-2">
                {vehicles.map((v) => {
                  const on = car?.id === v.id
                  const type = VEHICLE_TIERS.find((tier) => tier.value === v.vehicleType)?.label
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCarId(v.id)}
                      className="bk-opt relative flex min-h-[60px] items-center justify-between gap-3 rounded-[18px] px-4 text-left"
                    >
                      <span className="min-w-0">
                        <span className={cn('block truncate text-t3', on ? 'font-semibold text-text-primary' : 'font-medium text-[#D4D4DA]')}>
                          {v.make} {v.model}
                        </span>
                        <span className="block truncate text-t5 text-dim">
                          {[type ? t(type) : null, v.color?.toLowerCase()].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {on && <IconCheck size={18} aria-hidden className="shrink-0 text-text-primary" />}
                      <RedLight state={on ? 'on' : 'off'} className="absolute bottom-[5px] left-1/2 -ml-2.5" />
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section aria-labelledby="rq-damage" className="flex flex-col gap-2">
            <h2 id="rq-damage" className="text-t3 font-semibold text-text-primary">
              {t('Show the damage')}
            </h2>
            <p className="text-t4 text-text-secondary">
              {t('A {from}–{to} second video, walking slowly past it. Or up to {photos} photos.', {
                from: R.videoMinSecs,
                to: R.videoMaxSecs,
                photos: R.maxPhotos,
              })}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {video ? (
                <div className="relative h-[120px] overflow-hidden rounded-[14px] bg-surface-elevated">
                  <video
                    src={video.preview}
                    muted
                    playsInline
                    preload="metadata"
                    aria-label={t('Your video, {secs} seconds', { secs: video.secs })}
                    className="h-full w-full object-cover"
                  />
                  <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
                    <span className="fx-glass grid size-11 place-items-center rounded-full text-white">
                      <IconPlayerPlayFilled size={18} />
                    </span>
                  </span>
                  <span className="absolute bottom-1.5 left-1.5 rounded-[6px] bg-black/60 px-1.5 font-numeric text-t5 font-semibold text-white">
                    0:{String(video.secs).padStart(2, '0')}
                  </span>
                </div>
              ) : (
                <label
                  className={cn(
                    'flex h-[120px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-border text-t4 font-medium text-text-secondary',
                    busy && 'pointer-events-none opacity-60'
                  )}
                >
                  {busy === 'video' ? <IconLoader2 size={20} className="animate-spin" aria-hidden /> : <IconVideo size={20} aria-hidden />}
                  {t('Add video')}
                  <input
                    ref={videoInput}
                    type="file"
                    accept="video/*"
                    className="sr-only"
                    disabled={busy !== null}
                    onChange={(event) => {
                      void pickVideo(event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>
              )}
              {photos.map((photo, index) => (
                <div key={photo.id} className="relative h-[120px] overflow-hidden rounded-[14px] bg-surface-elevated">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview} alt={t('Photo {n}', { n: index + 1 })} className="h-full w-full object-cover" />
                  <span className="absolute bottom-1.5 left-1.5 rounded-[6px] bg-black/60 px-1.5 text-t5 font-semibold text-white">
                    {t('Photo')}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    aria-label={t('Remove photo {n}', { n: index + 1 })}
                    className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-black/70 text-white"
                  >
                    <IconX size={14} aria-hidden />
                  </button>
                </div>
              ))}
              {photos.length < R.maxPhotos && (
                <label
                  className={cn(
                    'flex h-[120px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-border text-t4 font-medium text-text-secondary',
                    busy && 'pointer-events-none opacity-60'
                  )}
                >
                  {busy === 'photo' ? <IconLoader2 size={20} className="animate-spin" aria-hidden /> : <IconCamera size={20} aria-hidden />}
                  {t('Add photo')}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={busy !== null}
                    onChange={(event) => {
                      void addPhoto(event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
            {video && (
              <label className="fx-raised fx-press flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full text-t4 font-semibold text-text-primary">
                <IconVideo size={16} aria-hidden />
                {t('Record again')}
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="sr-only"
                  disabled={busy !== null}
                  onChange={(event) => {
                    void pickVideo(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </label>
            )}
            {mediaError && (
              <p role="alert" className="text-t4 text-error">
                {mediaError}
              </p>
            )}
            {mediaHint && !mediaError && <p className="text-t5 text-dim">{mediaHint}</p>}
          </section>

          <section className="flex flex-col gap-2">
            <label htmlFor="rq-note" className="text-t3 font-semibold text-text-primary">
              {t('What happened?')}
            </label>
            <input
              id="rq-note"
              data-clarity-mask="true"
              value={note}
              maxLength={R.noteMax}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('Scraped a pillar while parking')}
              className="fx-recessed h-12 w-full rounded-[14px] px-4 text-[16px] text-text-primary outline-none placeholder:text-text-muted"
            />
            <p className="text-t5 text-dim">{t('One line is enough.')}</p>
          </section>

          <p className="flex items-center gap-2 text-t4 text-text-secondary">
            <IconMapPin size={16} aria-hidden className="shrink-0" />
            <span className="min-w-0 flex-1">
              {place ? t('Garages near {place}', { place: place.label }) : t('Where is the car?')}
            </span>
            <button
              type="button"
              onClick={() => setAreaOpen(true)}
              className="min-h-11 shrink-0 px-1 font-semibold text-text-primary underline-offset-4 hover:underline"
            >
              {place ? t('Change') : t('Choose area')}
            </button>
          </p>

          <ScButton
            variant="main"
            size="lg"
            onClick={() => void next()}
            disabled={Boolean(step1Problem) || busy !== null}
            disabledReason={step1Problem ?? undefined}
          >
            {t('Next')}
          </ScButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="text-title font-semibold text-text-primary">{t('Check before sending')}</h2>
          <section aria-label={t('What garages will see')} className="hub-card p-[18px]">
            <p className="text-t4 text-dim">{t('What garages will see')}</p>
            {preparing && !brief ? (
              <div className="mt-3 flex flex-col gap-3" role="status">
                <div className="h-[170px] rounded-[14px] shimmer" />
                <p className="flex items-center gap-2 text-t4 text-text-secondary">
                  <IconLoader2 size={16} className="animate-spin" aria-hidden />
                  {t('Detlio is looking at your video…')}
                </p>
              </div>
            ) : (
              <>
                {shown && (
                  <BoxedPhoto
                    src={shown.preview}
                    alt={t('Your car, with the damage marked')}
                    box={boxed ? brief!.box : null}
                    label={boxed ? brief?.damage : null}
                    className="mt-3 h-[170px]"
                  />
                )}
                {briefFailed && (
                  <p role="status" className="mt-3 text-t4 text-text-secondary">
                    {briefFailed}
                  </p>
                )}
                {editing || !brief ? (
                  <textarea
                    aria-label={t('What garages will read')}
                    data-clarity-mask="true"
                    value={text}
                    maxLength={R.briefMax}
                    rows={3}
                    autoFocus={editing}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={t('Front bumper, left side: deep scratch with a small dent.')}
                    className="fx-recessed mt-3 w-full resize-none rounded-[14px] px-4 py-3 text-[16px] text-text-primary outline-none placeholder:text-text-muted"
                  />
                ) : (
                  <p className="mt-3.5 text-t2 font-medium text-text-primary">{text}</p>
                )}
                <p className="mt-2 text-t4 text-[#A1A1AA]" data-clarity-mask="true">
                  “{note.trim()}”
                </p>
                {brief && (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                    <span className="text-t5 text-dim">
                      {video ? t('Written by Detlio from your video. Edit it if it is wrong.') : t('Written by Detlio from your photos. Edit it if it is wrong.')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing((value) => !value)}
                      className="flex min-h-11 shrink-0 items-center gap-1.5 text-t4 font-medium text-text-primary"
                    >
                      {editing ? <IconCheck size={15} aria-hidden /> : <IconPencil size={15} aria-hidden />}
                      {editing ? t('Done') : t('Edit')}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {brief?.unclear && photos.length < R.maxPhotos && (
            <section className="fx-edge flex flex-col gap-3 rounded-[22px] p-4">
              <div className="flex items-start gap-2.5">
                <IconAlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                <p className="text-t4 text-text-secondary">
                  <b className="font-medium text-text-primary">{t('Add another angle?')}</b>{' '}
                  {brief.angleHint ?? t('A close photo helps garages quote closer.')}
                </p>
              </div>
              <label
                className={cn(
                  'fx-raised fx-press flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full text-t4 font-semibold text-text-primary',
                  (busy !== null || preparing) && 'pointer-events-none opacity-60'
                )}
              >
                <IconCamera size={16} aria-hidden />
                {t('Add another angle')}
                <input
                  ref={angleInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  disabled={busy !== null || preparing}
                  onChange={(event) => {
                    void addAngle(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </label>
            </section>
          )}

          <p className="flex items-start gap-2 px-0.5 py-1 text-t4 text-text-secondary">
            <IconInfoCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {t('Goes to up to {count} garages near you that do bodywork. Your number stays hidden.', {
                count: config.data?.maxGarages ?? R.maxGarages,
              })}
            </span>
          </p>

          {sendError && (
            <p role="alert" className="text-t4 text-error">
              {sendError}
            </p>
          )}
          <ScButton
            variant="main"
            size="lg"
            onClick={() => void send()}
            disabled={Boolean(sendProblem) || sending}
            disabledReason={sendProblem ?? undefined}
          >
            {sending ? t('Sending…') : t('Send to nearby garages')}
          </ScButton>
        </div>
      )}

      <AreaPicker open={areaOpen} onClose={() => setAreaOpen(false)} />
    </CustomerShell>
  )
}
