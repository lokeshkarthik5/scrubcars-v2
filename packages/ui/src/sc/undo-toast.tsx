import { toast } from 'react-toastify'

/**
 * "Job started · Undo": the action has already happened, and this offers
 * the way back for a few seconds (the audits' answer for quick steps such
 * as Start and Complete, where a confirm would slow every tap). Drawn by
 * the ToastContainer each app's layout already renders. Undo is a real
 * button, 44px tall, and closes the toast once pressed.
 */
export function showUndoToast(
  message: string,
  opts: { onUndo: () => void; durationMs?: number; undoLabel?: string }
): void {
  const { onUndo, durationMs = 6000, undoLabel = 'Undo' } = opts
  toast(
    ({ closeToast }) => (
      <div className="flex w-full items-center gap-3">
        <span className="min-w-0 flex-1 text-[13px] text-text-primary">
          {message}
        </span>
        <button
          type="button"
          onClick={() => {
            onUndo()
            closeToast()
          }}
          className="-my-2 -mr-2 min-h-11 min-w-11 shrink-0 rounded-[10px] px-3 text-[14px] font-semibold text-text-primary underline underline-offset-4 hover:bg-surface-elevated"
        >
          {undoLabel}
        </button>
      </div>
    ),
    {
      autoClose: durationMs,
      // Only Undo closes it early: a tap on the words must not throw the
      // way back away. Not an alert: nothing went wrong.
      closeOnClick: false,
      closeButton: false,
      pauseOnHover: true,
      role: 'status',
    }
  )
}
