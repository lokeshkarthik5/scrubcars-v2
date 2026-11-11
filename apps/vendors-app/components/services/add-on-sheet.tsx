import { garageAddOnsApi, type AddOn } from '@repo/core/api/add-ons';
import { useState } from 'react';
import { View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { ScInput } from '@repo/native-ui/inputs';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { addOnInput, type AddOnForm, addOnReady, formFromAddOn } from '@/lib/add-on-form';
import { errorText } from '@/lib/error-text';
import { sanitizeDecimal, sanitizeDigits } from '@/lib/service-form';

import { ScSwitch } from '../rows';
import { ChipRow } from './pricing-block';
import { FieldLabel } from './section-title';
import { useT } from '@repo/core/i18n';

/**
 * The add-on form (add-ons frame B), a sheet: the service form's labels. No category, description,
 * photos or On inspection.
 */
export function AddOnSheet({
  open,
  addOn,
  onClose,
  onSaved,
}: {
  open: boolean;
  addOn: AddOn | null;
  onClose: () => void;
  onSaved: (saved: AddOn) => void;
}) {
  const t = useT();
  return (
    <ScSheet open={open} onClose={onClose} accessibilityLabel={addOn ? t('Edit add-on') : t('Add an add-on')} horizontalPadding={20}>
      {/* Keyed so each opening starts from what it is editing. */}
      {open ? <AddOnFormBody key={addOn?.id ?? 'new'} addOn={addOn} onSaved={onSaved} /> : null}
    </ScSheet>
  );
}

function AddOnFormBody({ addOn, onSaved }: { addOn: AddOn | null; onSaved: (saved: AddOn) => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [form, setForm] = useState<AddOnForm>(() => formFromAddOn(addOn));
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<AddOnForm>) => setForm((current) => ({ ...current, ...patch }));

  const submit = async () => {
    setSaving(true);
    try {
      const input = addOnInput(form);
      onSaved(addOn ? await garageAddOnsApi.update(addOn.id, input) : await garageAddOnsApi.create(input));
    } catch (err) {
      toast.error(errorText(err, t('Something went wrong')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.body}>
      <T accessibilityRole="header" size={17} weight={500}>
        {addOn ? t('Edit add-on') : t('Add an add-on')}
      </T>
      <ScInput label={t('Add-on name')} value={form.name} onChangeText={(name) => set({ name })} />
      <View style={styles.group}>
        <FieldLabel>{t('Pricing')}</FieldLabel>
        <ChipRow>
          <Chip label={t('Flat')} selected={form.pricingType === 'flat'} onPress={() => set({ pricingType: 'flat' })} />
          <Chip
            label={t('Per vehicle')}
            selected={form.pricingType === 'per_vehicle'}
            onPress={() => set({ pricingType: 'per_vehicle' })}
          />
        </ChipRow>
      </View>
      {form.pricingType === 'flat' ? (
        <ScInput
          label={t('Price (₹)')}
          keyboardType="decimal-pad"
          numeric
          value={form.price}
          onChangeText={(text) => set({ price: sanitizeDecimal(text) })}
        />
      ) : (
        <View style={styles.tiers}>
          <View style={styles.tier}>
            <ScInput
              label={t('Hatchback (₹)')}
              keyboardType="decimal-pad"
              numeric
              value={form.priceHatchback}
              onChangeText={(text) => set({ priceHatchback: sanitizeDecimal(text) })}
            />
          </View>
          <View style={styles.tier}>
            <ScInput
              label={t('Sedan (₹)')}
              keyboardType="decimal-pad"
              numeric
              value={form.priceSedan}
              onChangeText={(text) => set({ priceSedan: sanitizeDecimal(text) })}
            />
          </View>
          <View style={styles.tier}>
            <ScInput
              label={t('SUV (₹)')}
              keyboardType="decimal-pad"
              numeric
              value={form.priceSuv}
              onChangeText={(text) => set({ priceSuv: sanitizeDecimal(text) })}
            />
          </View>
        </View>
      )}
      <View style={styles.group}>
        <ScInput
          label={t('Extra minutes (optional)')}
          keyboardType="number-pad"
          numeric
          value={form.extraMins}
          onChangeText={(text) => set({ extraMins: sanitizeDigits(text) })}
        />
        <T size={11} color={colors.textMuted}>
          {t("Added to the job's time. Leave empty if it adds none.")}
        </T>
      </View>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <T size={13}>{t('Offered to customers')}</T>
          <T size={11} color={colors.textMuted}>
            {t('Works with any of your services.')}
          </T>
        </View>
        <ScSwitch label={t('Offered to customers')} checked={form.isActive} onChange={(isActive) => set({ isActive })} />
      </View>
      <ScButton variant="main" size="lg" disabled={!addOnReady(form) || saving} onPress={() => void submit()}>
        {saving ? t('Saving...') : addOn ? t('Update add-on') : t('Add add-on')}
      </ScButton>
    </View>
  );
}

const useStyles = createStyles(() => ({
  body: { gap: 12, paddingTop: 4 },
  group: { gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  tiers: { flexDirection: 'row', gap: 8 },
  tier: { flex: 1, minWidth: 0 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
}));
