'use client'

import { useEffect, useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import { toast } from 'react-toastify'
import { addOnTimeLabel } from '@repo/core/add-ons'
import { garageAddOnsApi, type AddOn } from '@repo/core/api/add-ons'
import { formatServicePrice } from '@repo/core/pricing'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScCard } from '@repo/ui/sc/card'
import { Figures } from '@repo/ui/sc/figures'
import { SectionHeader } from '@repo/ui/sc/section-header'
import { Reveal } from '@repo/ui/sc/reveal'
import { AddOnSheet } from './add-on-sheet'
import { RowAction } from './catalogue-row'

/**
 * Add-ons under Services (frame A): small extras that go with any service.
 * Rows are the real service card without its photo editor. Their own list and
 * routes, so the Services list above keeps meaning services.
 */
export function AddOnsSection({
  addRequest,
}: {
  /** Bumped by the "Add add-on" beside the form's heading, to open the sheet. */
  addRequest: number
}) {
  const [addOns, setAddOns] = useState<AddOn[] | null>(null)
  // null: closed. 'new': adding. An add-on: editing it.
  const [sheet, setSheet] = useState<'new' | AddOn | null>(null)
  const [deleting, setDeleting] = useState<AddOn | null>(null)

  useEffect(() => {
    garageAddOnsApi
      .list()
      .then(setAddOns)
      .catch(() => {
        setAddOns([])
        toast.error('Failed to load add-ons')
      })
  }, [])

  // Adjusted during render, so the sheet opens with the tap that asked for it.
  const [seenRequest, setSeenRequest] = useState(addRequest)
  if (seenRequest !== addRequest) {
    setSeenRequest(addRequest)
    setSheet('new')
  }

  const list = addOns ?? []

  const setActive = async (addOn: AddOn, isActive: boolean) => {
    try {
      const updated = await garageAddOnsApi.update(addOn.id, { isActive })
      setAddOns((current) =>
        (current ?? []).map((a) => (a.id === addOn.id ? updated : a))
      )
      toast.success('Saved successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <section className="flex flex-col gap-3" data-add-ons-section="">
      <SectionHeader
        title="Add-ons"
        action={
          list.length > 0 ? (
            <span className="font-numeric text-[12px] text-text-muted">
              {list.length}
            </span>
          ) : undefined
        }
      />
      <p className="text-[13px] text-text-secondary">
        Small extras that go with any of your services. Customers can&apos;t
        book them alone.
      </p>
      <button
        type="button"
        onClick={() => setSheet('new')}
        className="press flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-white/20 px-4 text-[14px] font-medium text-text-primary transition-colors hover:bg-surface-elevated"
      >
        <IconPlus size={16} aria-hidden="true" />
        Add add-on
      </button>
      <div className="flex flex-col gap-2">
        {list.map((addOn, i) => (
          <Reveal key={addOn.id} index={i}>
            <ScCard className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-text-primary">
                    {addOn.name}
                  </p>
                  <p className="mt-0.5 text-[12px] text-text-secondary">
                    <Figures text={formatServicePrice(addOn)} /> ·{' '}
                    <Figures text={addOnTimeLabel(addOn.extraMins)} />
                  </p>
                </div>
                <ScBadge
                  variant={addOn.isActive ? 'success' : 'muted'}
                  className="shrink-0"
                >
                  {addOn.isActive ? 'Active' : 'Inactive'}
                </ScBadge>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <RowAction onClick={() => setSheet(addOn)}>Edit</RowAction>
                <RowAction
                  onClick={() => void setActive(addOn, !addOn.isActive)}
                >
                  {addOn.isActive ? 'Disable' : 'Enable'}
                </RowAction>
                <RowAction onClick={() => setDeleting(addOn)}>Delete</RowAction>
              </div>
            </ScCard>
          </Reveal>
        ))}
      </div>

      <AddOnSheet
        open={sheet !== null}
        addOn={sheet !== null && sheet !== 'new' ? sheet : null}
        onClose={() => setSheet(null)}
        onSaved={(saved) => {
          setAddOns((current) => {
            const rows = current ?? []
            return rows.some((a) => a.id === saved.id)
              ? rows.map((a) => (a.id === saved.id ? saved : a))
              : [...rows, saved]
          })
          setSheet(null)
          toast.success('Saved successfully')
        }}
      />

      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        level="firm"
        title={deleting ? `Delete ${deleting.name}?` : 'Delete this add-on?'}
        body="Customers can't add it any more, and it can't be undone. Past bookings keep it. To stop it for a while, Disable it instead."
        confirmLabel="Delete add-on"
        onConfirm={async () => {
          if (!deleting) return
          try {
            await garageAddOnsApi.remove(deleting.id)
            setAddOns((current) =>
              (current ?? []).filter((a) => a.id !== deleting.id)
            )
            toast.success('Saved successfully')
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : 'Something went wrong'
            )
          }
          setDeleting(null)
        }}
      />
    </section>
  )
}
