'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { IconDownload, IconRefresh, IconUpload } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSelect } from '@repo/ui/sc/select'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { ScSwitch } from '@repo/ui/sc/switch'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminRewardsSettings, useSaveAdminRewardsSettings } from '@repo/core/api/hooks/use-admin-rewards'
import {
  adminGarageKeys,
  useAdminGarage,
  useAdminGarageStats,
  useResetGarageArt,
  useUpdateGarageCar,
  useUpdateGarageSeries,
} from '@repo/core/api/hooks/use-admin-garage'
import { garageArtUploadUrl, getAdminGaragePulls, submitGarageArtUpload, type AdminGarageCar, type AdminGarageOverview } from '@repo/core/api/garage'
import type { AdminRewardsSettings } from '@repo/core/api/rewards'
import { downloadCsv } from '@repo/core/csv'
import { CARD_CARS, cardCarById, cardCarSrc } from '@repo/core/card-cars'
import { GARAGE_RARITIES, garageSettings, ILLUSTRATION_LINE, RARITY_LABELS, RARITY_LOOKS, type GarageSettings, type SeriesStatus } from '@repo/core/garage'
import { rememberName, rememberedName } from '@/lib/actor-name'
import { garageFormProblems, oddsTotal, pullsCsv, toCardWebp } from '@/lib/garage'
import { istMonthNow, monthLabel, recentMonths } from '@/lib/rewards'

/**
 * Admin → Rewards → Garage (0057): the Garage's switch and numbers (a new
 * version of the rewards settings, audit-logged), the series, the 40 cards
 * (name, rarity, the pool photo, colour, setting, line, on/off; an uploaded
 * picture for a future series, or back to the photo), and the month's
 * figures with the pulls CSV. Every write carries the typed name.
 */
export function GarageSection() {
  const [seriesId, setSeriesId] = useState<string | null>(null)
  const overview = useAdminGarage(seriesId)
  const settings = useAdminRewardsSettings(true)
  if (overview.isPending || settings.isPending) return <SkeletonList />
  if (overview.isError || !overview.data || settings.isError || !settings.data) {
    return <ErrorState message={errorMessage(overview.error ?? settings.error, "Couldn't load the Garage")} onRetry={() => void overview.refetch()} />
  }
  const data = overview.data
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[12px] text-text-secondary">
        Supercar photo cards: one for every booking that earns a Shine Card stamp, plus scratch cards, challenges and badges. Card names are
        Detlio&apos;s own and are checked against real car names when saved.{' '}
        {data.live ? <ScBadge variant="success">Live</ScBadge> : <ScBadge variant="muted">Not live</ScBadge>}
      </p>
      <GarageSettingsCard key={settings.data.version} current={settings.data} />
      <SeriesCard overview={data} onSeries={setSeriesId} />
      {data.seriesId && <StatsCard seriesId={data.seriesId} />}
      <CarsCard overview={data} />
    </div>
  )
}

function Num({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <ScInput label={label} inputMode="numeric" value={String(value)} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '') || '0'))} className="min-h-10 font-numeric" />
      {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
    </div>
  )
}

