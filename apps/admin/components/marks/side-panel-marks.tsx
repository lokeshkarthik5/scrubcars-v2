'use client'

import { useState } from 'react'
import { IconPlus } from '@tabler/icons-react'
import type { AdminVendor } from '@repo/core/api/admin'
import type { OnboardingMarkBrief } from '@repo/core/api/admin-marks'
import { AskWhatsAppButton } from './ask-whatsapp-button'
import { MarkChip } from './marks-cell'
import { MarkPopover } from './mark-popover'
import { MissingTags } from './missing-tags'

/**
 * The Garages side panel's marks section: what the garage still misses, its
 * open marks (each opens to edit), "Add mark" and "Ask on WhatsApp".
 * Nothing from an API older than the marks.
 */
export function SidePanelMarks({ vendor }: { vendor: AdminVendor }) {
  const [open, setOpen] = useState<OnboardingMarkBrief | 'new' | null>(null)
  if (!vendor.missing && !vendor.openMarks) return null
  const missing = vendor.missing ?? []
  const marks = vendor.openMarks ?? []

  return (
    <section aria-label="Missing and marks" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-text-muted">
          Missing
        </h3>
        {missing.length > 0 ? (
          <MissingTags missing={missing} max={missing.length} />
        ) : (
          <p className="text-[13px] text-text-secondary">Nothing missing</p>
        )}
      </div>

      {vendor.openMarks && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            Marks
          </h3>
          {marks.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {marks.map((mark) => (
                <li key={mark.id}>
                  <MarkChip
                    mark={mark}
                    garage={vendor.businessName}
                    onEdit={() => setOpen(mark)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-text-secondary">No marks yet</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {vendor.openMarks && (
          <button
            type="button"
            onClick={() => setOpen('new')}
            aria-label={`Add mark for ${vendor.businessName}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/25 px-3.5 text-[13px] font-medium text-text-primary hover:bg-surface"
          >
            <IconPlus size={14} aria-hidden />
            Add mark
          </button>
        )}
        {missing.length > 0 && <AskWhatsAppButton vendors={[vendor]} />}
      </div>

      {open && (
        <MarkPopover
          vendor={vendor}
          mark={open === 'new' ? undefined : open}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}
