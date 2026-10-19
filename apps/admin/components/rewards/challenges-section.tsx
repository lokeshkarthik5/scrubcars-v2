'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { EmptyState, ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSelect } from '@repo/ui/sc/select'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { StatTile } from '@repo/ui/sc/stat-tile'
import { IconTrophy } from '@tabler/icons-react'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminChallenge,
  useAdminChallenges,
  useCreateChallenge,
  useEndChallenge,
  usePublishChallenge,
  useUpdateChallenge,
} from '@repo/core/api/hooks/use-admin-reward-extras'
import {
  getAdminChallengeResults,
  type AdminChallenge,
  type ChallengeFormValues,
  type ChallengeStatus,
} from '@repo/core/api/reward-extras'
import { useAdminRewardsSettings } from '@repo/core/api/hooks/use-admin-rewards'
import { LEVELS, DEFAULT_REWARDS_SETTINGS } from '@repo/core/rewards'
import { downloadCsv } from '@repo/core/csv'
import { formatRupees } from '@/lib/bookings'
import { rememberName, rememberedName } from '@/lib/actor-name'
import {
  CHALLENGE_STATUS_LABELS,
  challengeFormProblems,
  challengeFormValues,
  challengePayload,
  challengeResultsCsv,
  emptyChallenge,
} from '@/lib/rewards'

const STATUS_VARIANT: Record<
  ChallengeStatus,
  'success' | 'pending' | 'muted' | 'active'
> = {
  draft: 'muted',
  scheduled: 'pending',
  live: 'success',
  finished: 'muted',
  ended: 'muted',
}

const CATEGORY_LABELS: Record<
  NonNullable<ChallengeFormValues['category']>,
  string
> = {
  car_wash: 'Car wash',
  detailing: 'Detailing',
  coating: 'Coating',
  scratch_removal: 'Scratch removal',
  others: 'Others',
  package: 'Package',
}

function day(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function when(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : '—'
}

type View =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; challenge: AdminChallenge }

/**
 * Admin → Rewards → Challenges (0054): the team's seasonal challenges.
 * Create one as a draft, publish it to schedule it (from today on; never a
 * start in the past), edit it (everything until it starts; then only the
 * words and a higher winners cap), end it early. Each detail shows who took
 * part, the winners and the cost, with a CSV of the results. Every write
 * carries the typed name into the audit log.
 */
export function ChallengesSection() {
  const [view, setView] = useState<View>({ kind: 'list' })
  if (view.kind === 'new')
    return (
      <ChallengeForm
        onDone={(id) => setView(id ? { kind: 'detail', id } : { kind: 'list' })}
      />
    )
  if (view.kind === 'edit')
    return (
      <ChallengeForm
        existing={view.challenge}
        onDone={() => setView({ kind: 'detail', id: view.challenge.id })}
      />
    )
  if (view.kind === 'detail')
    return (
      <ChallengeDetail
        id={view.id}
        onBack={() => setView({ kind: 'list' })}
        onEdit={(challenge) => setView({ kind: 'edit', challenge })}
      />
    )
  return (
    <ChallengeList
      onOpen={(id) => setView({ kind: 'detail', id })}
      onNew={() => setView({ kind: 'new' })}
    />
  )
}

function ChallengeList({
  onOpen,
  onNew,
}: {
  onOpen: (id: string) => void
  onNew: () => void
}) {
  const list = useAdminChallenges(true)
  if (list.isPending) return <SkeletonList />
  if (list.isError || !list.data)
    return (
      <ErrorState
        message={errorMessage(list.error, "Couldn't load the challenges")}
        onRetry={() => void list.refetch()}
      />
    )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-text-secondary">
          Customers see live challenges on their Rewards page and Home. Drafts
          are seen by nobody.
        </p>
        <ScButton
          fullWidth={false}
          className="min-h-10 shrink-0 px-4"
          onClick={onNew}
        >
          New challenge
        </ScButton>
      </div>
      {list.data.challenges.length === 0 ? (
        <EmptyState
          icon={<IconTrophy size={32} stroke={1.5} />}
          title="No challenges yet"
          subtitle="Create one as a draft; publish it when it's ready."
        />
      ) : (
        list.data.challenges.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onOpen(c.id)}
            className="text-left"
          >
            <ScCard className="flex flex-col gap-1.5 px-4 py-3 hover:bg-surface-elevated/40">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-semibold text-text-primary">
                  {c.title}
                </p>
                <ScBadge variant={STATUS_VARIANT[c.status]}>
                  {CHALLENGE_STATUS_LABELS[c.status]}
                </ScBadge>
              </div>
              <p className="text-[12px] text-text-secondary">
                {day(c.startDate)} – {day(c.endDate)} · {c.counts} wins{' '}
                {c.reward}
                {c.audienceMinLevel ? ` · ${c.audienceMinLevel} and up` : ''}
              </p>
              <p className="font-numeric text-[12px] text-text-muted">
                {c.participants} taking part · {c.winners}
                {c.maxWinners !== null ? ` of ${c.maxWinners}` : ''} won ·{' '}
                {formatRupees(c.cost.vouchers)} in vouchers · {c.cost.stamps}{' '}
                stamps
              </p>
            </ScCard>
          </button>
        ))
      )}
    </div>
  )
}