function GarageSettingsCard({ current }: { current: AdminRewardsSettings }) {
  const save = useSaveAdminRewardsSettings()
  const queryClient = useQueryClient()
  const saved = garageSettings(current.settings)
  const [draft, setDraft] = useState<GarageSettings>(() => structuredClone(saved))
  const [name, setName] = useState(rememberedName)
  const problems = garageFormProblems(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const set = (patch: Partial<GarageSettings>) => setDraft({ ...draft, ...patch })

  const submit = () => {
    if (!dirty || problems.length > 0 || name.trim().length < 2) return
    rememberName(name.trim())
    save.mutate(
      { version: current.version, settings: { ...current.settings, garage: draft }, actorName: name.trim() },
      {
        onSuccess: (data) => {
          toast.success(`Saved as version ${data.version}`)
          void queryClient.invalidateQueries({ queryKey: adminGarageKeys.all })
        },
        onError: (err) => toast.error(errorMessage(err, "Couldn't save the Garage settings")),
      }
    )
  }

  return (
    <ScCard className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">Garage on</h2>
          <p className="text-[12px] text-text-secondary">Customers see the Garage and earn cards only while this is on and rewards are live.</p>
        </div>
        <ScSwitch checked={draft.enabled} onChange={(on: boolean) => set({ enabled: on })} label="Garage on" />
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium text-text-primary">Odds per card (add up to 100; now {oddsTotal(draft.rarityWeights)})</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {GARAGE_RARITIES.map((r) => (
            <Num key={r} label={`${RARITY_LABELS[r]} %`} value={draft.rarityWeights[r]} onChange={(v) => set({ rarityWeights: { ...draft.rarityWeights, [r]: v } })} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Num label="Chance of a new car (%)" value={draft.unownedBiasPercent} onChange={(v) => set({ unownedBiasPercent: v })} hint="Within the drawn rarity, when one is missing" />
        <Num label="Rare or better within" value={draft.pityRare} onChange={(v) => set({ pityRare: v })} hint="Cards (pity)" />
        <Num label="Legendary within" value={draft.pityLegendary} onChange={(v) => set({ pityLegendary: v })} hint="Cards (pity)" />
        <Num label="Duplicates per bonus stamp" value={draft.duplicatesPerStar} onChange={(v) => set({ duplicatesPerStar: v })} />
        <Num label="Row reward (₹ off)" value={draft.rowVoucher} onChange={(v) => set({ rowVoucher: v })} hint="Counts toward the monthly budget" />
        <Num label="Stamps instead, past the budget" value={draft.rowFallbackStamps} onChange={(v) => set({ rowFallbackStamps: v })} />
        <Num label="Scratch card: Garage card (%)" value={draft.scratchCardWeight} onChange={(v) => set({ scratchCardWeight: v })} hint="Drawn before the prize table" />
        <Num label="Cards per badge earned" value={draft.badgeBonusCards} onChange={(v) => set({ badgeBonusCards: v })} />
      </div>
      {problems.length > 0 && <p className="text-[12px] text-warning">{problems.join(' · ')}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <ScInput label="Your name" value={name} onChange={(e) => setName(e.target.value)} className="min-h-10" />
        </div>
        <ScButton fullWidth={false} className="px-5" disabled={!dirty || problems.length > 0 || name.trim().length < 2 || save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save Garage settings'}
        </ScButton>
        <p className="text-[11px] text-text-muted">Saved as a new version of the rewards settings, with your name in the audit log. Going forward only.</p>
      </div>
    </ScCard>
  )
}

function SeriesCard({ overview, onSeries }: { overview: AdminGarageOverview; onSeries: (id: string) => void }) {
  const series = overview.series.find((s) => s.id === overview.seriesId) ?? null
  const update = useUpdateGarageSeries()
  const [name, setName] = useState(series?.name ?? '')
  const [status, setStatus] = useState<SeriesStatus>(series?.status ?? 'draft')
  const [actor, setActor] = useState(rememberedName)
  if (!series) return null
  return (
    <ScCard className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Series</h2>
        {overview.series.length > 1 && (
          <ScSelect label="Show" value={series.id} onChange={(e) => onSeries(e.target.value)}>
            {overview.series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </ScSelect>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ScInput label="Name" value={name} onChange={(e) => setName(e.target.value)} className="min-h-10" />
        <ScSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value as SeriesStatus)}>
          <option value="draft">Draft (no pulls)</option>
          <option value="live">Live (pulls draw from it)</option>
          <option value="ended">Ended</option>
        </ScSelect>
        <ScInput label="Your name" value={actor} onChange={(e) => setActor(e.target.value)} className="min-h-10" />
      </div>
      <div className="flex items-center gap-3">
        <ScButton
          fullWidth={false}
          variant="secondary"
          className="px-5"
          disabled={update.isPending || actor.trim().length < 2 || (name === series.name && status === series.status)}
          onClick={() => {
            rememberName(actor.trim())
            update.mutate(
              { id: series.id, name, status, startsAt: series.startsAt, endsAt: series.endsAt, actorName: actor.trim() },
              { onSuccess: () => toast.success('Series saved'), onError: (err) => toast.error(errorMessage(err, "Couldn't save the series")) }
            )
          }}
        >
          Save series
        </ScButton>
        <p className="text-[11px] text-text-muted">A series finished by a customer is recorded (the hook for any future prize); nothing else hangs on it yet.</p>
      </div>
    </ScCard>
  )
}

function StatsCard({ seriesId }: { seriesId: string }) {
  const [month, setMonth] = useState(istMonthNow())
  const stats = useAdminGarageStats(seriesId, month)
  const [busy, setBusy] = useState(false)
  const data = stats.data
  return (
    <ScCard className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Figures</h2>
        <div className="flex items-end gap-2">
          <ScSelect label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {recentMonths().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </ScSelect>
          <ScButton
            variant="secondary"
            fullWidth={false}
            className="flex min-h-10 items-center gap-1.5 px-3"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const pulls = await getAdminGaragePulls(month)
                downloadCsv(pullsCsv(pulls.rows), `garage-pulls-${month}.csv`)
              } catch (err) {
                toast.error(errorMessage(err, "Couldn't make the CSV"))
              } finally {
                setBusy(false)
              }
            }}
          >
            <IconDownload size={16} aria-hidden="true" /> CSV
          </ScButton>
        </div>
      </div>
      {!data ? (
        <SkeletonList />
      ) : (
        <>
          <table className="w-full text-left text-[12px]">
            <thead className="text-text-muted">
              <tr>
                <th className="py-1 font-medium">Rarity</th>
                <th className="py-1 font-medium">Odds</th>
                <th className="py-1 font-medium">Pulled</th>
                <th className="py-1 font-medium">Share</th>
                <th className="py-1 font-medium">By pity</th>
              </tr>
            </thead>
            <tbody className="font-numeric text-text-primary">
              {data.rarities.map((r) => (
                <tr key={r.rarity} className="border-t border-border">
                  <td className="py-1.5 font-sans">
                    <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: RARITY_LOOKS[r.rarity].pill }} />
                    {r.label}
                  </td>
                  <td>{r.odds}%</td>
                  <td>{r.pulled}</td>
                  <td>{r.share}%</td>
                  <td>{r.byPity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
            <Figure label="Cards pulled" value={data.pulls} />
            <Figure label="Collectors" value={data.collectors} />
            <Figure label="Duplicates" value={data.duplicates.pulled} hint={`${data.duplicates.garageStamps} bonus stamps`} />
            <Figure label="Rows finished" value={data.rows.reduce((s, r) => s + r.n, 0)} hint={`${data.series.thisMonth} series finished (${data.series.ever} ever)`} />
          </div>
          <p className="text-[12px] text-text-secondary">From: {data.sources.map((s) => `${s.label} ${s.pulled}`).join(' · ')}</p>
          {data.topCollectors.length > 0 && (
            <div>
              <p className="mb-1 text-[13px] font-medium text-text-primary">Top collectors</p>
              <ul className="flex flex-col gap-1 text-[12px] text-text-secondary">
                {data.topCollectors.map((c) => (
                  <li key={c.userId} className="flex justify-between gap-3">
                    <span>
                      {c.name} · <span className="font-numeric">{c.phone}</span>
                      {c.completed && ' · series complete'}
                    </span>
                    <span className="font-numeric text-text-primary">
                      {c.cars} cars · {c.copies} copies
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </ScCard>
  )
}

function Figure({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-[10px] border border-border px-3 py-2">
      <p className="text-text-muted">{label}</p>
      <p className="font-numeric text-[18px] font-semibold text-text-primary">{value.toLocaleString('en-IN')}</p>
      {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
    </div>
  )
}

/**
 * The card photos live with the customer site (apps/users/public/cards/cars);
 * admin shows them from there. NEXT_PUBLIC_CARD_PHOTOS_URL points at it
 * (default https://detlio.com; the users app's dev server in development).
 */
const PHOTO_BASE = (process.env.NEXT_PUBLIC_CARD_PHOTOS_URL ?? 'https://detlio.com').replace(/\/$/, '')

function photoSrc(photoId: string): string {
  const photo = cardCarById(photoId) ?? CARD_CARS[0]
  return `${PHOTO_BASE}${cardCarSrc(photo, 800)}`
}

function artFor(car: AdminGarageCar): string {
  return car.artSource === 'upload' && car.artUrl ? car.artUrl : photoSrc(car.photoId)
}

function CarsCard({ overview }: { overview: AdminGarageOverview }) {
  const used = new Map<string, number>()
  for (const car of overview.cars) used.set(car.photoId, (used.get(car.photoId) ?? 0) + 1)
  const twice = [...used.values()].filter((n) => n > 1).length
  return (
    <ScCard className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Cards ({overview.cars.length})</h2>
        <p className="text-[12px] text-text-secondary">
          Each card is one of the licensed card photos ({CARD_CARS.length} in the pool), shown with &ldquo;{ILLUSTRATION_LINE}&rdquo; Names never hint at a maker or model;
          facts are what the photo shows (colour, setting), never speeds or power.
          {twice > 0 && <span className="text-warning"> {twice} photos are used by more than one card.</span>}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {overview.cars.map((car) => (
          <CarRow key={car.id} car={car} settings={overview.settings} />
        ))}
      </ul>
    </ScCard>
  )
}

function CarRow({ car, settings }: { car: AdminGarageCar; settings: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <div className="relative h-[56px] w-[72px] shrink-0 overflow-hidden rounded-[8px] bg-black" style={{ boxShadow: `inset 0 0 0 2px ${RARITY_LOOKS[car.rarity].pill}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a licensed card photo or an R2 upload, sized here */}
          <img src={artFor(car)} alt="" className="absolute inset-[2px] h-[calc(100%-4px)] w-[calc(100%-4px)] rounded-[6px] object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-text-primary">
            <span className="font-numeric text-text-muted">#{String(car.number).padStart(2, '0')}</span> {car.name}
            {!car.enabled && <span className="text-text-muted"> · off</span>}
          </p>
          <p className="text-[11px] text-text-secondary">
            {RARITY_LABELS[car.rarity]} · {car.colour} · {car.setting} · photo {car.artSource === 'upload' ? '(uploaded)' : car.photoId} · <span className="font-numeric">{car.pulls}</span> pulled,{' '}
            <span className="font-numeric">{car.owners}</span> own it
          </p>
        </div>
        <ScButton variant="secondary" fullWidth={false} className="min-h-9 px-3 text-[12px]" onClick={() => setOpen((on) => !on)} aria-expanded={open}>
          {open ? 'Close' : 'Edit'}
        </ScButton>
      </div>
      {open && <CarEditor car={car} settings={settings} />}
    </li>
  )
}

function CarEditor({ car, settings }: { car: AdminGarageCar; settings: string[] }) {
  const update = useUpdateGarageCar()
  const reset = useResetGarageArt()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [actor, setActor] = useState(rememberedName)
  const [form, setForm] = useState({
    name: car.name,
    rarity: car.rarity,
    photoId: car.photoId,
    colour: car.colour,
    setting: car.setting,
    lore: car.lore,
    enabled: car.enabled,
  })
  const named = actor.trim().length >= 2

  const upload = async (file: File) => {
    if (!named) return toast.error('Type your name first')
    setUploading(true)
    try {
      const webp = file.type === 'image/webp' ? file : await toCardWebp(file)
      if (!webp) throw new Error('This browser cannot make a WebP. Upload a .webp file, or use Chrome.')
      const { uploadUrl, key } = await garageArtUploadUrl(car.id, webp.size)
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: webp })
      if (!put.ok) throw new Error("The picture didn't upload. Try again.")
      await submitGarageArtUpload(car.id, { key, actorName: actor.trim() })
      rememberName(actor.trim())
      toast.success('Picture saved')
      void queryClient.invalidateQueries({ queryKey: adminGarageKeys.all })
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't upload the picture"))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[12px] border border-border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-text-secondary">Photo (the card photo pool)</p>
          <div className="overflow-hidden rounded-[10px] bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element -- a licensed card photo, sized here */}
            <img src={photoSrc(form.photoId)} alt="" className="w-full" />
          </div>
          <div className="grid max-h-[220px] grid-cols-4 gap-1.5 overflow-y-auto pr-1">
            {CARD_CARS.map((photo) => (
              <button
                key={photo.id}
                type="button"
                title={photo.alt}
                onClick={() => setForm({ ...form, photoId: photo.id })}
                className={`overflow-hidden rounded-[6px] border ${form.photoId === photo.id ? 'border-white' : 'border-border opacity-70 hover:opacity-100'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a licensed card photo, sized here */}
                <img src={photoSrc(photo.id)} alt={photo.alt} className="aspect-[16/13] w-full object-cover" />
              </button>
            ))}
          </div>
          {car.artSource === 'upload' && car.artUrl && (
            <>
              <p className="text-[12px] text-text-secondary">In use instead of the photo: an uploaded picture</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- an R2 upload, sized here */}
              <img src={car.artUrl} alt="" className="w-full rounded-[10px]" />
            </>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <ScInput label="Name (Detlio's own, never a make or model)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="min-h-10" />
          <ScSelect label="Rarity" value={form.rarity} onChange={(e) => setForm({ ...form, rarity: e.target.value as typeof form.rarity })}>
            {GARAGE_RARITIES.map((r) => (
              <option key={r} value={r}>
                {RARITY_LABELS[r]}
              </option>
            ))}
          </ScSelect>
          <div className="grid grid-cols-2 gap-3">
            <ScInput label="Colour (as photographed)" value={form.colour} onChange={(e) => setForm({ ...form, colour: e.target.value })} className="min-h-10" />
            <div className="flex flex-col gap-1">
              <ScInput label="Setting" list={`settings-${car.id}`} value={form.setting} onChange={(e) => setForm({ ...form, setting: e.target.value })} className="min-h-10" />
              <datalist id={`settings-${car.id}`}>
                {settings.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </div>
          <ScTextarea label="Line (no speeds, power or times)" value={form.lore} onChange={(e) => setForm({ ...form, lore: e.target.value })} rows={2} />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-text-primary">Switched on (can be pulled)</span>
            <ScSwitch checked={form.enabled} onChange={(on: boolean) => setForm({ ...form, enabled: on })} label="Card switched on" />
          </div>
          <ScInput label="Your name" value={actor} onChange={(e) => setActor(e.target.value)} className="min-h-10" />
          <ScButton
            fullWidth={false}
            className="self-start px-5"
            disabled={!named || update.isPending}
            onClick={() => {
              rememberName(actor.trim())
              update.mutate(
                { id: car.id, car: form, actorName: actor.trim() },
                { onSuccess: () => toast.success('Card saved'), onError: (err) => toast.error(errorMessage(err, "Couldn't save the card")) }
              )
            }}
          >
            Save card
          </ScButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/webp,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void upload(file)
          }}
        />
        <ScButton variant="secondary" fullWidth={false} className="flex min-h-10 items-center gap-1.5 px-3" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <IconUpload size={16} aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Upload a picture (future series)'}
        </ScButton>
        {car.artSource === 'upload' && (
          <ScButton
            variant="secondary"
            fullWidth={false}
            className="flex min-h-10 items-center gap-1.5 px-3"
            disabled={!named || reset.isPending}
            onClick={() =>
              reset.mutate({ id: car.id, actorName: actor.trim() }, { onSuccess: () => toast.success('Back to the photo'), onError: (err) => toast.error(errorMessage(err, "Couldn't reset")) })
            }
          >
            <IconRefresh size={16} aria-hidden="true" />
            Reset to the photo
          </ScButton>
        )}
        <p className="text-[11px] text-text-muted">An upload must be licensed for Detlio, with every badge, logo, lettering and plate removed.</p>
      </div>
    </div>
  )
}
