'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@/components/ui/card'
import { ScInput } from '@repo/ui/sc/input'
import { ApiError } from '@repo/core/api/client'
import { redeemGift } from '@repo/core/api/gifts'
import { invalidateGiftData } from '@repo/core/api/hooks/use-gifts'
import { formatGiftDate, giftRupees } from '@/lib/gifts'

/**
 * "Have a gift code?" on the credit page: for a code read off a printed card
 * or typed from a message, rather than opened as a link. Dashes and spaces
 * are fine; the server reads the code without them. Every refusal (a wrong
 * code, already redeemed, expired, too many tries) is the server's own
 * sentence, which is written for the customer.
 */
export function RedeemCodeBox() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null
  )

  const redeem = async () => {
    const typed = code.trim()
    if (!typed || busy) return
    setBusy(true)
    setResult(null)
    try {
      const done = await redeemGift(typed)
      setCode('')
      setResult({
        ok: true,
        text: `${giftRupees(done.amount)} added to your Detlio credit. Balance ${giftRupees(done.balance)}.${
          done.expiresAt ? ` Use by ${formatGiftDate(done.expiresAt)}.` : ''
        }`,
      })
      void invalidateGiftData(queryClient)
    } catch (error) {
      setResult({
        ok: false,
        text:
          error instanceof ApiError
            ? error.message
            : "Couldn't redeem that code. Check your connection and try again.",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScCard className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void redeem()
        }}
      >
        <ScInput
          label="Have a gift code?"
          placeholder="ABCD-EFGH-JKMN-PQRS"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="font-numeric tracking-wide"
        />
        <ScButton
          type="submit"
          variant="secondary"
          disabled={!code.trim() || busy}
          className="min-h-11"
        >
          {busy ? 'Redeeming…' : 'Redeem'}
        </ScButton>
      </form>
      {result && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={
            result.ok ? 'text-[12px] text-success' : 'text-[12px] text-error'
          }
        >
          {result.text}
        </p>
      )}
    </ScCard>
  )
}
