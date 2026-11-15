import { IconSparkles } from '@tabler/icons-react'
import { Tile } from '@/components/home/tile'
import { useT } from '@repo/core/i18n'

/**
 * Home's Shine Score tile (0078): the left tile of the row under the car's
 * tiles, the same 164pt tile as Book again and Last wash. Opens the guided
 * photos. Shown only while SHINE_SCORE_ENABLED is on (Home reads /shine/config).
 */
export function ShineScoreTile() {
  const t = useT()
  return (
    <Tile href="/shine" label={t('How clean is your car?')} icon={IconSparkles}>
      <span className="flex-1" />
      <span className="line-clamp-2 pr-1.5 text-[22px] leading-[1.12] tracking-[-0.022em] text-text-primary">
        {t('Shine Score')}
      </span>
      <span className="mt-2 line-clamp-2 text-t4 leading-snug text-dim">{t('Free · 4 photos')}</span>
    </Tile>
  )
}
