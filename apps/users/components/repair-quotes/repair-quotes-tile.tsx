'use client'

import { IconTool } from '@tabler/icons-react'
import { repairQuotesOn, useRepairQuotesConfig } from '@repo/core/api/hooks/use-repair-quotes'
import { useT } from '@repo/core/i18n'
import { Tile } from '@/components/home/tile'

/**
 * Home's "Dent or scratch? Repair quotes" tile (0076): one of the 164pt
 * tiles, in the row under the car's two (ToolTilesRow). Only while the API
 * says repair quotes are on; nothing at all while it loads or is off.
 */
export function RepairQuotesTile() {
  const t = useT()
  const config = useRepairQuotesConfig()
  if (!repairQuotesOn(config.data)) return null
  return (
    <Tile href="/repair-quotes/new" label={t('Dent or scratch?')} icon={IconTool}>
      <span className="flex-1" />
      <span className="pr-1.5 text-[22px] leading-[1.12] tracking-[-0.022em] text-text-primary">
        {t('Repair quotes')}
      </span>
      <span className="mt-2 text-t4 text-dim">{t('From garages near you')}</span>
    </Tile>
  )
}

/**
 * The row of tool tiles on Home, under the car's tiles: two to a row, as
 * drawn. Each tile decides for itself whether it shows (its own switch), so
 * a new tool (Shine Score) is one more child here. A lone tile keeps half
 * the width, like the drawing; with none, the row is not there at all.
 */
export function ToolTilesRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 empty:hidden">{children}</div>
}
