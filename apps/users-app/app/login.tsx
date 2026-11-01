import { useNow } from '@repo/core/hooks/use-now';
import { formatCountdown, otpDeadlines, otpErrorMessage, retryAt as retryMoment, secondsUntil } from '@repo/core/otp';
import { normaliseIndianMobile } from '@repo/core/phone';
import { safeNextPath } from '@repo/core/redirect';
import { AuthHeading, AuthStage } from '@repo/native-ui/auth-stage';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconAlertCircle } from '@repo/native-ui/icons';
import { ScPhoneInput } from '@repo/native-ui/inputs';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { otpFlow } from '@/lib/otp-flow';
import { session } from '@/lib/session';

const TERMS_URL = 'https://detlio.com/terms';
const PRIVACY_URL = 'https://detlio.com/privacy';

function Legal() {
  const colors = useColors();
  const link = (url: string, words: string) => (
    <T
      accessibilityRole="link"
      size={12}
      lh={16}
      color={colors.textMuted}
      style={styles.link}
      onPress={() => void WebBrowser.openBrowserAsync(url)}
    >
      {words}
    </T>
  );
  return (
    <T size={12} lh={16} color={colors.textMuted} align="center" style={styles.legal}>
      {'By continuing, you agree to our '}
      {link(TERMS_URL, 'Terms')}
      {'.\nOur '}
      {link(PRIVACY_URL, 'Privacy Policy')}
      {' explains how we use your data.'}
    </T>
  );
}

function Form() {
  const colors = useColors();
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
    <>
      <AuthHeading title="Welcome to Detlio" subtitle="Log in or sign up with your mobile number." />
      <View style={styles.form}>
        <ScPhoneInput value={phone} onChange={changePhone} onSubmit={() => void submit()} normalise={normaliseIndianMobile} />
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
          <Label color={disabled ? colors.textSecondary : colors.white}>
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
          New to Detlio? Your account is created when you verify your number.
        </T>
      </View>
    </>
  );
}

/** PhoneLogin (packages/ui/src/auth/phone-login.tsx) as apps/users words it. Always dark. */
export default function LoginScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  useEffect(() => {
    // A link says where to come back to; the gate may have noted it already.
    const safe = safeNextPath(next);
    if (safe) otpFlow.setNext(safe);
  }, [next]);

  return (
    <AuthStage
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/garages' as Href))}
      footer={<Legal />}
    >
      <Form />
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
