import { View } from 'react-native';

import { useT } from '@repo/core/i18n';
import { ScInput } from '@repo/native-ui/inputs';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { approxInvalid, sanitizeDecimal } from '@/lib/service-form';

/**
 * The price boxes of an On inspection service (0073), as the portal draws them
 * (apps/vendors/components/inspection-price-fields.tsx): the inspection fee, optional
 * (empty is a free inspection), a small approx price, also optional, and one line
 * saying what each means.
 */
export function InspectionPriceFields({
  fee,
  approx,
  onFee,
  onApprox,
}: {
  fee: string;
  approx: string;
  onFee: (value: string) => void;
  onApprox: (value: string) => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const invalid = approxInvalid(approx);
  return (
    <View style={styles.group}>
      <ScInput
        label={t('Inspection fee (optional)')}
        keyboardType="decimal-pad"
        numeric
        value={fee}
        onChangeText={(text) => onFee(sanitizeDecimal(text))}
      />
      <ScInput
        label={t('Approx price (optional)')}
        keyboardType="decimal-pad"
        numeric
        value={approx}
        onChangeText={(text) => onApprox(sanitizeDecimal(text))}
      />
      {invalid ? (
        <T accessibilityRole="alert" size={11} color={colors.error}>
          {t('Enter an approx price above ₹0, or leave it empty.')}
        </T>
      ) : (
        <T size={11} color={colors.textMuted}>
          {t('Leave the fee empty for a free inspection. The approx price is only a guide; you send the final bill after seeing the car.')}
        </T>
      )}
    </View>
  );
}

// The web's `flex flex-col gap-2`.
const useStyles = createStyles(() => ({
  group: { gap: 8 },
}));
