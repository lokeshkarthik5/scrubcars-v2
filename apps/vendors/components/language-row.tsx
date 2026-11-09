'use client'

import { useState } from 'react'
import { IconChevronRight, IconLanguage } from '@tabler/icons-react'
import { LANGUAGE_NAMES, useLang, useT } from '@repo/core/i18n'
import { ScCard } from '@repo/ui/sc/card'
import { LanguageSheet } from '@repo/ui/features/language-sheet'

/**
 * English or தமிழ் (Tamil), for this browser: drawn as Settings' LinkRow (a
 * graphite icon tile, the title, the choice under it in its own language, a
 * chevron), opening the Language sheet. On Settings → Account for the owner
 * and admins, and on Your account for every seat, so an operator (who has no
 * Settings) can choose too. The garage app has the same rows.
 */
export function LanguageRow() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="press block w-full text-left"
      >
        <ScCard className="flex items-center gap-3 transition-colors hover:border-text-muted">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-text-primary">
            <IconLanguage size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-text-primary">
              {t('Language')}
            </p>
            <p lang={lang} className="text-[11px] text-text-secondary">
              {LANGUAGE_NAMES[lang]}
            </p>
          </div>
          <IconChevronRight
            size={18}
            aria-hidden="true"
            className="shrink-0 text-text-muted"
          />
        </ScCard>
      </button>
      <LanguageSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
