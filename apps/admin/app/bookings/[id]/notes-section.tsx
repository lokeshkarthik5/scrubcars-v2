'use client'

import { useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import type { AdminBookingNote } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import { useAddAdminBookingNote } from '@repo/core/api/hooks/use-admin-bookings'
import { formatWhen } from '@/lib/bookings'

const NOTE_MAX = 2000

/**
 * The ops team's running record of a booking: complaints, calls made, what
 * was agreed. Cancelling and marking a no-show add a note here on their own,
 * so this reads as the whole history of what ops did.
 */
export function NotesSection({
  bookingId,
  notes,
}: {
  bookingId: string
  notes: AdminBookingNote[]
}) {
  const addNote = useAddAdminBookingNote()
  const [body, setBody] = useState('')
  const [error, setError] = useState('')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!text) return
    setError('')
    addNote.mutate(
      { id: bookingId, body: text },
      {
        onSuccess: () => setBody(''),
        onError: (err) => setError(errorMessage(err, "Couldn't save the note")),
      }
    )
  }

  return (
    <ScSection
      title="Internal notes"
      action={
        <span className="font-numeric text-[12px] text-text-muted">
          {notes.length}
        </span>
      }
    >
      <p className="text-[12px] text-text-muted">
        Only the Detlio team sees these. Customers and garages never do.
      </p>

      <form onSubmit={submit} className="flex flex-col gap-2">
        <ScTextarea
          id="booking-note"
          label="Add a note"
          rows={3}
          maxLength={NOTE_MAX}
          placeholder="Who called, what was agreed"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-[12px] text-error">
            {error}
          </p>
        )}
        <ScButton
          type="submit"
          variant="secondary"
          fullWidth={false}
          disabled={!body.trim() || addNote.isPending}
          className="min-h-11 self-end px-4 text-[13px]"
        >
          {addNote.isPending ? 'Saving…' : 'Add note'}
        </ScButton>
      </form>

      {notes.length === 0 ? (
        <p className="text-[12px] text-text-secondary">No notes yet.</p>
      ) : (
        <ol aria-label="Notes, newest first" className="flex flex-col gap-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-[10px] border border-border bg-surface px-3 py-2"
            >
              <p className="text-[12px] text-text-muted">
                {note.author} ·{' '}
                <span className="font-numeric">
                  {formatWhen(note.createdAt)}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-text-primary">
                {note.body}
              </p>
            </li>
          ))}
        </ol>
      )}
    </ScSection>
  )
}
