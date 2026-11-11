import type { MyCoupon } from '@repo/core/api/coupons';
import { useMyCoupons } from '@repo/core/api/hooks/use-coupons';
import { useT } from '@repo/core/i18n';
import { ScButton } from '@repo/native-ui/button';
import { IconTicket } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CouponCodeBox } from '@/components/coupons/coupon-code-box';
import { CouponTicket } from '@/components/coupons/coupon-ticket';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { couponBookPath, myCouponStateLine } from '@/lib/coupon-lines';
import { usePendingCheckout } from '@/lib/pending-checkout';

/** apps/users/app/profile/coupons/page.tsx. */
export default function CouponsScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const coupons = useMyCoupons(!!user);
  const rememberOffer = usePendingCheckout((s) => s.rememberOffer);

  if (!user) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <PageHeader title={t('Coupons')} backTo="/profile" />
        <View style={styles.center}>
          <T size={15} weight={600} align="center">
            {t('Sign in to add a coupon')}
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent('/profile/coupons')}` as Href)}>
            {t('Sign in')}
          </ScButton>
        </View>
      </View>
    );
  }

  const use = (coupon: MyCoupon) => {
    if (coupon.code && coupon.expiresAt) rememberOffer({ userId: user.id, code: coupon.code, vendorId: coupon.vendorId, vehicleId: null, endsAt: coupon.expiresAt });
    router.push(couponBookPath(coupon) as Href);
  };
  const list = coupons.data ?? [];

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={t('Coupons')} backTo="/profile" />
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <CouponCodeBox />
        <View style={styles.section}>
          <T size={14} weight={600} lh={20}>
            {t('Your coupons')}
          </T>
          {coupons.isPending ? (
            <Skeleton height={120} />
          ) : coupons.isError ? (
            <ErrorState message={t("Couldn't load your coupons. Check your connection.")} onRetry={() => void coupons.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState icon={<IconTicket size={32} stroke={1.5} color={colors.textSecondary} />} title={t('No coupons yet')} subtitle={t("Got a Detlio coupon on a card or a flyer? Type its code above, or scan its QR with your phone's camera.")} />
          ) : (
            list.map((coupon) => (
              <CouponTicket
                key={coupon.id}
                reward={coupon.reward}
                title={coupon.title}
                conditions={coupon.state === 'ready' ? coupon.conditions : []}
                amountOff={coupon.offAmount}
                percentOff={coupon.offPercent}
                stamps={coupon.stamps}
                dimmed={coupon.state !== 'ready' && coupon.state !== 'added'}
              >
                <T size={12} lh={16} color={colors.textSecondary}>
                  {myCouponStateLine(coupon)}
                </T>
                {coupon.state === 'ready' ? (
                  <ScButton variant="outline" height={40} fullWidth={false} onPress={() => use(coupon)} style={styles.use}>
                    {t('Use now')}
                  </ScButton>
                ) : null}
              </CouponTicket>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  section: { gap: 8 },
  use: { alignSelf: 'flex-start', marginTop: 4 },
}));
