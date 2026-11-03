import { ApiError } from '@repo/core/api/client';
import { makeGiftLink, type GiftLink, type GiftState, type SentGift } from '@repo/core/api/gifts';
import { giftsEnabled, invalidateGiftData, useGiftsConfig, useMySentGifts } from '@repo/core/api/hooks/use-gifts';
import { ScButton } from '@repo/native-ui/button';
import { IconGift } from '@repo/native-ui/icons';
import { EmptyState, ErrorState, ScCard, Skeleton, StatusChip } from '@repo/native-ui/primitives';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftShare } from '@/components/gifts/gift-share';
import { GiftsUnavailable } from '@/components/gifts/gifts-unavailable';
import { PageHeader } from '@/components/page-header';
import { PremiumCard } from '@/components/premium-card/premium-card';
import { useAuth } from '@/lib/auth';
import { formatGiftDate, GIFT_STATE_LABELS, giftEvidenceLine, giftRupees } from '@/lib/gifts';
import { giftCardSpec } from '@/lib/premium-card';

const STATE_TONE: Record<GiftState, 'done' | 'progress' | 'closed'> = { pending: 'progress', available: 'progress', redeemed: 'done', expired: 'closed', cancelled: 'closed' };

/** apps/users/app/profile/gifts/page.tsx. A new link ends the old one: the button says so first. */
export default function SentGiftsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const config = useGiftsConfig();
  const on = giftsEnabled(config.data);
  const gifts = useMySentGifts(on && !!user);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [making, setMaking] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<{ giftId: string; text: string } | null>(null);
  const [sharing, setSharing] = useState<{ gift: SentGift; link: GiftLink } | null>(null);

  const getLink = async (gift: SentGift) => {
    setMaking(gift.id);
    setLinkError(null);
    try {
      const link = await makeGiftLink(gift.id);
      setConfirming(null);
      setSharing({ gift: { ...gift, linkMade: true }, link });
      void invalidateGiftData(queryClient);
    } catch (error) {
      setLinkError({ giftId: gift.id, text: error instanceof ApiError ? error.message : "Couldn't make the link. Check your connection and try again." });
      void invalidateGiftData(queryClient);
    } finally {
      setMaking(null);
    }
  };
  const list = gifts.data ?? [];
  const page = (children: React.ReactNode, title = 'Gifts you sent') => (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={title} backTo="/profile" />
      {children}
    </View>
  );
  if (!user) {
    return page(
      <View style={styles.center}>
        <T size={15} weight={600} align="center">
          Sign in to see the gifts you sent
        </T>
        <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent('/profile/gifts')}` as Href)}>
          Sign in
        </ScButton>
      </View>
    );
  }
  if (!config.isPending && !on) return page(<GiftsUnavailable />);
  if (sharing) {
    return page(
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <GiftShare gift={sharing.gift} link={sharing.link} />
        <ScButton variant="outline" onPress={() => setSharing(null)}>
          Back to Gifts you sent
        </ScButton>
      </ScrollView>,
      'Share your gift'
    );
  }
  return page(
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
      {config.isPending || gifts.isPending ? (
        <>
          <Skeleton height={120} />
          <Skeleton height={120} />
        </>
      ) : gifts.isError && list.length === 0 ? (
        <ErrorState message="Couldn't load your gifts. Check your connection." onRetry={() => void gifts.refetch()} />
      ) : list.length === 0 ? (
        <View style={styles.none}>
          <EmptyState icon={<IconGift size={32} stroke={1.5} color={colors.textSecondary} />} title="No gifts sent yet" subtitle="Give someone a car wash: they get a link that adds it to their Detlio credit." />
          <ScButton variant="outline" fullWidth={false} onPress={() => router.push('/profile/gifts/new' as Href)}>
            Gift a wash
          </ScButton>
        </View>
      ) : (
        <>
          <ScButton variant="main" onPress={() => router.push('/profile/gifts/new' as Href)}>
            Gift a wash
          </ScButton>
          {list.map((gift) => (
            <ScCard key={gift.id} style={styles.card}>
              <View style={styles.top}>
                <View style={styles.thumb}>
                  <PremiumCard spec={giftCardSpec({ design: gift.design, amount: gift.amount, recipientName: gift.recipientName, expiresAt: gift.expiresAt })} size="thumb" animate={false} />
                </View>
                <View style={styles.grow}>
                  <FigureLine size={15} weight={600} lh={20} text={`${giftRupees(gift.amount)} for ${gift.recipientName}`} />
                  {gift.state === 'redeemed' && gift.redeemedAt ? <FigureLine size={12} lh={16} color={colors.textSecondary} text={`Redeemed on ${formatGiftDate(gift.redeemedAt)}`} /> : gift.state === 'available' && gift.expiresAt ? <FigureLine size={12} lh={16} color={colors.textSecondary} text={`Use by ${formatGiftDate(gift.expiresAt)}`} /> : null}
                </View>
                <StatusChip tone={STATE_TONE[gift.state]}>{GIFT_STATE_LABELS[gift.state]}</StatusChip>
              </View>
              {gift.message ? (
                <T size={12} lh={16} numberOfLines={2} color={colors.textSecondary} style={styles.italic}>{`“${gift.message}”`}</T>
              ) : null}
              <T num size={11} lh={15} color={colors.textMuted}>
                {giftEvidenceLine(gift)}
              </T>
              {gift.canMakeLink ? (
                gift.linkMade && confirming === gift.id ? (
                  <View style={styles.confirm}>
                    <T size={12} lh={16}>
                      A new link replaces the old one. Any link you shared before stops working.
                    </T>
                    <View style={styles.pair}>
                      <View style={styles.half}>
                        <ScButton variant="outline" disabled={making === gift.id} onPress={() => setConfirming(null)}>
                          Keep the old link
                        </ScButton>
                      </View>
                      <View style={styles.half}>
                        <ScButton variant="outline" disabled={making === gift.id} onPress={() => void getLink(gift)}>
                          {making === gift.id ? 'Making…' : 'Get a new link'}
                        </ScButton>
                      </View>
                    </View>
                  </View>
                ) : (
                  <ScButton variant="outline" disabled={making === gift.id} onPress={() => (gift.linkMade ? setConfirming(gift.id) : void getLink(gift))}>
                    {making === gift.id ? 'Making…' : gift.linkMade ? 'Get a new link' : 'Get the link'}
                  </ScButton>
                )
              ) : null}
              {linkError?.giftId === gift.id ? (
                <T accessibilityRole="alert" size={12} lh={16} color={colors.error}>
                  {linkError.text}
                </T>
              ) : null}
            </ScCard>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  body: { gap: 16, paddingHorizontal: 16, paddingTop: 16 },
  none: { alignItems: 'center', gap: 16, paddingTop: 48 },
  card: { gap: 8 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 64 },
  grow: { flex: 1, minWidth: 0 },
  italic: { fontStyle: 'italic' },
  confirm: { gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
}));
