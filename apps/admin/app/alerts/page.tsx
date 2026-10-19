'use client'

import { useEffect, useState } from 'react'
import { IconBrandTelegram, IconSend } from '@tabler/icons-react'
import { ScBadge } from '@repo/ui/sc/badge'
import { ScButton } from '@repo/ui/sc/button'
import { ScCard } from '@repo/ui/sc/card'
import { ErrorState } from '@repo/ui/sc/empty-state'
import { ScInput } from '@repo/ui/sc/input'
import { PageHeader } from '@repo/ui/sc/page-header'
import { Skeleton } from '@repo/ui/sc/skeleton'
import { ApiError } from '@repo/core/api/client'
import {
  getTelegramAlertStatus,
  sendTelegramTestAlert,
  type TelegramAlertStatus,
} from '@repo/core/api/admin'
import { rememberName, rememberedName } from '@/lib/actor-name'

type Result = { ok: boolean; text: string }

/**
 * Alerts: whether the team's Telegram alerts are set up, and "Send test
 * alert", which posts "✅ Detlio test alert from <name>" to the ops chat so
 * the team can see the bot works. The test goes whatever the Production-only
 * rule says (it is an explicit test); booking alerts still go out only from
 * Production. The token and chat id are never shown. Rate limited per admin.
 */
export default function AlertsPage() {
  const [status, setStatus] = useState<TelegramAlertStatus | null>(null)
  const [failed, setFailed] = useState(false)
  const [name, setName] = useState(rememberedName)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    getTelegramAlertStatus()
      .then((next) => {
        if (cancelled) return
        setStatus(next)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])
  const retry = () => {
    setFailed(false)
    setAttempt((n) => n + 1)
  }

  const send = async () => {
    const actorName = name.trim()
    if (actorName.length < 2) {
      setResult({ ok: false, text: 'Type your name first.' })
      return
    }
    rememberName(actorName)
    setSending(true)
    setResult(null)
    try {
      await sendTelegramTestAlert(actorName)
      setResult({
        ok: true,
        text: 'Sent. Check the team’s Telegram group for the test message.',
      })
    } catch (error) {
      setResult({
        ok: false,
        text:
          error instanceof ApiError && error.code === 'TELEGRAM_NOT_CONFIGURED'
            ? 'Telegram not set up: add TELEGRAM_BOT_TOKEN and TELEGRAM_OPS_CHAT_ID to the API’s environment.'
            : error instanceof ApiError && error.status === 429
              ? 'Too many test alerts. Try again later.'
              : error instanceof Error
                ? error.message
                : 'The test alert could not be sent.',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <PageHeader title="Alerts" subtitle="The team’s Telegram alerts" />

      {failed ? (
        <ErrorState
          message="Couldn't read the alert settings."
          onRetry={retry}
        />
      ) : !status ? (
        <Skeleton className="h-40 rounded-[14px]" />
      ) : (
        <ScCard className="flex max-w-xl flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-text-primary">
              <IconBrandTelegram size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-text-primary">
                Telegram
              </p>
              <p className="text-[12px] text-text-secondary">
                {status.configured
                  ? status.liveHere
                    ? 'Set up. Booking alerts go out from here.'
                    : 'Set up. Booking alerts go out from Production only, so not from here; a test still does.'
                  : 'Telegram not set up. The bot token and chat id are missing on the API.'}
              </p>
            </div>
            <ScBadge variant={status.configured ? 'success' : 'muted'}>
              {status.configured ? 'Set up' : 'Not set up'}
            </ScBadge>
          </div>

          <div className="flex flex-col gap-2">
            <ScInput
              id="alert-test-name"
              label="Your name"
              autoComplete="name"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <ScButton
              variant="secondary"
              fullWidth={false}
              className="self-start px-4"
              disabled={sending}
              onClick={() => void send()}
            >
              <span className="flex items-center gap-2">
                <IconSend size={16} aria-hidden="true" />
                {sending ? 'Sending…' : 'Send test alert'}
              </span>
            </ScButton>
            <p className="text-[12px] text-text-muted">
              Posts “✅ Detlio test alert from {name.trim() || 'your name'}” to
              the team’s group.
            </p>
          </div>

          {result && (
            <p
              role="status"
              className={
                result.ok
                  ? 'text-[12px] text-success'
                  : 'text-[12px] text-warning'
              }
            >
              {result.text}
            </p>
          )}
        </ScCard>
      )}
    </>
  )
}
