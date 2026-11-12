import { updateProfile } from '@repo/core/api/users';
import { useT } from '@repo/core/i18n';
import { useUserStore } from '@repo/core/stores/user-store';
import { AuthStage } from '@repo/native-ui/auth-stage';
import { Label, ScButton } from '@repo/native-ui/button';
import { ScInput } from '@repo/native-ui/inputs';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { otpFlow } from '@/lib/otp-flow';
import { errorText } from '@/lib/error-text';

function Form() {
  const t = useT();
  const colors = useColors();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const canSubmit = name.trim().length > 0;
  const next = otpFlow.peekNext();

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const profile = await updateProfile({ name: name.trim() });
      useAuth.getState().setName(profile.name);
      useUserStore.setState((s) => ({ profile: s.profile ? { ...s.profile, name: profile.name } : s.profile }));
      // Replace: Back from the booking should not land on a form already filled in.
      router.replace(otpFlow.takeDestination() as Href);
    } catch (err) {
      toast.error(errorText(err, t('Something went wrong')));
      setLoading(false);
    }
  };

  const cta = next?.startsWith('/book/') ? t('Continue to booking') : next ? t('Continue') : t('Get started');
  const disabled = !canSubmit || loading;

  return (
    <>
      <View style={styles.center}>
        <T accessibilityRole="header" size={28} weight={700} lh={36} tracking={-0.02} align="center">
          {t("What's your name?")}
        </T>
        <T size={16} lh={24} color={colors.textSecondary} align="center" style={styles.sub}>
          {t('The garage sees it on your booking.')}
        </T>
      </View>
      <View style={styles.field}>
        <ScInput
          label={t('Full name')}
          placeholder={t('Your name')}
          autoComplete="name"
          autoCapitalize="words"
          autoFocus
          returnKeyType="go"
          maxLength={255}
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => void submit()}
          style={styles.glass}
        />
      </View>
      <ScButton variant="cta" glass disabled={disabled} onPress={() => void submit()} style={styles.button}>
        <Label color={disabled ? colors.textSecondary : colors.white}>{loading ? t('Saving...') : cta}</Label>
      </ScButton>
      <T size={13} lh={20} color={colors.textSecondary} align="center" style={styles.note}>
        {t("We'll ask for an address only if you book doorstep or pickup & drop.")}
      </T>
    </>
  );
}

/** apps/users/app/profile-setup: a name, and nothing else. No back: behind it is the code. */
export default function ProfileSetupScreen() {
  return (
    <AuthStage>
      <Form />
    </AuthStage>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  sub: { marginTop: 8 },
  field: { marginTop: 32 },
  glass: {
    borderRadius: 12,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  button: { marginTop: 24 },
  note: { marginTop: 16 },
});
