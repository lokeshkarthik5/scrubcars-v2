import { ApiError } from '@repo/core/api/client';
import { type MyCoupon, redeemCoupon } from '@repo/core/api/coupons';
import { invalidateCoupons } from '@repo/core/api/hooks/use-coupons';
import { couponCodeProblem, formatCouponCode, parseCouponCode, type RedeemChannel } from '@repo/core/coupons';
import { useT } from '@repo/core/i18n';
import { ScButton } from '@repo/native-ui/button';
import { ScInput } from '@repo/native-ui/inputs';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { track } from '@/lib/shims/analytics';

import { CouponScanner } from './coupon-scanner';

/** CouponCodeBox (apps/users/components/coupons/coupon-code-box.tsx). */
export function CouponCodeBox({ onAdded }: { onAdded?: (coupon: MyCoupon | null) => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const add = async (raw: string, channel: RedeemChannel) => {
    if (busy) return;
    const problem = couponCodeProblem(raw);
    if (problem) {
      setResult({ ok: false, text: problem });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const { coupon } = await redeemCoupon(raw, channel);
      track('coupon_redeem', { source: channel });
      setCode('');
      setResult({ ok: true, text: coupon ? t('Added: {title}.', { title: coupon.title }) : t('Coupon added.') });
      void invalidateCoupons(queryClient);
      onAdded?.(coupon);
    } catch (error) {
      setResult({ ok: false, text: error instanceof ApiError ? error.message : t("Couldn't add that coupon. Check your connection and try again.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScCard style={styles.card}>
      <ScInput
        label={t('Have a coupon?')}
        placeholder="DTL-7K4QM-92MXA"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        maxLength={40}
        value={code}
        onChangeText={(text) => setCode(text.toUpperCase())}
        onSubmitEditing={() => void add(code.trim(), 'typed')}
      />
      <View style={styles.row}>
        <View style={styles.grow}>
          <ScButton variant="outline" height={44} disabled={!code.trim() || busy} onPress={() => void add(code.trim(), 'typed')}>
            {busy ? t('Adding…') : t('Add coupon')}
          </ScButton>
        </View>
        <ScButton variant="outline" height={44} fullWidth={false} disabled={busy} onPress={() => setScanning(true)}>
          {t('Scan')}
        </ScButton>
      </View>
      {result ? (
        <T accessibilityRole={result.ok ? undefined : 'alert'} size={12} lh={16} color={result.ok ? colors.success : colors.error}>
          {result.text}
        </T>
      ) : null}
      {scanning ? (
        <CouponScanner
          onClose={() => setScanning(false)}
          onCode={(scanned) => {
            setScanning(false);
            const parsed = parseCouponCode(scanned);
            if (parsed.ok) setCode(formatCouponCode(parsed.code));
            void add(scanned, 'camera');
          }}
        />
      ) : null}
    </ScCard>
  );
}

const useStyles = createStyles(() => ({
  card: { gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
}));
