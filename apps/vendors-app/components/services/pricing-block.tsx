import { PRICING_TYPES, pricingHint } from '@repo/core/pricing';
import type { PricingType } from '@repo/core/types';
import { View } from 'react-native';

import { Chip } from '@repo/native-ui/chip';
import { ScInput } from '@repo/native-ui/inputs';
import { T } from '@repo/native-ui/text';
import { type PricingFields, sanitizeDecimal } from '@/lib/service-form';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { InspectionPriceFields } from './inspection-price-fields';
import { FieldLabel } from './section-title';
import { useT } from '@repo/core/i18n';

/** Chips that wrap onto the next line, 8 apart (the web's `flex flex-wrap gap-2`). */
export function ChipRow({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
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
  approx,
}: {
  form: PricingFields;
  onChange: (patch: Partial<PricingFields>) => void;
  /** "Price (₹)" on a service, "Package price (₹)" on a package. */
  flatLabel: string;
  /**
   * A service's approx price box (0073). Given, On inspection draws the optional fee,
   * the approx price and their hint; a package passes none and keeps its fee box.
   */
  approx?: { value: string; onChange: (value: string) => void };
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  // A package (no approx box) keeps its inspection fee required, and says so.
  const hint = pricingHint(form.pricingType, !approx);
  return (
    <>
      <View style={styles.group}>
        <FieldLabel>{t('Pricing')}</FieldLabel>
        <ChipRow>
          {PRICING_TYPES.map((pt) => (
            <Chip
              key={pt.value}
              label={t(pt.label)}
              selected={form.pricingType === pt.value}
              onPress={() => onChange({ pricingType: pt.value as PricingType })}
            />
          ))}
        </ChipRow>
        <T size={11} color={colors.textMuted}>
          {hint ? t(hint) : hint}
        </T>
      </View>

      {form.pricingType === 'on_inspection' && approx ? (
        <InspectionPriceFields
          fee={form.price}
          approx={approx.value}
          onFee={(price) => onChange({ price })}
          onApprox={approx.onChange}
        />
      ) : form.pricingType === 'flat' || form.pricingType === 'on_inspection' ? (
        <ScInput
          label={form.pricingType === 'on_inspection' ? t('Inspection fee (₹)') : flatLabel}
          keyboardType="decimal-pad"
          numeric
          value={form.price}
          onChangeText={(text) => onChange({ price: sanitizeDecimal(text) })}
        />
      ) : (
        <View style={styles.tiers}>
          <View style={styles.tier}>
            <ScInput
              label={t('Hatchback (₹)')}
              keyboardType="decimal-pad"
              numeric
              value={form.priceHatchback}
              onChangeText={(text) => onChange({ priceHatchback: sanitizeDecimal(text) })}
            />
          </View>
          <View style={styles.tier}>
            <ScInput
              label={t('Sedan (₹)')}
              keyboardType="decimal-pad"
              numeric
              value={form.priceSedan}
              onChangeText={(text) => onChange({ priceSedan: sanitizeDecimal(text) })}
            />
          </View>
          <View style={styles.tier}>
            <ScInput
              label={t('SUV (₹)')}
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

const useStyles = createStyles((colors) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // mb-2 on the caption, mt-1.5 on the hint: a little under 8 between each.
  group: { gap: 8 },
  tiers: { flexDirection: 'row', gap: 8 },
  tier: { flex: 1, minWidth: 0 },
}));
