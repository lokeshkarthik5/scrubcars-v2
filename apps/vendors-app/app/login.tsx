import { formatCountdown, otpDeadlines, otpErrorMessage, retryAt as retryMoment, secondsUntil } from '@repo/core/otp';
import { useNow } from '@repo/core/hooks/use-now';
import { normaliseIndianMobile } from '@repo/core/phone';
import { type Href, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthHeading, AuthStage } from '@repo/native-ui/auth-stage';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconAlertCircle } from '@repo/native-ui/icons';
import { ScPhoneInput } from '@repo/native-ui/inputs';
import { T } from '@repo/native-ui/text';
import { otpFlow } from '@/lib/otp-flow';
import { session } from '@/lib/session';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { fill, useT } from '@repo/core/i18n';

/** Detlio's Privacy Policy, as the web's sign-in links it. */
const PRIVACY_POLICY_URL = 'https://detlio.com/privacy';

/**
 * PhoneLogin (packages/ui/src/auth/phone-login.tsx), as apps/vendors/app/login/page.tsx words it.
 * Sign-in is always dark (the owner's Option 1): AuthStage scopes itself dark, so the form and
 * the footer are components rendered inside it, reading the dark colours, never the app's theme.
 */
export default function LoginScreen() {
  return <AuthStage footer={<LoginFooter />}><LoginForm /></AuthStage>;
}

function LoginFooter() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  return (
    <T size={12} lh={16} color={colors.textMuted} align="center" style={styles.legal}>
      {`${t('How we use your data is set out in our')}\n`}
      <T
        accessibilityRole="link"
        size={12}
        lh={16}
        color={colors.textMuted}
        style={styles.link}
        onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
      >
        {t('Privacy Policy')}
      </T>
    </T>
  );
}

function LoginForm() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
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
      setError(otpErrorMessage(err, t('Failed to send OTP')));
      setRetryAt(retryMoment(err, Date.now()));
    } finally {
      setLoading(false);
    }
  };

  const disabled = !isValid || loading || waitSeconds > 0;

  return (
    <>
      <AuthHeading title="Detlio for Partners" subtitle={t('Log in with the number registered for your garage.')} />
      <View style={styles.form}>
        <ScPhoneInput normalise={normaliseIndianMobile} value={phone} onChange={changePhone} onSubmit={() => void submit()} />
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
          <Label color={disabled ? colors.textSecondary : colors.textPrimary}>
            {loading ? (
              t('Sending...')
            ) : waitSeconds > 0 && waitSeconds < 60 ? (
              <>
                {fill(t('Send OTP in {time}'), {
                  time: (
                    <T num size={15} weight={600} lh={20} color={colors.textSecondary}>
                      {formatCountdown(waitSeconds)}
                    </T>
                  ),
                })}
              </>
            ) : (
              t('Send OTP')
            )}
          </Label>
        </ScButton>
        <T size={13} lh={20} color={colors.textSecondary} align="center">
          {t('New to Detlio? You can set up your garage once your number is verified.')}
        </T>
      </View>
    </>
  );
}

const useStyles = createStyles((colors) => ({
  form: { marginTop: 32, gap: 16 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorIcon: { marginTop: 3 },
  errorText: { flex: 1 },
  legal: { paddingBottom: 8 },
  link: { textDecorationLine: 'underline' },
}));
