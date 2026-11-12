import { ApiError } from '@repo/core/api/client';
import { lookupGift, redeemGift, type PublicGift, type RedeemResult } from '@repo/core/api/gifts';
import { giftKeys, giftsEnabled, invalidateGiftData, useGiftsConfig } from '@repo/core/api/hooks/use-gifts';
import { t, useT } from '@repo/core/i18n';
import { ScButton } from '@repo/native-ui/button';
import { IconGift } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, ScCard, Skeleton } from '@repo/native-ui/primitives';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftsUnavailable } from '@/components/gifts/gifts-unavailable';
import { PageHeader } from '@/components/page-header';
import { PremiumCard } from '@/components/premium-card/premium-card';
import { ShareCardImage } from '@/components/premium-card/share-card-image';
import { useAuth } from '@/lib/auth';
import { heldLinkCode } from '@/lib/deep-link';
import { formatGiftDate, giftRupees } from '@/lib/gifts';
import { CARS_ILLUSTRATION_LINE, firstName, giftCardSpec } from '@/lib/premium-card';

function closedLine(gift: PublicGift): string | null {
  switch (gift.state) {
    case 'redeemed':
      return t('This gift has already been redeemed.');
    case 'expired':
      return gift.expiresAt ? t('This gift expired on {day}.', { day: formatGiftDate(gift.expiresAt) }) : t('This gift has expired.');
    case 'cancelled':
      return t('This gift was cancelled.');
    default:
      return null;
  }
}

/**
 * GiftView (apps/users/components/gifts/gift-view.tsx). The code stays in memory
 * (lib/deep-link.ts), never in a route, and is looked up once: the API counts wrong codes.
 */
export default function GiftScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const config = useGiftsConfig();
  const on = giftsEnabled(config.data);
  const [code] = useState(() => heldLinkCode.peek('gift'));
  const lookup = useQuery({
    queryKey: [...giftKeys.all, 'lookup', code],
    queryFn: async () => (await lookupGift(code!)).gift,
    enabled: on && !!code,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [redeeming, setRedeeming] = useState(false);
  const [redeemed, setRedeemed] = useState<RedeemResult | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const redeem = async () => {
    if (redeeming || !code) return;
    if (!user) {
      router.push(`/login?next=${encodeURIComponent('/gift')}` as Href);
      return;
    }
    setRedeeming(true);
    setRedeemError(null);
    try {
      setRedeemed(await redeemGift(code));
      heldLinkCode.clear();
      void invalidateGiftData(queryClient);
    } catch (error) {
      setRedeemError(error instanceof ApiError ? error.message : t("Couldn't redeem the gift. Check your connection and try again."));
    } finally {
      setRedeeming(false);
    }
  };

  const body = () => {
    if (!code) {
      return <EmptyState icon={<IconGift size={32} stroke={1.5} color={colors.textSecondary} />} title={t("We couldn't open this gift")} subtitle={t('Open its link again, or type its code in Profile → Detlio credit.')} />;
    }
    if (config.isPending || (on && lookup.isPending)) {
      return (
        <>
          <Skeleton height={160} />
          <Skeleton height={160} />
        </>
      );
    }
    if (!on) return <GiftsUnavailable />;
    if (lookup.isError) {
      const error = lookup.error;
      if (error instanceof ApiError && (error.status === 404 || error.status === 429)) {
        return (
          <View style={styles.none}>
            <EmptyState icon={<IconGift size={32} stroke={1.5} color={colors.textSecondary} />} title={t("We couldn't open this gift")} subtitle={error.message} />
            <ScButton variant="outline" fullWidth={false} onPress={() => router.replace('/garages' as Href)}>
              {t('Find garages')}
            </ScButton>
          </View>
        );
      }
      return <ErrorState message={t("Couldn't load this gift. Check your connection.")} onRetry={() => void lookup.refetch()} />;
    }
    const gift = lookup.data;
    if (!gift) return null;
    const closed = redeemed ? null : closedLine(gift);
    const cardSpec = (showName: boolean) => giftCardSpec({ design: gift.design, amount: gift.amount, recipientName: gift.recipientName, expiresAt: gift.expiresAt, validMonths: config.data?.validMonths, showName });
    return (
      <>
        <View style={styles.gap6}>
          <PremiumCard spec={cardSpec(true)} />
          <T size={11} lh={15} align="center" color={colors.textMuted}>
            {t(CARS_ILLUSTRATION_LINE)}
          </T>
        </View>
        <View style={styles.gap4}>
          <FigureLine size={20} weight={600} lh={26} text={t('{amount} Detlio gift for {name}', { amount: giftRupees(gift.amount), name: gift.recipientName })} />
          <T size={13} lh={18} color={colors.textSecondary}>{t('From {name}', { name: gift.fromName })}</T>
        </View>
        {gift.message ? (
          <ScCard>
            <T size={14} lh={20}>{`“${gift.message}”`}</T>
          </ScCard>
        ) : null}
        {redeemed ? (
          <ScCard style={styles.gap12}>
            <FigureLine size={14} lh={20} text={`${t('{amount} added to your Detlio credit. Balance {balance}.', { amount: giftRupees(redeemed.amount), balance: giftRupees(redeemed.balance) })}${redeemed.expiresAt ? ` ${t('Use by {day}.', { day: formatGiftDate(redeemed.expiresAt) })}` : ''}`} />
            <T size={12} lh={16} color={colors.textSecondary}>
              {t('It comes off your next booking at checkout.')}
            </T>
            <ScButton variant="main" onPress={() => router.replace('/garages' as Href)}>
              {t('Book a wash')}
            </ScButton>
            <Pressable accessibilityRole="link" onPress={() => router.replace('/profile/credit' as Href)} style={styles.link}>
              <T size={13} weight={500} lh={18} color={colors.textSecondary}>
                {t('See your Detlio credit')}
              </T>
            </Pressable>
          </ScCard>
        ) : closed ? (
          <ScCard>
            <T size={13} lh={18} color={colors.textSecondary}>
              {closed}
            </T>
          </ScCard>
        ) : (
          <View style={styles.gap8}>
            {gift.expiresAt ? <FigureLine size={12} lh={16} color={colors.textSecondary} text={t('Use by {day}', { day: formatGiftDate(gift.expiresAt) })} /> : null}
            <ScButton variant="main" disabled={redeeming} onPress={() => void redeem()}>
              {redeeming ? t('Redeeming…') : t('Redeem on Detlio')}
            </ScButton>
            <T size={12} lh={16} color={colors.textMuted}>
              {user ? t('The gift becomes Detlio credit on your account, used at checkout on your next booking.') : t('Sign in or create an account with your phone number, then the gift becomes Detlio credit on it.')}
            </T>
            {redeemError ? (
              <T accessibilityRole="alert" size={12} lh={16} color={colors.error}>
                {redeemError}
              </T>
            ) : null}
          </View>
        )}
        <ShareCardImage spec={cardSpec} firstName={firstName(gift.recipientName) || null} />
      </>
    );
  };
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={t('A Detlio gift')} backTo="/home" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>{body()}</ScrollView>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { gap: 16, paddingHorizontal: 16, paddingTop: 12 },
  none: { alignItems: 'center', gap: 16, paddingTop: 48 },
  gap4: { gap: 4 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
}));
