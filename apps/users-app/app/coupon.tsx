import { ApiError } from '@repo/core/api/client';
import { lookupCoupon, type MyCoupon, redeemCoupon } from '@repo/core/api/coupons';
import { couponKeys, invalidateCoupons } from '@repo/core/api/hooks/use-coupons';
import { useT } from '@repo/core/i18n';
import { ScButton } from '@repo/native-ui/button';
import { IconTicket } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, ScCard, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CouponTicket } from '@/components/coupons/coupon-ticket';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { couponBookPath, couponClosedLine, couponUseByLine } from '@/lib/coupon-lines';
import { heldLinkCode } from '@/lib/deep-link';
import { otpFlow } from '@/lib/otp-flow';
import { usePendingCheckout } from '@/lib/pending-checkout';
import { track } from '@/lib/shims/analytics';

/**
 * CouponView (apps/users/components/coupons/coupon-view.tsx): a printed coupon's QR or link. The
 * code is a secret, so it stays in memory (lib/deep-link.ts) and is never in this screen's route.
 */
export default function CouponLinkScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const rememberOffer = usePendingCheckout((s) => s.rememberOffer);
  const [code] = useState(() => heldLinkCode.peek('c'));
  const lookup = useQuery({
    queryKey: [...couponKeys.all, 'lookup', code, user?.id ?? null],
    queryFn: async () => (await lookupCoupon(code ?? '')).coupon,
    enabled: !!code,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const scanned = useRef(false);
  useEffect(() => {
    if (lookup.data && !scanned.current) {
      scanned.current = true;
      track('coupon_scan');
    }
  }, [lookup.data]);

  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<MyCoupon | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const wantsAdd = useRef(false);

  const add = async () => {
    if (adding || !code) return;
    if (!user) {
      // Back here after the code, with the coupon still held in memory.
      wantsAdd.current = true;
      otpFlow.setNext('/coupon?add=1');
      router.push('/login?next=%2Fcoupon%3Fadd%3D1' as Href);
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const result = await redeemCoupon(code, 'link');
      track('coupon_redeem', { source: 'link' });
      setAdded(result.coupon);
      heldLinkCode.clear();
      void invalidateCoupons(queryClient);
    } catch (error) {
      setAddError(error instanceof ApiError ? error.message : t("Couldn't add the coupon. Check your connection and try again."));
    } finally {
      setAdding(false);
    }
  };

  // Signed in on the way: add it, once.
  const autoAdded = useRef(false);
  useEffect(() => {
    if (autoAdded.current || !user || !wantsAdd.current || lookup.data?.state !== 'available') return;
    autoAdded.current = true;
    void add();
    // add closes over this render's code and user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, lookup.data]);

  const book = (coupon: MyCoupon) => {
    if (user && coupon.code && coupon.expiresAt) rememberOffer({ userId: user.id, code: coupon.code, vendorId: coupon.vendorId, vehicleId: null, endsAt: coupon.expiresAt });
    router.replace(couponBookPath(coupon) as Href);
  };

  const body = () => {
    if (!code) {
      return <EmptyState icon={<IconTicket size={32} stroke={1.5} color={colors.textSecondary} />} title={t("We couldn't open this coupon")} subtitle={t('Open its link again, or type its code in Profile → Coupons.')} />;
    }
    if (lookup.isPending) {
      return (
        <View style={styles.column}>
          <Skeleton height={120} />
          <Skeleton height={120} />
        </View>
      );
    }
    if (lookup.isError) {
      const error = lookup.error;
      if (error instanceof ApiError && [400, 404, 429].includes(error.status)) {
        return (
          <View style={styles.column}>
            <EmptyState icon={<IconTicket size={32} stroke={1.5} color={colors.textSecondary} />} title={t("We couldn't open this coupon")} subtitle={error.message} />
            <ScButton variant="outline" onPress={() => router.replace('/garages' as Href)}>
              {t('Find garages')}
            </ScButton>
          </View>
        );
      }
      return <ErrorState message={t("Couldn't load this coupon. Check your connection.")} onRetry={() => void lookup.refetch()} />;
    }
    const coupon = lookup.data;
    if (!coupon) return null;
    const closed = added ? null : couponClosedLine(coupon);
    const stamps = coupon.reward === 'stamps';
    return (
      <View style={styles.column}>
        <CouponTicket
          reward={coupon.reward}
          title={coupon.title}
          conditions={coupon.conditions}
          stamps={coupon.stamps}
          code={coupon.code}
          dimmed={closed !== null && coupon.state !== 'added'}
          amountOff={coupon.offAmount}
          percentOff={coupon.offPercent}
        />
        {added ? (
          <ScCard style={styles.column}>
            <T size={14} weight={600} lh={20}>
              {`${stamps ? t('Added to your Shine Card.') : t('Added to your Detlio account.')}${!stamps && added.expiresAt ? ` ${couponUseByLine(added.expiresAt)}.` : ''}`}
            </T>
            {!stamps ? (
              <T size={13} lh={18} color={colors.textSecondary}>
                {t('It comes off at checkout, once.')}
              </T>
            ) : null}
            {stamps ? (
              <ScButton variant="main" onPress={() => router.replace('/profile/rewards' as Href)}>
                {t('See your Shine Card')}
              </ScButton>
            ) : (
              <ScButton variant="main" onPress={() => book(added)}>
                {t('Book a wash')}
              </ScButton>
            )}
            <ScButton variant="outline" height={44} onPress={() => router.replace('/profile/coupons' as Href)}>
              {t('See your coupons')}
            </ScButton>
          </ScCard>
        ) : closed ? (
          <ScCard style={styles.column}>
            <T size={13} lh={18} color={colors.textSecondary}>
              {closed}
            </T>
            {coupon.state === 'added' ? (
              <ScButton variant="outline" height={44} onPress={() => router.replace('/profile/coupons' as Href)}>
                {t('Open my coupons')}
              </ScButton>
            ) : null}
          </ScCard>
        ) : (
          <View style={styles.column}>
            <T size={13} lh={18} color={colors.textSecondary}>
              {couponUseByLine(coupon.validUntil)}
            </T>
            <ScButton variant="main" disabled={adding} onPress={() => void add()}>
              {adding ? t('Adding…') : t('Add to my Detlio')}
            </ScButton>
            <T size={12} lh={16} color={colors.textMuted}>
              {user
                ? stamps
                  ? t('The stamps go on your Shine Card in Detlio Rewards.')
                  : t('It goes into your account as a coupon only you can use, and comes off at checkout.')
                : t('Sign in or create an account with your phone number, then it is added to your account.')}
            </T>
            {addError ? (
              <T accessibilityRole="alert" size={13} lh={18} color={colors.error}>
                {addError}
              </T>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={t('A Detlio coupon')} backTo="/garages" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>{body()}</ScrollView>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { paddingHorizontal: 16, paddingTop: 8 },
  column: { gap: 12 },
}));
