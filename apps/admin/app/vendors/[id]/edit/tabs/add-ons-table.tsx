'use client'

import { useEffect, useState } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { adminAddOnsApi } from '@repo/core/api/add-ons'
import {
  addOnInputFrom,
  addOnRowFrom,
  type AddOnRow as Row,
} from '@/lib/add-on-rows'
import { ApiError } from '@repo/core/api/client'
import { ScSwitch } from '@repo/ui/sc/switch'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'

const GRID =
  'grid grid-cols-3 items-end gap-2 @xl:grid-cols-[minmax(0,1.8fr)_5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_3rem_auto] @xl:items-center'
/** A cell's word on a phone, where the table's headings are hidden. */
const CELL_WORD =
  'mb-1 block text-[11px] font-medium text-text-muted @xl:hidden'
const INPUT =
  'min-h-11 w-full min-w-0 rounded-[10px] border border-border bg-transparent px-2.5 text-[14px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-text-secondary'

/**
 * The garage's add-ons (frame H): its own table under Services, with no
 * category groups, photos or description tool. Saved at once, row by row, on
 * its own routes: never part of Save changes, whose list of services would
 * otherwise have to know about them.
 */
export function AddOnsTable({
  vendorId,
  addRequest,
}: {
  vendorId: string
  addRequest: number
}) {
  const api = adminAddOnsApi(vendorId)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [saved, setSaved] = useState<Record<string, Row>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Row | null>(null)

  useEffect(() => {
    let live = true
    api
      .list()
      .then((addOns) => {
        if (!live) return
        const loaded = addOns.map(addOnRowFrom)
        setRows(loaded)
        setSaved(Object.fromEntries(loaded.map((row) => [row.key, row])))
      })
      .catch(() => {
        if (!live) return
        setRows([])
        setError("Couldn't load add-ons. Reload to try again.")
      })
    return () => {
      live = false
    }
    // `api` is made from vendorId each render; the id says it all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId])

  // Adjusted during render: "Add add-on" beside "Add service" adds a blank row.
  const [seenRequest, setSeenRequest] = useState(addRequest)
  if (seenRequest !== addRequest) {
    setSeenRequest(addRequest)
    setRows((current) => [
      ...(current ?? []),
      {
        key: `new-${addRequest}`,
        id: null,
        name: '',
        extraMins: '',
        hatch: '',
        sedan: '',
        suv: '',
        isActive: true,
      },
    ])
  }

  const list = rows ?? []
  const change = (key: string, patch: Partial<Row>) =>
    setRows((current) =>
      (current ?? []).map((row) =>
        row.key === key ? { ...row, ...patch } : row
      )
    )

  const isDirty = (row: Row) => {
    const was = saved[row.key]
    if (!was) return true
    return (['name', 'extraMins', 'hatch', 'sedan', 'suv'] as const).some(
      (field) => was[field] !== row[field]
    )
  }

  const save = async (row: Row) => {
    const input = addOnInputFrom(row)
    if (!input) {
      setError('An add-on needs a name and a price for each car type.')
      return
    }
    setBusy(row.key)
    setError(null)
    try {
      const addOn = row.id
        ? await api.update(row.id, input)
        : await api.create(input)
      const next = { ...addOnRowFrom(addOn), key: row.key }
      setRows((current) =>
        (current ?? []).map((r) => (r.key === row.key ? next : r))
      )
      setSaved((current) => ({ ...current, [row.key]: next }))
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save the add-on. Try again."
      )
    } finally {
      setBusy(null)
    }
  }

  const setActive = async (row: Row, isActive: boolean) => {
    // A row not saved yet just holds the choice; its Save sends it.
    if (!row.id) return change(row.key, { isActive })
    setBusy(row.key)
    setError(null)
    try {
      const addOn = await api.update(row.id, { isActive })
      change(row.key, { isActive: addOn.isActive })
      setSaved((current) => ({
        ...current,
        [row.key]: { ...current[row.key]!, isActive: addOn.isActive },
      }))
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save the add-on. Try again."
      )
    } finally {
      setBusy(null)
    }
  }

  const remove = async (row: Row) => {
    setError(null)
    try {
      if (row.id) await api.remove(row.id)
      setRows((current) => (current ?? []).filter((r) => r.key !== row.key))
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't delete the add-on. Try again."
      )
    }
  }

  return (
    <section
      aria-labelledby="add-ons-heading"
      className="@container flex flex-col gap-2"
      data-admin-add-ons=""
    >
      <div className="flex flex-col gap-1 @xl:flex-row @xl:items-baseline @xl:justify-between @xl:gap-3">
        <h2
          id="add-ons-heading"
          className="flex items-baseline gap-2 text-[15px] font-medium text-text-primary"
        >
          Add-ons
          <span className="font-numeric text-[12.5px] text-text-muted">
            {list.length}
          </span>
        </h2>
        <p className="text-[12px] text-text-muted">
          Go with any of this garage&apos;s services. No category, no photos.
          Saved at once.
        </p>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-border">
        <div
          aria-hidden="true"
          className={`${GRID} hidden px-4 pt-3 text-[12px] font-medium text-text-muted @xl:grid`}
        >
          <span>Add-on</span>
          <span>Extra min</span>
          <span>Hatch</span>
          <span>Sedan</span>
          <span>SUV</span>
          <span>On</span>
          <span />
        </div>
        {list.length === 0 && (
          <p className="p-4 text-[13px] text-text-muted">No add-ons yet.</p>
        )}
        {list.map((row) => {
          const name = row.name.trim() || 'New add-on'
          return (
            <div
              key={row.key}
              className={`${GRID} border-t border-border px-4 py-2 first:border-t-0`}
              data-add-on-row={name}
            >
              <input
                aria-label={`${name} name`}
                placeholder="Add-on name"
                className={`${INPUT} col-span-2 @xl:col-span-1`}
                value={row.name}
                onChange={(e) => change(row.key, { name: e.target.value })}
              />
              <div>
                <span aria-hidden="true" className={CELL_WORD}>
                  Extra min
                </span>
                <input
                  aria-label={`${name} extra minutes`}
                  inputMode="numeric"
                  placeholder="—"
                  className={`${INPUT} font-numeric`}
                  value={row.extraMins}
                  onChange={(e) =>
                    change(row.key, { extraMins: e.target.value })
                  }
                />
              </div>
              {(
                [
                  ['hatch', 'hatchback'],
                  ['sedan', 'sedan'],
                  ['suv', 'SUV'],
                ] as const
              ).map(([field, word]) => (
                <div key={field}>
                  <span aria-hidden="true" className={CELL_WORD}>
                    {word === 'hatchback'
                      ? 'Hatch'
                      : word === 'SUV'
                        ? 'SUV'
                        : 'Sedan'}
                  </span>
                  <input
                    aria-label={`${name} ${word} price in rupees`}
                    inputMode="numeric"
                    className={`${INPUT} font-numeric`}
                    value={row[field]}
                    onChange={(e) =>
                      change(row.key, { [field]: e.target.value })
                    }
                  />
                </div>
              ))}
              <ScSwitch
                label={`${name} offered to customers`}
                checked={row.isActive}
                disabled={busy === row.key}
                onChange={(on) => void setActive(row, on)}
              />
              <div className="flex items-center gap-1">
                {isDirty(row) && (
                  <button
                    type="button"
                    disabled={busy === row.key}
                    onClick={() => void save(row)}
                    className="press min-h-11 rounded-full border border-white/20 px-3 text-[13px] font-medium text-text-primary disabled:opacity-50"
                  >
                    Save
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Delete ${name}`}
                  onClick={() => (row.id ? setDeleting(row) : void remove(row))}
                  className="flex size-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:text-text-primary"
                >
                  <IconTrash size={16} stroke={1.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <p role="status" className={error ? 'text-[12px] text-error' : 'sr-only'}>
        {error}
      </p>

      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        level="firm"
        title={deleting ? `Delete ${deleting.name}?` : 'Delete this add-on?'}
        body="Customers can't add it any more, and it can't be undone. Past bookings keep it. To stop it for a while, turn it off instead."
        confirmLabel="Delete add-on"
        onConfirm={async () => {
          if (deleting) await remove(deleting)
          setDeleting(null)
        }}
      />
    </section>
  )
}
