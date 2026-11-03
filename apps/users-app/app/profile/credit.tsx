import { giftsEnabled, useGiftsConfig, useMyCredit } from '@repo/core/api/hooks/use-gifts';
import { ScButton } from '@repo/native-ui/button';
import { IconChevronRight } from '@repo/native-ui/icons';
import { ErrorState, PressRow, ScCard, Skeleton } from '@repo/native-ui/primitives';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GiftsUnavailable } from '@/components/gifts/gifts-unavailable';
import { RedeemCodeBox } from '@/components/gifts/redeem-code-box';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { formatGiftDate, giftRupees, signedRupees } from '@/lib/gifts';

/** apps/users/app/profile/credit/page.tsx. */
export default function CreditScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const config = useGiftsConfig();
  const on = giftsEnabled(config.data);
  const credit = useMyCredit(on && !!user);
  const view = credit.data;
  const soon = view ? Number(view.expiringSoon) : 0;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title="Detlio credit" backTo="/profile" />
      {!user ? (
        <View style={styles.center}>
          <T size={15} weight={600} align="center">
            Sign in to see your Detlio credit
          </T>
          <ScButton variant="main" fullWidth={false} paddingX={32} onPress={() => router.push(`/login?next=${encodeURIComponent('/profile/credit')}` as Href)}>
            Sign in
          </ScButton>
        </View>
      ) : !config.isPending && !on ? (
        <GiftsUnavailable />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          {config.isPending || credit.isPending ? (
            <>
              <Skeleton height={120} />
              <Skeleton height={120} />
            </>
          ) : credit.isError || !view ? (
            <ErrorState message="Couldn't load your credit. Check your connection." onRetry={() => void credit.refetch()} />
          ) : (
            <>
              <ScCard style={styles.balance}>
                <T size={12} lh={16} color={colors.textSecondary}>
                  Balance
                </T>
                <T num size={40} weight={700} lh={44} tracking={-0.025}>
                  {giftRupees(view.balance)}
                </T>
                {view.nextExpiry ? <FigureLine size={12} lh={16} color={colors.textSecondary} text={`${giftRupees(view.nextExpiry.amount)} expires on ${formatGiftDate(view.nextExpiry.at)}`} /> : null}
                {soon > 0 ? <FigureLine size={12} lh={16} color={colors.warning} text={`${giftRupees(soon)} expires in the next 30 days`} /> : null}
                <T size={11} lh={15} color={colors.textMuted} style={styles.mt8}>
                  Used on your next booking at checkout, after any coupon. You can turn it off there.
                </T>
              </ScCard>
              <RedeemCodeBox />
              <PressRow onPress={() => router.push('/profile/gifts/new' as Href)}>
                <ScCard style={styles.row}>
                  <T size={13} lh={18}>
                    Gift a wash
                  </T>
                  <IconChevronRight size={16} color={colors.textMuted} />
                </ScCard>
              </PressRow>
              <View style={styles.section}>
                <T size={14} weight={600} lh={20}>
                  History
                </T>
                {view.entries.length === 0 ? (
                  <ScCard>
                    <T size={12} lh={16} color={colors.textSecondary}>
                      Nothing yet. A gift you redeem shows here.
                    </T>
                  </ScCard>
                ) : (
                  <ScCard style={styles.list}>
                    {view.entries.map((entry, i) => {
                      const amount = Number(entry.amount);
                      const body = (
                        <>
                          <View style={styles.grow}>
                            <T size={13} lh={18}>
                              {entry.label}
                            </T>
                            <T num size={11} lh={15} color={colors.textMuted}>
                              {formatGiftDate(entry.at)}
                            </T>
                          </View>
                          <T num size={13} weight={500} lh={18} color={amount > 0 ? colors.success : colors.textPrimary}>
                            {signedRupees(entry.amount)}
                          </T>
                        </>
                      );
                      return entry.bookingId ? (
                        <Pressable key={entry.id} accessibilityRole="link" onPress={() => router.push(`/bookings/${entry.bookingId}` as Href)} style={[styles.entry, i > 0 && styles.line]}>
                          {body}
                        </Pressable>
                      ) : (
                        <View key={entry.id} style={[styles.entry, i > 0 && styles.line]}>
                          {body}
                        </View>
                      );
                    })}
                  </ScCard>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  body: { gap: 16, paddingHorizontal: 16, paddingTop: 16 },
  balance: { gap: 4, paddingVertical: 16 },
  mt8: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { gap: 8 },
  list: { paddingHorizontal: 0, paddingVertical: 4 },
  entry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  line: { borderTopWidth: 1, borderTopColor: c.border },
  grow: { flex: 1, minWidth: 0 },
}));
