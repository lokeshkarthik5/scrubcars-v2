'use client'

import type { ReactNode } from 'react'
import { ScSegmented } from '@repo/ui/sc/segmented'
import { useT } from '@repo/core/i18n'
import { WHOLE_CITY_UNAVAILABLE, travelRadiusLabel, wholeCityLabel, type TravelChoice } from '@repo/core/cities'

/**
 * "How far does it go?" for doorstep or pickup & drop (0069): "Up to N km"
 * or "All over <city>", in that order on every screen (the garage portal and
 * the garage app say the same). The km box is the caller's, shown only for
 * the radius answer: all over the city has no number to type.
 *
 * A garage whose pin is in no city cannot offer the whole city, so the
 * second answer is greyed out with the reason under it (the server refuses
 * it too: "Pin the garage inside a city first").
 */
export function TravelChoiceField({
  label,
  wholeCity,
  onChange,
  cityName,
  radiusKm,
  defaultKm,
  disabled,
  wholeCityNote,
  children,
}: {
  /** The radiogroup's accessible name: "How far it travels", "How far it collects from". */
  label: string
  wholeCity: boolean
  onChange: (wholeCity: boolean) => void
  /** The city the garage's pin is in; null for none. */
  cityName: string | null
  /** The radius as saved or typed, for "Up to N km" (null: the default). */
  radiusKm: number | null
  defaultKm: number
  disabled?: boolean
  /** The line under the whole-city answer, by mode. */
  wholeCityNote?: (cityName: string) => string
  /** The km box, shown under the choice while "Up to N km" is picked. */
  children?: ReactNode
}) {
  const t = useT()
  const value: TravelChoice = wholeCity && cityName ? 'whole_city' : 'radius'
  return (
    <div className="flex flex-col gap-2.5">
      <ScSegmented<TravelChoice>
        aria-label={label}
        value={value}
        onChange={(next) => onChange(next === 'whole_city')}
        options={[
          { value: 'radius', label: travelRadiusLabel(radiusKm, defaultKm), disabled },
          {
            value: 'whole_city',
            label: wholeCityLabel(cityName ?? t('the city')),
            disabled: disabled || !cityName,
          },
        ]}
        className="border border-border bg-brand-black p-[3px] [&>button]:min-h-11 [&>button]:text-[13px]"
      />
      {!cityName && <p className="text-[12px] text-text-muted">{t(WHOLE_CITY_UNAVAILABLE)}</p>}
      {wholeCity && cityName && <p className="text-[12.5px] text-text-muted">{wholeCityNote
            ? wholeCityNote(cityName)
            : t("Any address in {city}, measured from the city's centre.", { city: cityName })}
        </p>}
      {value === 'radius' && children}
    </div>
  )
}
