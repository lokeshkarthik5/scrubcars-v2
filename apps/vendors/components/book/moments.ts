import { toast } from 'react-toastify'
import type { OwnJob } from '@repo/core/api/garage-book'
import { rupees } from '@repo/core/garage-book'
import { t } from '@repo/core/i18n/translate'

/**
 * Moment 5, the reminder that pays back: a job just saved for a customer
 * who came back within 30 days of a reminder says so, once, in a quiet
 * toast (the owner's: staff never get `reminderPaidBack`). Reminders adds
 * up the month.
 */
export function noticePaidBack(job: Pick<OwnJob, 'name' | 'reminderPaidBack'>) {
  if (!job.reminderPaidBack) return
  const first = job.name.trim().split(/\s+/)[0] ?? job.name
  const amount = rupees(job.reminderPaidBack.amountPaise)
  toast.success(
    amount ? t('{name} came back after your reminder · {amount}', { name: first, amount }) : t('{name} came back after your reminder', { name: first }),
    { toastId: `paid-back-${first}` }
  )
}
