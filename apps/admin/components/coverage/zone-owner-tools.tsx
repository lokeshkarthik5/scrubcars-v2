'use client'

import { useState } from 'react'
import { toast } from 'react-toastify'
import { ScButton } from '@repo/ui/sc/button'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import type { CoverageZone } from '@repo/core/api/admin-coverage'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useOwnerDeleteZone,
  useOwnerRemoveZoneSignup,
  useZoneSignups,
  useZoneUse,
} from '@repo/core/api/hooks/use-admin-owner-delete'
import {
  OwnerDeleteButton,
  useCanDeleteAnything,
} from '@/components/owner-delete'
import { formatWhen } from '@/lib/bookings'

/**
 * The owner's tools at the foot of a zone's drawer (10 Nov 2026): the
 * zone's free-wash list, each customer with Remove, and Delete zone even
 * when it is in use. Anyone else removes only a zone nothing points at
 * (Edit zones). Shown only to the owner.
 */
export function ZoneOwnerTools({
  zone,
  onDeleted,
}: {
  zone: CoverageZone
  onDeleted: () => void
}) {
  const canDelete = useCanDeleteAnything()
  const [showList, setShowList] = useState(false)
  if (!canDelete) return null
  return (
    <section
      aria-label={`Owner tools for ${zone.name}`}
      className="flex flex-col gap-2 border-t border-border px-4 pt-3"
    >
      <p className="text-[12px] text-text-secondary">
        Only the owner sees these.
      </p>
      <div className="flex flex-wrap gap-2">
        <ScButton
          type="button"
          variant="outline"
          fullWidth={false}
          aria-expanded={showList}
          onClick={() => setShowList((open) => !open)}
          className="px-4 text-[13px]"
        >
          {showList ? 'Hide sign-ups' : 'Sign-ups'}
        </ScButton>
        <DeleteZoneAnyway zone={zone} onDeleted={onDeleted} />
      </div>
      {showList && <ZoneSignupList zone={zone} />}
    </section>
  )
}

/** The zone's free-wash list: name and the last four digits only, with Remove. */
function ZoneSignupList({ zone }: { zone: CoverageZone }) {
  const list = useZoneSignups(zone.id, true)
  const remove = useOwnerRemoveZoneSignup(zone.id)
  if (list.isPending)
    return <p className="text-[12px] text-text-secondary">Loading sign-ups…</p>
  if (list.error) {
    return (
      <p role="alert" className="text-[12px] text-error">
        {errorMessage(list.error, "Couldn't load the sign-ups")}
      </p>
    )
  }
  const signups = list.data.signups
  if (signups.length === 0)
    return (
      <p className="text-[12px] text-text-secondary">
        Nobody has signed up here.
      </p>
    )
  return (
    <ul
      aria-label={`Sign-ups in ${zone.name}`}
      className="flex flex-col divide-y divide-border"
    >
      {signups.map((signup) => (
        <li
          key={signup.userId}
          className="flex items-center justify-between gap-2 py-2"
        >
          <div className="min-w-0 text-[12.5px]">
            <p className="truncate text-text-primary">
              <span className="font-numeric text-text-muted">
                #{signup.position}
              </span>{' '}
              {signup.name}{' '}
              {signup.phone && (
                <span className="font-numeric text-text-secondary">
                  {signup.phone}
                </span>
              )}
            </p>
            <p className="text-[12px] text-text-secondary">
              Joined{' '}
              <span className="font-numeric">
                {formatWhen(signup.createdAt)}
              </span>
              {signup.freeWash ? ' · holds a free wash' : ''}
            </p>
          </div>
          <OwnerDeleteButton
            label="Remove…"
            title={`Remove ${signup.name} from ${zone.name}?`}
            confirmLabel="Remove sign-up"
            done={`${signup.name} removed from ${zone.name}`}
            className="min-h-11 shrink-0 px-3 text-[12px]"
            body={
              <p>
                They leave the list and stop hearing about {zone.name}
                {signup.freeWash
                  ? ', and the free wash their place held goes with it'
                  : ''}
                . They can sign up again.
              </p>
            }
            onDelete={() => remove.mutateAsync(signup.userId)}
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * Delete zone, in use or not: the sheet says what goes with it (the API's
 * own count and words), and the zone's name is typed to confirm.
 */
function DeleteZoneAnyway({
  zone,
  onDeleted,
}: {
  zone: CoverageZone
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const use = useZoneUse(zone.id, open)
  const remove = useOwnerDeleteZone()
  const lines = use.data?.lines ?? []

  return (
    <>
      <ScButton
        type="button"
        variant="danger-outline"
        fullWidth={false}
        onClick={() => {
          setError('')
          setOpen(true)
        }}
        className="px-4 text-[13px]"
      >
        Delete zone…
      </ScButton>
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          setError('')
          try {
            await remove.mutateAsync({ id: zone.id, confirmText: zone.name })
            setOpen(false)
            toast.success(`${zone.name} deleted`)
            onDeleted()
          } catch (err) {
            setError(
              errorMessage(
                err,
                "Couldn't delete the zone. Nothing was deleted."
              )
            )
          }
        }}
        busy={remove.isPending}
        error={
          error ||
          (use.error
            ? errorMessage(use.error, "Couldn't check the zone")
            : '') ||
          undefined
        }
        level="typed"
        typeToConfirm={zone.name}
        title={`Delete ${zone.name}?`}
        confirmLabel="Delete zone"
        body={
          <div className="flex flex-col gap-2">
            <p>Customers stop seeing it.</p>
            {use.isPending ? (
              <p>Checking what is in it…</p>
            ) : lines.length > 0 ? (
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>Nothing points at it.</p>
            )}
            <p>This can&apos;t be undone.</p>
          </div>
        }
      />
    </>
  )
}
