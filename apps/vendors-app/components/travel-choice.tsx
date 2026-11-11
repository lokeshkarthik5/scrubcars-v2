import { WHOLE_CITY_UNAVAILABLE, travelRadiusLabel, wholeCityLabel, type TravelChoice } from '@repo/core/cities';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ScSegmented } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';

/**
 * "How far do you go?" for doorstep or pickup & drop (0069): "Up to N km" or "All over <city>",
 * in that order, the same words as the garage portal (@repo/ui/features/travel-choice). The km box
 * is the caller's, shown only for the radius answer. A garage whose pin is in no city cannot offer
 * the whole city: picking it does nothing and the reason shows under the choice.
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
  label: string;
  wholeCity: boolean;
  onChange: (wholeCity: boolean) => void;
  /** The city the garage's pin is in; null for none. */
  cityName: string | null;
  radiusKm: number | null;
  defaultKm: number;
  disabled?: boolean;
  wholeCityNote?: (cityName: string) => string;
  /** The km box, shown while "Up to N km" is picked. */
  children?: ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  const value: TravelChoice = wholeCity && cityName ? 'whole_city' : 'radius';
  return (
    <View style={styles.wrap}>
      <ScSegmented<TravelChoice>
        accessibilityLabel={label}
        value={value}
        minHeight={44}
        labelSize={13}
        onChange={(next) => {
          if (disabled) return;
          if (next === 'whole_city' && !cityName) return;
          onChange(next === 'whole_city');
        }}
        options={[
          { value: 'radius', label: travelRadiusLabel(radiusKm, defaultKm) },
          { value: 'whole_city', label: wholeCityLabel(cityName ?? 'the city') },
        ]}
      />
      {!cityName ? (
        <T size={12} color={colors.textMuted}>
          {WHOLE_CITY_UNAVAILABLE}
        </T>
      ) : null}
      {wholeCity && cityName ? (
        <T size={12} color={colors.textMuted}>
          {wholeCityNote ? wholeCityNote(cityName) : `Any address in ${cityName}, measured from the city's centre.`}
        </T>
      ) : null}
      {value === 'radius' ? children : null}
    </View>
  );
}

const useStyles = createStyles(() => ({
  wrap: { gap: 10 },
}));
