'use client'

import { useId, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import {
  IconBrandWhatsapp,
  IconMapPin,
  IconPhone,
  IconSend,
  IconX,
} from '@tabler/icons-react'
import type { AdminLogin, AdminVendor } from '@repo/core/api/admin'
import type {
  CollectionList,
  CreateCollectionListsInput,
} from '@repo/core/api/admin-collection'
import {
  useCollectionLists,
  useCreateCollectionLists,
} from '@repo/core/api/hooks/use-admin-collection'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAdminLogins } from '@repo/core/api/hooks/use-admin-logins'
import { telHref, whatsAppHref } from '@repo/core/contact-links'
import {
  COLLECTION_LIMITS,
  MISSING_ASKS,
  MISSING_LABELS,
  type MissingKey,
} from '@repo/core/onboarding-marks'
import { cn } from '@repo/core/utils'
import { ScButton } from '@repo/ui/sc/button'
import { ScInput, ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { ScSwitch } from '@repo/ui/sc/switch'
import { MarksOverlay } from '@/components/marks/mark-popover'
import { garageAreaName } from '@/lib/localities'
import {
  collectKinds,
  collectorLogins,
  displayPhone,
  dueDate,
  groupByOnboarder,
  istToday,
  listText,
  openGaragesByLogin,
  plural,
  sendButtonLabel,
  sendSubtitle,
  sendSummary,
  vendorMapsUrl,
  type CollectorGroup,
} from '@/lib/collection'

/** The radio value for a name typed by hand (no login, so no Today inbox). */
const OTHER = 'other'
/** The one group of "One person for all". */
const ALL = 'all'
/** Matches collection_lists.assignee_name. */
const NAME_MAX = 100

interface GroupChoice {
  /** A login's id, OTHER, or '' for nobody yet. */
  pick: string
  otherName: string
  /** YYYY-MM-DD or ''. */
  dueOn: string
  note: string
  whatsapp: boolean
}

interface Collector {
  loginId: string | null
  name: string
  login: AdminLogin | null
}

interface Draft {
  group: CollectorGroup<AdminVendor>
  choice: GroupChoice
  collector: Collector | null
  garages: Array<{ vendor: AdminVendor; kinds: MissingKey[] }>
  problem: string | null
}

export interface SendToTeamSheetProps {
  open: boolean
  onClose: () => void
  /** The ticked garages. */
  vendors: AdminVendor[]
  /** After the lists are made (the caller may clear its selection). */
  onSent?: () => void
}

const SECTION_LABEL = 'text-[12px] font-medium text-text-secondary'
const SMALL_LINK =
  'relative z-10 inline-flex min-h-8 items-center gap-1 text-[12px] text-text-primary underline-offset-2 hover:underline'

/**
 * "Send to team" (mockup 07, panel 2): everything the ticked garages miss,
 * as one list per teammate. Each garage's onboarder is suggested as its
 * collector when that name is a login; the garages are grouped by collector,
 * and each group can go to someone else, or all to one person. A due date
 * and note are optional. It goes to the person's Today inbox (logins only),
 * the "Detlio" Telegram group (on by default), and, for a login with a
 * phone, WhatsApp by a link with the list filled in.
 *
 * A panel down the right side on a laptop, as Ask on WhatsApp is; a bottom
 * sheet on a phone. "One person for all" and the Send to switches come
 * first, so they are in view without scrolling.
 *
 * Mount it fresh for each opening (key it), so it starts from the
 * suggestions.
 */
export function SendToTeamSheet({
  open,
  onClose,
  vendors,
  onSent,
}: SendToTeamSheetProps) {
  const loginsQuery = useAdminLogins()
  const create = useCreateCollectionLists()
  const logins = useMemo(
    () => collectorLogins(loginsQuery.data?.logins),
    [loginsQuery.data]
  )
  const youId = loginsQuery.data?.youId ?? null
  // "has 2 garages" by each person: what their open lists already hold.
  const openLists = useCollectionLists('all')
  const busyWith = useMemo(
    () => openGaragesByLogin(openLists.data?.lists ?? []),
    [openLists.data]
  )
  const suggestions = useMemo(
    () => groupByOnboarder(vendors, logins),
    [vendors, logins]
  )

  const [onePerson, setOnePerson] = useState(false)
  const [choices, setChoices] = useState<Record<string, Partial<GroupChoice>>>(
    {}
  )
  const [dropped, setDropped] = useState<Record<string, MissingKey[]>>({})
  const [telegram, setTelegram] = useState(true)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<{
    whatsapp: Array<{ list: CollectionList; phone: string }>
    telegramMissed: boolean
  } | null>(null)

  const single = onePerson || suggestions.length <= 1
  const groups: CollectorGroup<AdminVendor>[] = single
    ? [
        {
          key: ALL,
          loginId: suggestions.find((g) => g.loginId)?.loginId ?? null,
          vendors,
        },
      ]
    : suggestions

  const choiceOf = (group: CollectorGroup<AdminVendor>): GroupChoice => ({
    pick: group.loginId ?? '',
    otherName: '',
    dueOn: '',
    note: '',
    whatsapp: false,
    ...choices[group.key],
  })
  const setChoice = (key: string, patch: Partial<GroupChoice>) =>
    setChoices((all) => ({ ...all, [key]: { ...all[key], ...patch } }))

  const kindsOf = (vendor: AdminVendor) =>
    collectKinds(vendor).filter((k) => !dropped[vendor.id]?.includes(k))
  const toggleKind = (vendorId: string, kind: MissingKey, on: boolean) =>
    setDropped((all) => {
      const now = all[vendorId] ?? []
      return {
        ...all,
        [vendorId]: on ? now.filter((k) => k !== kind) : [...now, kind],
      }
    })

  const resolve = (choice: GroupChoice): Collector | null => {
    if (choice.pick === OTHER) {
      const name = choice.otherName.trim().replace(/\s+/g, ' ')
      return name ? { loginId: null, name, login: null } : null
    }
    const login = logins.find((l) => l.id === choice.pick)
    return login ? { loginId: login.id, name: login.name, login } : null
  }

  const drafts: Draft[] = groups.map((group) => {
    const choice = choiceOf(group)
    const collector = resolve(choice)
    const garages = group.vendors.map((vendor) => ({
      vendor,
      kinds: kindsOf(vendor),
    }))
    const count = garages.filter((g) => g.kinds.length > 0).length
    let problem: string | null = null
    if (!collector) {
      problem =
        choice.pick === OTHER ? 'Type who collects' : 'Pick who collects'
    } else if (collector.name.length > NAME_MAX) {
      problem = `Their name can be at most ${NAME_MAX} characters`
    } else if (count > COLLECTION_LIMITS.garagesPerList) {
      problem = `At most ${COLLECTION_LIMITS.garagesPerList} garages on one list`
    } else if (choice.note.length > COLLECTION_LIMITS.noteMax) {
      problem = `The note can be at most ${COLLECTION_LIMITS.noteMax} characters`
    }
    return { group, choice, collector, garages, problem }
  })

  const toSend = drafts.filter((d) => d.garages.some((g) => g.kinds.length > 0))
  const summary = sendSummary(drafts.flatMap((d) => d.garages))
  const problem =
    summary.things === 0
      ? 'Nothing to collect: tick at least one thing'
      : (toSend.find((d) => d.problem)?.problem ?? null)
  const label = sendButtonLabel(toSend.map((d) => d.collector?.name ?? ''))

  const submit = () => {
    setTried(true)
    if (problem || create.isPending) return
    setError('')
    const input: CreateCollectionListsInput = {
      sendTelegram: telegram,
      lists: toSend.map((d) => ({
        assigneeLoginId: d.collector!.loginId,
        assigneeName: d.collector!.name,
        dueOn: d.choice.dueOn || null,
        note: d.choice.note.trim() || null,
        garages: d.garages
          .filter((g) => g.kinds.length > 0)
          .map((g) => ({ vendorId: g.vendor.id, kinds: g.kinds })),
      })),
    }
    create.mutate(input, {
      onSuccess: ({ lists }) => {
        const telegramMissed =
          telegram && lists.some((list) => !list.telegramSentAt)
        toast.success(
          lists.length === 1
            ? `Sent to ${lists[0]!.assigneeName}`
            : `Sent ${lists.length} lists`
        )
        if (telegramMissed) {
          toast.warning(
            'Not posted to Telegram. The lists are in their Today inbox.'
          )
        }
        onSent?.()
        const whatsapp = lists.flatMap((list, index) => {
          const draft = toSend[index]
          const phone = draft?.choice.whatsapp
            ? draft.collector?.login?.phone
            : null
          return phone ? [{ list, phone }] : []
        })
        if (whatsapp.length > 0) setSent({ whatsapp, telegramMissed })
        else onClose()
      },
      onError: (err) => setError(errorMessage(err, 'Couldn’t send the lists')),
    })
  }

  const firstDraft = toSend[0]
  const footerLine =
    toSend.length === 1 && firstDraft?.collector
      ? [
          telegram ? 'To the “Detlio” group' : null,
          firstDraft.collector.login
            ? `${firstDraft.collector.name}’s Today inbox`
            : null,
        ]
          .filter(Boolean)
          .join(' and ') +
        (firstDraft.choice.dueOn
          ? ` · due ${dueDate(firstDraft.choice.dueOn)}`
          : '')
      : toSend.length > 1
        ? `${plural(toSend.length, 'list')}${telegram ? ', to the “Detlio” group and' : ', to'} each person’s Today inbox`
        : ''

  // Who gets a Today inbox copy: every picked collector with a login.
  const inboxNames = toSend.flatMap((d) =>
    d.collector?.login ? [d.collector.name] : []
  )

  return (
    // Out of the bulk bar (fixed, so its own stack on a phone, under the
    // tab bar), at the end of <body>.
    <MarksOverlay>
      <ScSheet
        open={open}
        onClose={onClose}
        dismissible={!create.isPending}
        aria-label="Send to team"
        showHandle={false}
        className={cn(
          // A phone: a bottom sheet. A laptop: a panel down the right side,
          // as Ask on WhatsApp is, the table still in view beside it.
          'flex max-w-[640px] flex-col overflow-hidden pb-0',
          'md:ml-auto md:h-dvh md:max-h-none md:w-[min(900px,100vw)] md:max-w-none md:self-stretch md:rounded-bl-[22px] md:rounded-tr-none md:border-l md:border-t-0',
          'md:[&.sheet-in]:animate-[motion-fade-in_var(--motion-base)_ease-out_both]'
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 md:px-5">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-text-primary">
              Send to team · {plural(vendors.length, 'garage')}
            </h2>
            <p className="text-[13px] text-text-secondary">
              {sendSubtitle(
                (toSend.length > 0 ? toSend : drafts).map((d) => ({
                  name: d.collector?.name ?? null,
                }))
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={create.isPending}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
          >
            <IconX size={18} aria-hidden="true" />
          </button>
        </header>

        {sent ? (
          <SentStep sent={sent} onDone={onClose} />
        ) : (
          <>
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto overscroll-contain md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] md:overflow-hidden">
              <div className="flex flex-col gap-4 border-border px-4 py-4 md:overflow-y-auto md:border-r md:px-5">
                {/* First, so they are in view without scrolling: one person
                  or a list per onboarder (the default), and where it goes. */}
                {suggestions.length > 1 && (
                  <div
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-[12px] border px-3.5 py-2.5 transition-colors',
                      onePerson
                        ? 'border-text-secondary bg-surface-elevated'
                        : 'border-border bg-surface'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-text-primary">
                        One person for all
                      </p>
                      <p className="text-[12px] text-text-secondary">
                        {onePerson
                          ? 'One list with every garage'
                          : `Now ${plural(suggestions.length, 'list')}, by who onboarded each garage`}
                      </p>
                    </div>
                    <ScSwitch
                      label="One person for all"
                      checked={onePerson}
                      onChange={setOnePerson}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <p className={SECTION_LABEL}>Send to</p>
                  <div className="divide-y divide-border rounded-[10px] border border-border">
                    <div className="flex items-center justify-between gap-3 px-3 py-1">
                      <div className="min-w-0">
                        <p className="text-[13px] text-text-primary">
                          Telegram group “Detlio”
                        </p>
                        <p className="text-[12px] text-text-secondary">
                          Posted by the alerts bot
                        </p>
                      </div>
                      <ScSwitch
                        label="Telegram group “Detlio”"
                        checked={telegram}
                        onChange={setTelegram}
                      />
                    </div>
                    {inboxNames.length > 0 && (
                      <div className="flex items-center justify-between gap-3 px-3 py-1">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] text-text-primary">
                            {inboxNames.length === 1
                              ? `${inboxNames[0]}’s Today inbox`
                              : 'Each person’s Today inbox'}
                          </p>
                          <p className="text-[12px] text-text-secondary">
                            In admin, with tick boxes. Always on.
                          </p>
                        </div>
                        <ScSwitch
                          label={
                            inboxNames.length === 1
                              ? `${inboxNames[0]}’s Today inbox`
                              : 'Each person’s Today inbox'
                          }
                          checked
                          disabled
                          onChange={() => {}}
                        />
                      </div>
                    )}
                  </div>
                </div>
                {loginsQuery.isError && (
                  <p className="text-[12px] text-warning">
                    Couldn’t load the team logins. You can still type a name.
                  </p>
                )}
                {drafts.map((draft) => (
                  <GroupFields
                    key={draft.group.key}
                    draft={draft}
                    many={drafts.length > 1}
                    logins={logins}
                    youId={youId}
                    busyWith={busyWith}
                    showProblem={tried}
                    onChange={(patch) => setChoice(draft.group.key, patch)}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-3 px-4 py-4 md:overflow-y-auto md:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-text-primary">
                    Collection list
                  </h3>
                  <p className="text-[12px] text-text-secondary">
                    {summary.line}
                  </p>
                </div>
                {drafts.map((draft) => (
                  <div key={draft.group.key} className="flex flex-col gap-2">
                    {drafts.length > 1 && (
                      <p className={SECTION_LABEL}>
                        {draft.collector
                          ? `${draft.collector.name}’s list`
                          : 'Nobody picked yet'}
                      </p>
                    )}
                    {draft.garages.map(({ vendor, kinds }) => (
                      <GaragePreview
                        key={vendor.id}
                        vendor={vendor}
                        kinds={kinds}
                        onToggle={(kind, on) => toggleKind(vendor.id, kind, on)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <footer className="flex shrink-0 flex-col gap-2 border-t border-border bg-brand-black px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:flex-row md:items-center md:justify-between md:px-5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-text-primary">
                  {summary.line}
                </p>
                {footerLine && (
                  <p className="text-[12px] text-text-secondary">
                    {footerLine}
                  </p>
                )}
                {tried && problem && (
                  <p role="alert" className="text-[12px] text-error">
                    {problem}
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-[12px] text-error">
                    {error}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <ScButton
                  type="button"
                  variant="outline"
                  fullWidth={false}
                  className="h-10 px-4 text-[13px]"
                  onClick={onClose}
                  disabled={create.isPending}
                >
                  Cancel
                </ScButton>
                <ScButton
                  type="button"
                  variant="main"
                  fullWidth={false}
                  className="h-10 px-4 text-[13px]"
                  onClick={submit}
                  disabled={create.isPending || summary.things === 0}
                  aria-busy={create.isPending || undefined}
                >
                  <IconSend size={15} aria-hidden="true" />
                  {create.isPending ? 'Sending…' : label}
                </ScButton>
              </div>
            </footer>
          </>
        )}
      </ScSheet>
    </MarksOverlay>
  )
}

function GroupFields({
  draft,
  many,
  logins,
  youId,
  busyWith,
  showProblem,
  onChange,
}: {
  draft: Draft
  many: boolean
  logins: AdminLogin[]
  youId: string | null
  /** Garages each login already has on open lists. */
  busyWith: ReadonlyMap<string, number>
  showProblem: boolean
  onChange: (patch: Partial<GroupChoice>) => void
}) {
  const id = useId()
  const { choice, collector, group } = draft
  const names = group.vendors.map((v) => v.businessName).join(', ')
  return (
    <section
      aria-label={many ? `Who collects for ${names}` : 'Who collects'}
      className={cn(
        'flex flex-col gap-3',
        many && 'rounded-[12px] border border-border p-3'
      )}
    >
      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend className={cn(SECTION_LABEL, 'mb-1.5')}>
          {many ? (
            <>
              Who collects for{' '}
              <span className="text-text-primary">{names}</span>
            </>
          ) : (
            'Who collects'
          )}
        </legend>
        {logins.map((login) => (
          <CollectorOption
            key={login.id}
            name={`${id}-who`}
            value={login.id}
            checked={choice.pick === login.id}
            onPick={() => onChange({ pick: login.id })}
            title={login.name}
            sub={[
              `@${login.username}`,
              login.isOwner ? 'owner' : null,
              login.id === youId ? 'you' : null,
              busyWith.get(login.id)
                ? `has ${plural(busyWith.get(login.id)!, 'garage')}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
        <CollectorOption
          name={`${id}-who`}
          value={OTHER}
          checked={choice.pick === OTHER}
          onPick={() => onChange({ pick: OTHER })}
          title="Someone else…"
          sub="A name with no login: no Today inbox"
        />
        {choice.pick === OTHER && (
          <ScInput
            label="Their name"
            value={choice.otherName}
            maxLength={NAME_MAX}
            autoComplete="off"
            onChange={(e) => onChange({ otherName: e.target.value })}
            className="min-h-11"
          />
        )}
        {showProblem && draft.problem && (
          <p className="text-[12px] text-error">{draft.problem}</p>
        )}
      </fieldset>

      <ScInput
        label="Due (optional)"
        type="date"
        value={choice.dueOn}
        min={istToday()}
        onChange={(e) => onChange({ dueOn: e.target.value })}
        className="min-h-11"
      />
      <ScTextarea
        label="Note (optional)"
        value={choice.note}
        maxLength={COLLECTION_LIMITS.noteMax}
        rows={2}
        placeholder="Visit the Adyar ones together"
        onChange={(e) => onChange({ note: e.target.value })}
      />

      {collector?.login ? (
        <div className="flex flex-col gap-1">
          {collector.login.phone && (
            <label className="flex min-h-11 cursor-pointer items-start gap-2 px-1 py-2">
              <input
                type="checkbox"
                checked={choice.whatsapp}
                onChange={(e) => onChange({ whatsapp: e.target.checked })}
                className="mt-0.5 size-4 shrink-0 accent-brand-white"
              />
              <span className="flex flex-col">
                <span className="text-[13px] text-text-primary">
                  Also send on WhatsApp to {collector.name}
                </span>
                <span className="text-[12px] text-text-secondary">
                  Opens WhatsApp with the list filled in, after sending
                </span>
              </span>
            </label>
          )}
        </div>
      ) : collector ? (
        <p className="text-[12px] text-text-secondary">
          {collector.name} has no login, so no Today inbox: they get it from the
          Telegram group.
        </p>
      ) : null}
    </section>
  )
}

function CollectorOption({
  name,
  value,
  checked,
  onPick,
  title,
  sub,
}: {
  name: string
  value: string
  checked: boolean
  onPick: () => void
  title: string
  sub: string
}) {
  const subId = useId()
  return (
    <label
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2 transition-colors',
        checked
          ? 'border-text-secondary bg-surface-elevated'
          : 'border-border hover:bg-surface'
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-[12px] font-semibold text-text-primary"
      >
        {title.charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium text-text-primary">
          {title}
        </span>
        <span
          id={subId}
          aria-hidden="true"
          className="truncate text-[12px] text-text-secondary"
        >
          {sub}
        </span>
      </span>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onPick}
        aria-describedby={subId}
        className="size-4 shrink-0 accent-brand-white"
      />
    </label>
  )
}

function GaragePreview({
  vendor,
  kinds,
  onToggle,
}: {
  vendor: AdminVendor
  kinds: MissingKey[]
  onToggle: (kind: MissingKey, on: boolean) => void
}) {
  const all = collectKinds(vendor)
  const ownerName = vendor.owner?.name ?? null
  const phone = vendor.owner?.phone || vendor.phone
  const tel = telHref(phone)
  const map = vendorMapsUrl(vendor)
  // "Adyar", not "Chennai": the neighbourhood its pin is in.
  const area = garageAreaName(vendor)
  return (
    <article
      aria-label={vendor.businessName}
      className="flex flex-col gap-1.5 rounded-[12px] border border-border bg-surface px-3 py-2.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-semibold text-text-primary">
          {vendor.businessName}
          {area && (
            <span className="font-normal text-text-secondary"> · {area}</span>
          )}
        </p>
        <span className="shrink-0 font-numeric text-[12px] text-text-secondary">
          {plural(kinds.length, 'thing')}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 text-[12px] text-text-secondary">
        {ownerName && <span>{ownerName}</span>}
        {tel && (
          <a
            href={tel}
            aria-label={`Call ${ownerName ?? vendor.businessName}, ${phone}`}
            className={cn(SMALL_LINK, 'font-numeric')}
          >
            <IconPhone size={13} aria-hidden="true" />
            {displayPhone(phone)}
          </a>
        )}
        {map && (
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Map of ${vendor.businessName}`}
            className={SMALL_LINK}
          >
            <IconMapPin size={13} aria-hidden="true" />
            Map
          </a>
        )}
      </div>
      {vendor.openCollection && (
        <p className="text-[12px] text-warning">
          Already with {vendor.openCollection.assigneeName} (
          {vendor.openCollection.done}/{vendor.openCollection.total})
        </p>
      )}
      {all.length === 0 ? (
        <p className="text-[12px] text-text-secondary">
          Nothing missing: left off the list.
        </p>
      ) : (
        <ul className="flex flex-col">
          {all.map((kind) => (
            <li key={kind}>
              <label
                className="flex min-h-8 cursor-pointer items-center gap-2 text-[13px] text-text-primary"
                title={MISSING_ASKS[kind]}
              >
                <input
                  type="checkbox"
                  checked={kinds.includes(kind)}
                  onChange={(e) => onToggle(kind, e.target.checked)}
                  className="size-4 shrink-0 accent-brand-white"
                />
                {MISSING_LABELS[kind]}
              </label>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function SentStep({
  sent,
  onDone,
}: {
  sent: {
    whatsapp: Array<{ list: CollectionList; phone: string }>
    telegramMissed: boolean
  }
  onDone: () => void
}) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return (
    <div className="flex flex-col gap-3 px-4 py-5 md:px-5">
      <p role="status" className="text-[15px] font-medium text-text-primary">
        Sent. Now send it on WhatsApp:
      </p>
      {sent.telegramMissed && (
        <p className="text-[13px] text-warning">Not posted to Telegram.</p>
      )}
      <ul className="flex flex-col gap-2">
        {sent.whatsapp.map(({ list, phone }) => {
          const href = whatsAppHref(phone, listText(list, origin))
          return (
            <li key={list.id}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-[14px] font-medium text-text-primary hover:bg-surface"
                >
                  <IconBrandWhatsapp size={17} aria-hidden="true" />
                  Open WhatsApp to {list.assigneeName}
                </a>
              ) : (
                <p className="text-[13px] text-text-secondary">
                  {list.assigneeName}’s phone can’t take WhatsApp.
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <ScButton
        type="button"
        variant="outline"
        fullWidth={false}
        className="h-10 self-start px-5 text-[13px]"
        onClick={onDone}
      >
        Done
      </ScButton>
    </div>
  )
}
