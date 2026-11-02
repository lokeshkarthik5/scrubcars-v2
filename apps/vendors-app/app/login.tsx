import { formatCountdown, otpDeadlines, otpErrorMessage, retryAt as retryMoment, secondsUntil } from '@repo/core/otp';
import { useNow } from '@repo/core/hooks/use-now';
import { type Href, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthHeading, AuthStage } from '@/components/auth-stage';
import { Label, ScButton } from '@/components/button';
import { IconAlertCircle } from '@/components/icons';
import { ScPhoneInput } from '@/components/inputs';
import { T } from '@/components/text';
import { otpFlow } from '@/lib/otp-flow';
import { session } from '@/lib/session';
import { colors } from '@/lib/theme';

/** Detlio's Privacy Policy, as the web's sign-in links it. */
const PRIVACY_POLICY_URL = 'https://detlio.com/privacy';

/** PhoneLogin (packages/ui/src/auth/phone-login.tsx), as apps/vendors/app/login/page.tsx words it. */
export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const now = useNow(1000);
  const waitSeconds = retryAt ? secondsUntil(retryAt, now) : 0;
  const shownError = retryAt && waitSeconds === 0 ? '' : error;
  const isValid = /^\d{10}$/.test(phone);

  const changePhone = (value: string) => {
    setPhone(value);
    if (retryAt) {
      setRetryAt(null);
      setError('');
    }
  };

  const submit = async () => {
    if (!isValid || loading || waitSeconds > 0) return;
    setLoading(true);
    setError('');
    try {
      const sent = await session.sendCode(phone);
      const { expiresAt, resendAt } = otpDeadlines(Date.now(), sent.expiresInSeconds);
      otpFlow.set({ phone, purpose: sent.purpose, expiresAt, resendAt });
      router.push('/verify-otp' as Href);
    } catch (err) {
      setError(otpErrorMessage(err, 'Failed to send OTP'));
      setRetryAt(retryMoment(err, Date.now()));
    } finally {
      setLoading(false);
    }
  };

  const disabled = !isValid || loading || waitSeconds > 0;

  return (
    <AuthStage
      footer={
        <T size={12} lh={16} color={colors.textMuted} align="center" style={styles.legal}>
          {'How we use your data is set out in our\n'}
          <T
            accessibilityRole="link"
            size={12}
            lh={16}
            color={colors.textMuted}
            style={styles.link}
            onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
          >
            Privacy Policy
          </T>
        </T>
      }
    >
      <AuthHeading title="Detlio for Partners" subtitle="Log in with the number registered for your garage." />
      <View style={styles.form}>
        <ScPhoneInput value={phone} onChange={changePhone} onSubmit={() => void submit()} />
        {shownError ? (
          <View accessibilityRole="alert" style={styles.error}>
            <View style={styles.errorIcon}>
              <IconAlertCircle size={14} color={colors.error} />
            </View>
            <T size={12} color={colors.error} style={styles.errorText}>
              {shownError}
            </T>
          </View>
        ) : null}
        <ScButton variant="cta" glass disabled={disabled} onPress={() => void submit()}>
          <Label color={disabled ? colors.textSecondary : colors.brandWhite}>
            {loading ? (
              'Sending...'
            ) : waitSeconds > 0 && waitSeconds < 60 ? (
              <>
                {'Send OTP in '}
                <T num size={15} weight={600} lh={20} color={colors.textSecondary}>
                  {formatCountdown(waitSeconds)}
                </T>
              </>
            ) : (
              'Send OTP'
            )}
          </Label>
        </ScButton>
        <T size={13} lh={20} color={colors.textSecondary} align="center">
          New to Detlio? You can set up your garage once your number is verified.
        </T>
      </View>
    </AuthStage>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 32, gap: 16 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorIcon: { marginTop: 3 },
  errorText: { flex: 1 },
  legal: { paddingBottom: 8 },
  link: { textDecorationLine: 'underline' },
});
