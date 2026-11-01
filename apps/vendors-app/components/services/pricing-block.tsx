import { PRICING_TYPES } from '@repo/core/pricing';
import type { PricingType } from '@repo/core/types';
import { StyleSheet, View } from 'react-native';

import { Chip } from '@repo/native-ui/chip';
import { ScInput } from '@repo/native-ui/inputs';
import { T } from '@repo/native-ui/text';
import { type PricingFields, sanitizeDecimal } from '@/lib/service-form';
import { colors } from '@/lib/theme';

import { FieldLabel } from './section-title';

/** Chips that wrap onto the next line, 8 apart (the web's `flex flex-wrap gap-2`). */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

/**
 * The pricing block both forms share: the Flat / Per vehicle / On inspection chips with
 * their hint, then the box(es) for the price the chosen type needs. Numbers are typed
 * on the decimal keypad (the web's type=number).
 */
export function PricingBlock({
  form,
  onChange,
  flatLabel,
}: {
  form: PricingFields;
  onChange: (patch: Partial<PricingFields>) => void;
  /** "Price (₹)" on a service, "Package price (₹)" on a package. */
  flatLabel: string;
}) {
  const hint = PRICING_TYPES.find((pt) => pt.value === form.pricingType)?.hint;
  return (
    <>
      <View style={styles.group}>
        <FieldLabel>Pricing</FieldLabel>
        <ChipRow>
          {PRICING_TYPES.map((pt) => (
            <Chip
              key={pt.value}
              label={pt.label}
              selected={form.pricingType === pt.value}
              onPress={() => onChange({ pricingType: pt.value as PricingType })}
            />
          ))}
        </ChipRow>
        <T size={11} color={colors.textMuted}>
          {hint}
        </T>
      </View>

      {form.pricingType === 'flat' || form.pricingType === 'on_inspection' ? (
        <ScInput
          label={form.pricingType === 'on_inspection' ? 'Inspection fee (₹)' : flatLabel}
          keyboardType="decimal-pad"
          numeric
          value={form.price}
          onChangeText={(text) => onChange({ price: sanitizeDecimal(text) })}
        />
      ) : (
        <View style={styles.tiers}>
          <View style={styles.tier}>
            <ScInput
              label="Hatchback (₹)"
              keyboardType="decimal-pad"
              numeric
              value={form.priceHatchback}
              onChangeText={(text) => onChange({ priceHatchback: sanitizeDecimal(text) })}
            />
          </View>
          <View style={styles.tier}>
            <ScInput
              label="Sedan (₹)"
              keyboardType="decimal-pad"
              numeric
              value={form.priceSedan}
              onChangeText={(text) => onChange({ priceSedan: sanitizeDecimal(text) })}
            />
          </View>
          <View style={styles.tier}>
            <ScInput
              label="SUV (₹)"
              keyboardType="decimal-pad"
              numeric
              value={form.priceSuv}
              onChangeText={(text) => onChange({ priceSuv: sanitizeDecimal(text) })}
            />
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // mb-2 on the caption, mt-1.5 on the hint: a little under 8 between each.
  group: { gap: 8 },
  tiers: { flexDirection: 'row', gap: 8 },
  tier: { flex: 1, minWidth: 0 },
});
