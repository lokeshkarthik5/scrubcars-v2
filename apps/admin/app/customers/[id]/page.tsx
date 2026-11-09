'use client'

import { Suspense, use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-toastify'
import { IconAlertTriangle } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ConfirmSheet } from '@repo/ui/sc/confirm-sheet'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { PageHeader } from '@repo/ui/sc/page-header'
import { ScSection } from '@repo/ui/sc/section'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import type { AdminCustomer } from '@repo/core/api/admin-customers'
import { errorMessage, isAuthError } from '@repo/core/api/hooks/use-discounts'
import {
  useAdminCustomer,
  useAdminCustomerDeletion,
  useDeleteAdminCustomer,
} from '@repo/core/api/hooks/use-admin-customers'
import { Meta } from '@/components/meta'
import { useCanDeleteAnything } from '@/components/owner-delete'
import { PhoneLink } from '@/components/phone-link'
import { formatRupees, formatWhen } from '@/lib/bookings'

/** Back to the search it came from, and only ever to the Customers list. */
function backHref(back: string | null): string {
  return back
    ? `/customers?q=${encodeURIComponent(back.slice(0, 60))}`
    : '/customers'
}

/**
 * The owner's Delete customer account (10 Nov 2026): the customer's own
 * account delete, run from admin. What is open is read first (and again as
 * the sheet opens): a garage owner is refused, with no button ("Remove them
 * from the garage first"); anything else open is listed in the sheet as a
 * warning saying what the delete does with it. The customer's phone is typed
 * to confirm.
 */
function DeleteCustomerAccount({
  customer,
  onDeleted,
}: {
  customer: AdminCustomer
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const preview = useAdminCustomerDeletion(customer.id, true)
  const remove = useDeleteAdminCustomer()
  const check = preview.data

  if (check?.block) {
    return (
      <p role="status" className="flex gap-2 text-[13px] text-text-primary">
        <IconAlertTriangle
          size={16}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-warning"
        />
        <span>{check.block.message}</span>
      </p>
    )
  }

  const confirm = async () => {
    setError('')
    try {
      const result = await remove.mutateAsync({
        id: customer.id,
        confirmText: customer.phone,
      })
      setOpen(false)
      toast.success(
        result.endedBookings > 0
          ? `${customer.name}'s account was deleted, and ${result.endedBookings === 1 ? '1 booking was' : `${result.endedBookings} bookings were`} cancelled`
          : `${customer.name}'s account was deleted`
      )
      onDeleted()
    } catch (err) {
      setError(
        errorMessage(err, "Couldn't delete the account. Nothing was deleted.")
      )
    }
  }

  return (
    <>
      <ScButton
        variant="danger-outline"
        fullWidth={false}
        disabled={!check}
        onClick={() => {
          setError('')
          setOpen(true)
          void preview.refetch()
        }}
        className="px-4 text-[13px]"
      >
        Delete customer account…
      </ScButton>
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        busy={remove.isPending}
        error={
          error ||
          (preview.error
            ? errorMessage(preview.error, "Couldn't check the account")
            : '') ||
          undefined
        }
        level="typed"
        typeToConfirm={customer.phone}
        title={`Delete ${customer.name}'s account?`}
        confirmLabel="Delete account"
        body={
          <div className="flex flex-col gap-2.5">
            <p>
              Their name, number, email, addresses, cars&apos; plates and saved
              things are removed, and every session ends. Bookings, receipts,
              payments and reviews stay as a deleted account&apos;s, for the
              records. The number can sign up again as a new account.
            </p>
            {check && check.warnings.length > 0 && (
              <ul aria-label="Still open" className="flex flex-col gap-1.5">
                {check.warnings.map((warning) => (
                  <li
                    key={warning.code}
                    className="flex gap-2 text-text-primary"
                  >
                    <IconAlertTriangle
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-warning"
                    />
                    <span>{warning.message}</span>
                  </li>
                ))}
              </ul>
            )}
            <p>This can&apos;t be undone.</p>
          </div>
        }
      />
    </>
  )
}

function CustomerDetail({ id }: { id: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const back = backHref(params.get('back'))
  const canDelete = useCanDeleteAnything()
  const { data: customer, error, isPending, refetch } = useAdminCustomer(id)
  useEffect(() => {
    if (isAuthError(error)) router.replace('/login')
  }, [error, router])

  return (
    <>
      <PageHeader
        title={customer?.name ?? 'Customer'}
        subtitle={
          customer ? `Joined ${formatWhen(customer.joinedAt)}` : undefined
        }
        backHref={back}
      />
      {isPending ? (
        <SkeletonList count={2} itemClassName="h-24 rounded-[14px]" />
      ) : !customer ? (
        <ErrorState
          message={errorMessage(error, 'Couldn’t load this customer')}
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <ScSection title="With Detlio">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Meta label="Phone" size="md">
                <PhoneLink phone={customer.phone} name={customer.name} />
              </Meta>
              <Meta label="Bookings" size="md">
                <Link
                  href={`/bookings?q=${encodeURIComponent(customer.phone)}`}
                  className="font-numeric underline underline-offset-4"
                >
                  {customer.bookings}
                </Link>
              </Meta>
              <Meta label="Detlio credit" size="md">
                <span className="font-numeric">
                  {formatRupees(customer.credit)}
                </span>
              </Meta>
              <Meta label="Rewards" size="md">
                <span className="font-numeric">{customer.rewards.stamps}</span>{' '}
                {customer.rewards.stamps === 1 ? 'stamp' : 'stamps'} ·{' '}
                <span className="font-numeric">
                  {customer.rewards.vouchers}
                </span>{' '}
                {customer.rewards.vouchers === 1 ? 'voucher' : 'vouchers'}
              </Meta>
            </dl>
          </ScSection>
          {canDelete && (
            <ScSection title="Danger zone">
              <p className="text-[12px] text-text-secondary">
                Only the owner sees this. The customer is not told.
              </p>
              <DeleteCustomerAccount
                customer={customer}
                onDeleted={() => router.replace(back)}
              />
            </ScSection>
          )}
        </>
      )}
    </>
  )
}

export default function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <Suspense
      fallback={<SkeletonList count={2} itemClassName="h-24 rounded-[14px]" />}
    >
      <CustomerDetail id={id} />
    </Suspense>
  )
}
