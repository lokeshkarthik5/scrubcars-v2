import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { ScInput } from '@repo/native-ui/inputs';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { useAuth } from '@/lib/auth';
import { useOnboardingDraft } from '@/lib/onboarding-draft';
import { phoneDigits, stepPath, step1Complete, YEARS_OPTIONS } from '@/lib/onboarding-logic';
import { digitsOnly } from '@/lib/settings-logic';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { FieldLabel, OnboardingHeader, useDraftSync } from './parts';
import { useT } from '@repo/core/i18n';

/** Step 1: Business info (apps/vendors/app/onboarding/step-1/page.tsx). Nothing is sent yet. */
export function StepBusiness() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const phone = phoneDigits(useAuth((s) => s.user?.phone));
  const saved = useOnboardingDraft.getState();
  const [form, setForm] = useState({
    businessName: saved.businessName,
    ownerName: saved.ownerName,
    city: saved.city,
    whatsapp: saved.whatsapp,
    email: saved.email,
    yearsInOperation: saved.yearsInOperation,
  });
  useDraftSync({ ...form, phone });

  return (
    <AppShell hasNav={false}>
      <OnboardingHeader step={1} title={t('Business info')} subtitle={t('The basics about your garage and who runs it.')} />

      <ScCard style={styles.card}>
        <ScInput
          label={t('Business name')}
          autoCapitalize="words"
          value={form.businessName}
          onChangeText={(businessName) => setForm({ ...form, businessName })}
        />
        <ScInput
          label={t('Owner name')}
          autoCapitalize="words"
          textContentType="name"
          value={form.ownerName}
          onChangeText={(ownerName) => setForm({ ...form, ownerName })}
        />
        {/* The number just verified: shown, not editable. */}
        <View style={styles.group}>
          <FieldLabel>{t('Mobile number')}</FieldLabel>
          <View style={styles.readonly} accessible accessibilityLabel={t('Mobile number: plus 91 {phone}', { phone })}>
            <T size={13} num color={colors.textMuted}>
              +91 {phone}
            </T>
          </View>
        </View>
        <ScInput label={t('City')} value={form.city} onChangeText={(city) => setForm({ ...form, city })} />
        <ScInput
          label={t('WhatsApp number (optional)')}
          numeric
          keyboardType="number-pad"
          placeholder={t('10-digit number')}
          value={form.whatsapp}
          onChangeText={(text) => setForm({ ...form, whatsapp: digitsOnly(text, 10) })}
        />
        <ScInput
          label={t('Email (optional)')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          value={form.email}
          onChangeText={(email) => setForm({ ...form, email })}
        />
        <View style={styles.group}>
          <FieldLabel>{t('Years in operation (optional)')}</FieldLabel>
          <View style={styles.chips}>
            {YEARS_OPTIONS.map((years) => (
              <Chip
                key={years}
                label={t(years)}
                selected={form.yearsInOperation === years}
                onPress={() =>
                  setForm({ ...form, yearsInOperation: form.yearsInOperation === years ? '' : years })
                }
              />
            ))}
          </View>
        </View>
      </ScCard>

      <ScButton
        variant="main"
        size="lg"
        style={styles.continue}
        disabled={!step1Complete(form)}
        onPress={() => {
          useOnboardingDraft.getState().update({ ...form, phone });
          router.push(stepPath(2));
        }}
      >
        {t('Continue')}
      </ScButton>
    </AppShell>
  );
}

const useStyles = createStyles((colors) => ({
  card: { gap: 16 },
  group: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  readonly: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.canvas,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  continue: { marginTop: 'auto', marginBottom: 16 },
}));