function ChallengeDetail({
  id,
  onBack,
  onEdit,
}: {
  id: string
  onBack: () => void
  onEdit: (c: AdminChallenge) => void
}) {
  const detail = useAdminChallenge(id)
  const publish = usePublishChallenge(id)
  const end = useEndChallenge(id)
  const [name, setName] = useState(rememberedName)
  const [downloading, setDownloading] = useState(false)

  if (detail.isPending) return <SkeletonList />
  if (detail.isError || !detail.data)
    return (
      <ErrorState
        message={errorMessage(detail.error, "Couldn't load the challenge")}
        onRetry={() => void detail.refetch()}
      />
    )
  const { challenge: c, results } = detail.data

  const act = (which: 'publish' | 'end') => {
    if (name.trim().length < 2) return toast.error('Type your name first')
    rememberName(name.trim())
    const mutation = which === 'publish' ? publish : end
    mutation.mutate(name.trim(), {
      onSuccess: () =>
        toast.success(which === 'publish' ? 'Published' : 'Ended'),
      onError: (err) =>
        toast.error(
          errorMessage(
            err,
            which === 'publish' ? "Couldn't publish it" : "Couldn't end it"
          )
        ),
    })
  }

  const download = async () => {
    setDownloading(true)
    try {
      const data = await getAdminChallengeResults(id)
      downloadCsv(
        challengeResultsCsv(data.rows),
        `detlio-challenge-${data.challenge.startDate}-${data.challenge.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
      )
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't download the results"))
    } finally {
      setDownloading(false)
    }
  }

  const running = c.status === 'live' || c.status === 'scheduled'
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-[12px] text-text-secondary underline underline-offset-4"
      >
        All challenges
      </button>
      <ScCard className="flex flex-col gap-2 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-text-primary">
            {c.title}
          </h2>
          <ScBadge variant={STATUS_VARIANT[c.status]}>
            {CHALLENGE_STATUS_LABELS[c.status]}
          </ScBadge>
        </div>
        {c.description && (
          <p className="text-[13px] text-text-secondary">{c.description}</p>
        )}
        <p className="text-[12px] text-text-secondary">
          {day(c.startDate)} – {day(c.endDate)} (IST, both days included) ·{' '}
          {c.counts}
          {c.category ? '' : ' (any service)'} wins {c.reward}
          {c.audienceMinLevel
            ? ` · for ${c.audienceMinLevel} and up`
            : ' · for everyone'}
          {c.maxWinners !== null
            ? ` · up to ${c.maxWinners} winners`
            : ' · no limit on winners'}
        </p>
        <p className="text-[11px] text-text-muted">
          Made by {c.createdBy}
          {c.publishedBy
            ? ` · published by ${c.publishedBy} ${when(c.publishedAt)}`
            : ''}
          {c.endedBy ? ` · ended by ${c.endedBy} ${when(c.endedAt)}` : ''}
        </p>
        {c.overBudget && (
          <p role="alert" className="text-[12px] text-error">
            If every winner is paid, the vouchers (
            {formatRupees(String(c.worstCaseVoucherCost ?? 0))}) are more than
            the whole monthly rewards budget.
          </p>
        )}
      </ScCard>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Taking part" value={String(c.participants)} />
        <StatTile
          label="Winners"
          value={
            c.maxWinners !== null
              ? `${c.winners} / ${c.maxWinners}`
              : String(c.winners)
          }
        />
        <StatTile
          label="Vouchers issued"
          value={formatRupees(c.cost.vouchers)}
          hint="Counted toward the monthly budget"
        />
        <StatTile label="Bonus stamps given" value={String(c.cost.stamps)} />
      </div>

      <ScCard className="flex flex-col gap-3 px-4 py-4">
        <ScInput
          label="Your name"
          autoComplete="name"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          {c.status !== 'finished' && c.status !== 'ended' && (
            <ScButton
              variant="secondary"
              className="min-h-11"
              onClick={() => onEdit(c)}
            >
              Edit
            </ScButton>
          )}
          {c.status === 'draft' && (
            <ScButton
              className="min-h-11"
              disabled={publish.isPending}
              onClick={() => act('publish')}
            >
              {publish.isPending ? 'Publishing…' : 'Publish (schedule)'}
            </ScButton>
          )}
          {running && (
            <ScButton
              variant="secondary"
              className="min-h-11"
              disabled={end.isPending}
              onClick={() => act('end')}
            >
              {end.isPending ? 'Ending…' : 'End now'}
            </ScButton>
          )}
          <ScButton
            variant="secondary"
            className="min-h-11"
            disabled={downloading}
            onClick={() => void download()}
          >
            {downloading ? 'Preparing…' : 'Download results (CSV)'}
          </ScButton>
        </div>
        <p className="text-[11px] text-text-muted">
          Publishing schedules it: customers see it from its start date and hear
          once when it starts. Ending it stops counting bookings that start
          after now; winners keep their prizes.
        </p>
      </ScCard>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text-primary">Taking part</h3>
        {results.length === 0 ? (
          <p className="text-[12px] text-text-secondary">Nobody yet.</p>
        ) : (
          <ScCard className="overflow-x-auto px-0 py-1">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead>
                <tr className="text-text-secondary">
                  <th className="px-3.5 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 text-right font-medium">Counted</th>
                  <th className="px-3 py-2 font-medium">Won</th>
                  <th className="px-3 py-2 font-medium">Prize</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r) => (
                  <tr key={r.userId}>
                    <td className="px-3.5 py-2">
                      <span className="text-text-primary">{r.name}</span>{' '}
                      <span className="font-numeric text-text-muted">
                        {r.phone}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-numeric">
                      {r.counted} / {c.goalCount}
                    </td>
                    <td className="px-3 py-2">
                      {r.wonAt ? when(r.wonAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      {r.voucherAmount
                        ? `${formatRupees(r.voucherAmount)}${r.voucherUsed ? ' (used)' : ''}`
                        : r.bonusStamps
                          ? `${r.bonusStamps} stamps`
                          : r.wonAt
                            ? 'Badge'
                            : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScCard>
        )}
        {results.length === 200 && (
          <p className="text-[11px] text-text-muted">
            The first 200 shown; the CSV has everyone.
          </p>
        )}
      </section>
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
}) {
  return (
    <ScInput
      label={label}
      inputMode="numeric"
      placeholder={placeholder}
      value={value === null ? '' : String(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
        onChange(digits === '' ? null : Number(digits))
      }}
      className="min-h-10 font-numeric"
    />
  )
}

function ChallengeForm({
  existing,
  onDone,
}: {
  existing?: AdminChallenge
  onDone: (id?: string) => void
}) {
  const create = useCreateChallenge()
  const update = useUpdateChallenge(existing?.id ?? '')
  // The level names in force (the team can rename levels); the defaults until loaded.
  const levels = (
    useAdminRewardsSettings(true).data?.settings ?? DEFAULT_REWARDS_SETTINGS
  ).levels
  const [values, setValues] = useState<ChallengeFormValues>(() =>
    existing ? challengeFormValues(existing) : emptyChallenge()
  )
  const [name, setName] = useState(rememberedName)
  const set = (patch: Partial<ChallengeFormValues>) =>
    setValues({ ...values, ...patch })
  const problems = challengeFormProblems(values)
  const started = existing ? existing.status === 'live' : false
  const pending = create.isPending || update.isPending

  const submit = () => {
    if (problems.length > 0 || name.trim().length < 2) return
    rememberName(name.trim())
    const payload = { ...challengePayload(values), actorName: name.trim() }
    const handlers = {
      onSuccess: (data: { challenge: AdminChallenge }) => {
        toast.success(existing ? 'Saved' : 'Saved as a draft')
        onDone(data.challenge.id)
      },
      onError: (err: unknown) =>
        toast.error(errorMessage(err, "Couldn't save the challenge")),
    }
    if (existing) update.mutate(payload, handlers)
    else create.mutate(payload, handlers)
  }

  const worst =
    values.rewardKind === 'voucher' &&
    values.rewardAmount !== null &&
    values.maxWinners !== null
      ? values.rewardAmount * values.maxWinners
      : null

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => onDone(existing?.id)}
        className="self-start text-[12px] text-text-secondary underline underline-offset-4"
      >
        Cancel
      </button>
      <ScCard className="flex flex-col gap-3 px-4 py-4">
        <h2 className="text-sm font-semibold text-text-primary">
          {existing ? `Edit ${existing.title}` : 'New challenge'}
        </h2>
        {started && (
          <p className="text-[12px] text-text-secondary">
            It has started: only the title, the description and a higher winners
            limit can change.
          </p>
        )}
        <ScInput
          label="Title (customers see it)"
          maxLength={60}
          value={values.title}
          onChange={(e) => set({ title: e.target.value })}
        />
        <ScTextarea
          label="Description (optional)"
          maxLength={200}
          rows={2}
          value={values.description ?? ''}
          onChange={(e) => set({ description: e.target.value || null })}
        />
        <div className="grid grid-cols-2 gap-3">
          <ScInput
            label="Starts (IST)"
            type="date"
            disabled={started}
            value={values.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
          />
          <ScInput
            label="Ends (IST, included)"
            type="date"
            disabled={started}
            value={values.endDate}
            onChange={(e) => set({ endDate: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberInput
            label="Goal: completed bookings"
            value={values.goalCount}
            onChange={(v) => !started && set({ goalCount: v ?? 0 })}
          />
          <ScSelect
            label="Only this service"
            disabled={started}
            value={values.category ?? ''}
            onChange={(e) =>
              set({
                category: (e.target.value ||
                  null) as ChallengeFormValues['category'],
              })
            }
          >
            <option value="">Any service</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </ScSelect>
          <ScSelect
            label="Only this booking type"
            disabled={started}
            value={values.bookingType ?? ''}
            onChange={(e) =>
              set({
                bookingType: (e.target.value ||
                  null) as ChallengeFormValues['bookingType'],
              })
            }
          >
            <option value="">Any type</option>
            <option value="dropin">At the garage</option>
            <option value="doorstep">Doorstep</option>
            <option value="pickup">Pickup &amp; drop</option>
          </ScSelect>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ScSelect
            label="Reward"
            disabled={started}
            value={values.rewardKind}
            onChange={(e) => {
              const kind = e.target.value as ChallengeFormValues['rewardKind']
              set({
                rewardKind: kind,
                rewardStamps:
                  kind === 'stamps'
                    ? (values.rewardStamps ?? 2)
                    : values.rewardStamps,
                rewardAmount:
                  kind === 'voucher'
                    ? (values.rewardAmount ?? 100)
                    : values.rewardAmount,
                rewardMultiplier:
                  kind === 'multiplier'
                    ? (values.rewardMultiplier ?? 2)
                    : values.rewardMultiplier,
                rewardCards:
                  kind === 'garage_cards'
                    ? (values.rewardCards ?? 3)
                    : values.rewardCards,
              })
            }}
          >
            <option value="multiplier">
              Double (or triple) stamps on the challenge&apos;s bookings
            </option>
            <option value="stamps">Bonus stamps</option>
            <option value="voucher">A ₹ voucher</option>
            <option value="badge">A badge</option>
            <option value="garage_cards">Detlio Garage cards</option>
          </ScSelect>
          {values.rewardKind === 'stamps' && (
            <NumberInput
              label="Bonus stamps (1–10)"
              value={values.rewardStamps}
              onChange={(v) => !started && set({ rewardStamps: v })}
            />
          )}
          {values.rewardKind === 'voucher' && (
            <NumberInput
              label="Voucher (₹1–₹2,000)"
              value={values.rewardAmount}
              onChange={(v) => !started && set({ rewardAmount: v })}
            />
          )}
          {values.rewardKind === 'garage_cards' && (
            <NumberInput
              label="Garage cards (1–5)"
              value={values.rewardCards}
              onChange={(v) => !started && set({ rewardCards: v })}
            />
          )}
          {values.rewardKind === 'multiplier' && (
            <ScSelect
              label="Stamps"
              disabled={started}
              value={String(values.rewardMultiplier ?? 2)}
              onChange={(e) =>
                set({ rewardMultiplier: Number(e.target.value) })
              }
            >
              <option value="2">Double</option>
              <option value="3">Triple</option>
            </ScSelect>
          )}
          <ScSelect
            label="Who"
            disabled={started}
            value={values.audienceMinLevel ?? ''}
            onChange={(e) =>
              set({
                audienceMinLevel: (e.target.value ||
                  null) as ChallengeFormValues['audienceMinLevel'],
              })
            }
          >
            <option value="">Everyone</option>
            {LEVELS.slice(1).map((level) => (
              <option key={level} value={level}>
                {levels.find((l) => l.key === level)?.label ?? level} and up
              </option>
            ))}
          </ScSelect>
        </div>
        <NumberInput
          label="Most winners (empty = no limit)"
          placeholder="No limit"
          value={values.maxWinners}
          onChange={(v) => set({ maxWinners: v })}
        />
        {worst !== null && (
          <p className="text-[12px] text-text-secondary">
            Worst case:{' '}
            <span className="font-numeric">{formatRupees(String(worst))}</span>{' '}
            in vouchers, counted toward the monthly rewards budget.
          </p>
        )}
        {problems.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-[12px] text-error">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <ScInput
          label="Your name"
          autoComplete="name"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <ScButton
          className="min-h-11"
          disabled={problems.length > 0 || name.trim().length < 2 || pending}
          onClick={submit}
        >
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Save as a draft'}
        </ScButton>
      </ScCard>
    </div>
  )
}
