'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ScButton } from '@repo/ui/sc/button'
import { ScButtonLink } from '@repo/ui/sc/button-link'
import { ScTextarea } from '@repo/ui/sc/input'
import { ScSheet } from '@repo/ui/sc/modal'
import { ApiError } from '@repo/core/api/client'
import { reportReview } from '@repo/core/api/reviews'
import { RATING_RULES } from '@repo/core/ratings'
import { useAuthStore } from '@repo/core/stores/auth-store'

/**
 * "Report" under a review on the garage page (0065; the iOS app needs it for
 * Apple 1.2, the web gets it cheaply): a reason, sent to the team, which
 * looks at it and may hide the review. Signed out, it asks to sign in first
 * and brings the customer back to the garage.
 */
export function ReportReviewButton({
  reviewId,
  reviewerName,
  garagePath,
}: {
  reviewId: string
  reviewerName: string
  /** Where signing in brings them back to: the garage page. */
  garagePath: string
}) {
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')

  const trimmed = reason.trim()
  const ready = trimmed.length >= RATING_RULES.reasonMinLength

  const send = async () => {
    if (!ready || state === 'sending') return
    setState('sending')
    setError('')
    try {
      await reportReview(reviewId, trimmed)
      setState('sent')
    } catch (err) {
      setState('idle')
      setError(
        err instanceof ApiError && (err.code === 'REVIEW_ALREADY_REPORTED' || err.code === 'REVIEW_OWN')
          ? err.message
          : "Couldn't send the report. Try again."
      )
    }
  }

  const close = () => {
    if (state === 'sending') return
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Report ${reviewerName}'s review`}
        className="min-h-11 px-1 text-[12px] font-medium text-text-secondary underline-offset-2 hover:underline"
      >
        Report
      </button>

      {open &&
        createPortal(
          <ScSheet
            open={open}
            onClose={close}
            dismissible={state !== 'sending'}
            aria-label="Report this review"
            className="px-4 pt-1"
          >
            {!user ? (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Sign in to report a review</h2>
                  <p className="mt-1 text-[13px] text-text-secondary">
                    Reports come from an account, so the team can follow up. Signing in brings you back here.
                  </p>
                </div>
                <ScButtonLink href={`/login?next=${encodeURIComponent(garagePath)}`} fullWidth className="min-h-12">
                  Sign in
                </ScButtonLink>
                <button
                  type="button"
                  onClick={close}
                  className="min-h-11 text-[13px] font-medium text-text-secondary"
                >
                  Not now
                </button>
              </div>
            ) : state === 'sent' ? (
              <div className="flex flex-col gap-4">
                <div role="status">
                  <h2 className="text-base font-semibold text-text-primary">Thanks, we&apos;ve got it</h2>
                  <p className="mt-1 text-[13px] text-text-secondary">
                    The team will look at this review. If it breaks our rules, it comes down.
                  </p>
                </div>
                <ScButton variant="secondary" onClick={close} className="min-h-11">
                  Done
                </ScButton>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Report this review</h2>
                  <p className="mt-1 text-[13px] text-text-secondary">
                    Tell the team what is wrong: abusive, fake, or about another garage.
                  </p>
                </div>
                <ScTextarea
                  id={`report-review-${reviewId}`}
                  label="What's wrong with it?"
                  rows={3}
                  maxLength={RATING_RULES.reportReasonMaxLength}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                {error && (
                  <p role="alert" className="text-[12px] text-error">
                    {error}
                  </p>
                )}
                <ScButton onClick={send} disabled={!ready || state === 'sending'} className="min-h-12">
                  {state === 'sending' ? 'Sending…' : 'Send report'}
                </ScButton>
                <button
                  type="button"
                  onClick={close}
                  className="min-h-11 text-[13px] font-medium text-text-secondary"
                >
                  Not now
                </button>
              </div>
            )}
          </ScSheet>,
          document.body
        )}
    </>
  )
}
