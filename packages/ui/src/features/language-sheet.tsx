'use client'

import { IconCircleX } from '@tabler/icons-react'
import { LANGUAGE_OPTIONS, useLang, useT } from '@repo/core/i18n'
import { cn } from '@repo/core/utils'
import { ScSheet } from '../sc/modal'

/**
 * English or தமிழ், opened from the Language row (customer website: Profile;
 * garage website: Settings → Account and Your account). Drawn as SortSheet
 * is, one radio row per option. Each option is written in its own language,
 * whatever the page is in. The choice applies at once, everywhere, and is
 * kept on this browser (@repo/core/i18n).
 */
export function LanguageSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  return (
    <ScSheet open={open} onClose={onClose} aria-label={t('Language')}>
      <div>
        <div className="flex items-center justify-between border-b border-border px-5 pb-4 pt-1">
          <h2 className="text-[17px] font-semibold text-text-primary">
            {t('Language')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            className="-mr-[11px] flex size-11 items-center justify-center"
          >
            <IconCircleX
              size={22}
              aria-hidden="true"
              className="text-text-secondary"
            />
          </button>
        </div>

        <div role="radiogroup" aria-label={t('Language')}>
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={lang === option.value}
              lang={option.value}
              onClick={() => {
                setLang(option.value)
                onClose()
              }}
              className="flex min-h-14 w-full items-center justify-between border-b border-border px-5 py-4 text-left last:border-b-0"
            >
              <span className="text-[15px] text-text-primary">
                {option.label}
              </span>
              {/* White, like every other chosen state (SortSheet). */}
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                  lang === option.value
                    ? 'border-text-primary'
                    : 'border-text-muted'
                )}
              >
                {lang === option.value && (
                  <span className="h-2.5 w-2.5 rounded-full bg-text-primary" />
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </ScSheet>
  )
}
