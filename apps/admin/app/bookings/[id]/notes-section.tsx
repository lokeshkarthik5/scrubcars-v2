'use client'

import { useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScSection } from '@repo/ui/sc/section'
import type { AdminBookingNote } from '@repo/core/api/admin'
import { errorMessage } from '@repo/core/api/hooks/use-discounts'
import {
  useAddAdminBookingNote,
  useDeleteAdminBookingNote,
  useEditAdminBookingNote,
} from '@repo/core/api/hooks/use-admin-bookings'
import { useAdminMe } from '@repo/core/api/hooks/use-admin-logins'
import { useNow } from '@repo/core/hooks/use-now'
import { formatWhen } from '@/lib/bookings'
import { noteEditable } from '@/lib/notes'

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
            <NoteItem key={note.id} bookingId={bookingId} note={note} />
          ))}
        </ol>
      )}
    </ScSection>
  )
}

/**
 * One note. Your own typed note can be edited or deleted for 24 hours after
 * you wrote it (0065); a note an action wrote, or someone else's, cannot.
 */
function NoteItem({
  bookingId,
  note,
}: {
  bookingId: string
  note: AdminBookingNote
}) {
  const me = useAdminMe()
  const now = useNow(60_000)
  const edit = useEditAdminBookingNote()
  const remove = useDeleteAdminBookingNote()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [draft, setDraft] = useState(note.body)
  const [error, setError] = useState('')
  const mine = noteEditable(note, me.data?.sub, now)
  const busy = edit.isPending || remove.isPending

  return (
    <li className="rounded-[10px] border border-border bg-surface px-3 py-2">
      <p className="text-[12px] text-text-muted">
        {note.author} ·{' '}
        <span className="font-numeric">{formatWhen(note.createdAt)}</span>
        {note.editedAt && ' · edited'}
      </p>
      {editing ? (
        <form
          className="mt-1 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const text = draft.trim()
            if (!text) return
            setError('')
            edit.mutate(
              { id: bookingId, noteId: note.id, body: text },
              {
                onSuccess: () => setEditing(false),
                onError: (err) =>
                  setError(errorMessage(err, "Couldn't save the note")),
              }
            )
          }}
        >
          <ScTextarea
            id={`edit-note-${note.id}`}
            label="Edit your note"
            rows={3}
            maxLength={NOTE_MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-2 self-end">
            <ScButton
              variant="secondary"
              fullWidth={false}
              disabled={busy}
              onClick={() => {
                setEditing(false)
                setDraft(note.body)
              }}
              className="min-h-11 px-4 text-[13px]"
            >
              Cancel
            </ScButton>
            <ScButton
              type="submit"
              variant="secondary"
              fullWidth={false}
              disabled={busy || !draft.trim()}
              className="min-h-11 px-4 text-[13px]"
            >
              {edit.isPending ? 'Saving…' : 'Save note'}
            </ScButton>
          </div>
        </form>
      ) : (
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-text-primary">
          {note.body}
        </p>
      )}
      {mine && !editing && (
        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
          {confirmDelete ? (
            <>
              <span className="text-[12px] text-text-secondary">
                Delete this note?
              </span>
              <ScButton
                variant="secondary"
                fullWidth={false}
                disabled={busy}
                onClick={() => {
                  setError('')
                  remove.mutate(
                    { id: bookingId, noteId: note.id },
                    {
                      onError: (err) =>
                        setError(errorMessage(err, "Couldn't delete the note")),
                    }
                  )
                }}
                className="min-h-11 px-3 text-[12px]"
              >
                {remove.isPending ? 'Deleting…' : 'Delete note'}
              </ScButton>
              <ScButton
                variant="secondary"
                fullWidth={false}
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
                className="min-h-11 px-3 text-[12px]"
              >
                Keep it
              </ScButton>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft(note.body)
                  setEditing(true)
                }}
                aria-label="Edit your note"
                className="min-h-11 px-1 text-[12px] font-medium text-text-secondary underline-offset-2 hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete your note"
                className="min-h-11 px-1 text-[12px] font-medium text-text-secondary underline-offset-2 hover:underline"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-[12px] text-error">
          {error}
        </p>
      )}
    </li>
  )
}
