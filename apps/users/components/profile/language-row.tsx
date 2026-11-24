'use client'

import { useState } from 'react'
import { IconChevronRight, IconLanguage } from '@tabler/icons-react'
import { CUSTOMER_TAMIL, LANGUAGE_NAMES, useLang, useT } from '@repo/core/i18n'
import { LanguageSheet } from '@repo/ui/features/language-sheet'
import { ScCard } from '@/components/ui/card'
import { RowIcon } from '@/components/profile/profile-hub'

/**
 * Profile's Language row: English or தமிழ் (Tamil), for this browser, signed
 * in or not. A row like My bookings, with the choice on the right in its own
 * language; the sheet applies it at once, everywhere. The customer app has the
 * same row in the same place (app/(tabs)/profile.tsx). Hidden while customer
 * Tamil is off (CUSTOMER_TAMIL).
 */
export function LanguageRow({ variant = 'card' }: { variant?: 'card' | 'row' }) {
  if (!CUSTOMER_TAMIL) return null
  return <LanguageRowShown variant={variant} />
}

/** `row` sits in Profile's Settings & help card (22 Nov 2026), with its icon. */
function LanguageRowShown({ variant }: { variant: 'card' | 'row' }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [open, setOpen] = useState(false)
  if (variant === 'row') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left text-t3 text-text-primary"
        >
          <RowIcon icon={IconLanguage} />
          <span className="min-w-0 flex-1">{t('Language')}</span>
          <span lang={lang} className="shrink-0 text-t5 text-dim">
            {LANGUAGE_NAMES[lang]}
          </span>
          <IconChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
        </button>
        <LanguageSheet open={open} onClose={() => setOpen(false)} />
      </>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="block w-full text-left"
      >
        <ScCard className="flex items-center justify-between gap-3 text-t4 text-text-primary">
          <span className="min-w-0">{t('Language')}</span>
          <span className="flex shrink-0 items-center gap-1 text-t5 text-text-secondary">
            <span lang={lang}>{LANGUAGE_NAMES[lang]}</span>
            <IconChevronRight
              size={16}
              className="text-text-muted"
              aria-hidden="true"
            />
          </span>
        </ScCard>
      </button>
      <LanguageSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
