import { openInvite, type InviteOpened } from '@repo/core/api/rewards';
import { rewardsEnabled, useClaimInvite, useRewardsConfig } from '@repo/core/api/hooks/use-rewards';
import { rewardRupees } from '@repo/core/rewards';
import { ScButton } from '@repo/native-ui/button';
import { IconStar } from '@repo/native-ui/icons';
import { EmptyState, Skeleton } from '@repo/native-ui/primitives';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, ThemeScope, useColors } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { heldLinkCode } from '@/lib/deep-link';
import { forgetInvite, readStoredInvite, storeInvite } from '@/lib/invite';

/** InviteView (apps/users/components/rewards/invite-view.tsx). The code is held in memory, never in a route. */
export default function InviteScreen() {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const config = useRewardsConfig();
  const on = rewardsEnabled(config.data);
  const claim = useClaimInvite();
  const [code] = useState(() => heldLinkCode.peek('invite'));
  const [invite, setInvite] = useState<InviteOpened | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const claimed = useRef(false);

  useEffect(() => {
    if (!on || invite || !code) return;
    openInvite(code)
      .then((opened) => {
        setInvite(opened);
        if (!readStoredInvite(code)) storeInvite({ code, token: opened.token });
      })
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : "This invite link isn't valid."));
  }, [on, code, invite]);

  useEffect(() => {
    if (!user || !invite || claimed.current || !code) return;
    const stored = readStoredInvite(code);
    claimed.current = true;
    claim.mutate(stored?.token ?? invite.token, {
      onSettled: () => {
        forgetInvite();
        heldLinkCode.clear();
      },
    });
  }, [user, invite, code, claim]);

  const empty = (title: string, subtitle?: string) => (
    <View style={styles.none}>
      <EmptyState icon={<IconStar size={32} stroke={1.5} color={colors.textSecondary} />} title={title} subtitle={subtitle} />
      <ScButton variant="outline" fullWidth={false} onPress={() => router.replace('/garages' as Href)}>
        Find garages
      </ScButton>
    </View>
  );
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title="Detlio" backTo="/home" />
      <View style={styles.body}>
        {!code ? (
          empty("This invite link isn't valid.")
        ) : !config.isPending && !on ? (
          empty("Invites aren't available right now", 'You can still book a wash on Detlio.')
        ) : failed ? (
          empty(failed)
        ) : !invite ? (
          <Skeleton height={220} />
        ) : (
          <ThemeScope scheme="dark">
            <Card invite={invite} signedIn={!!user} claim={claim} />
          </ThemeScope>
        )}
      </View>
    </View>
  );
}

function Card({ invite, signedIn, claim }: { invite: InviteOpened; signedIn: boolean; claim: ReturnType<typeof useClaimInvite> }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} colors={['#1F2026', '#15161A', '#101114']} locations={[0, 0.6, 1]} style={styles.card}>
      <T size={12} lh={16} color={colors.textSecondary}>
        Detlio Rewards
      </T>
      <T size={24} weight={600} lh={30}>{`${invite.referrerFirstName} invited you to Detlio`}</T>
      <FigureLine size={14} lh={20} color={colors.textSecondary} text={`Get ${rewardRupees(invite.amount)} off when your first booking of ${rewardRupees(invite.minAmount)} or more is done. ${invite.referrerFirstName} gets ${rewardRupees(invite.amount)} off too.`} />
      {!signedIn ? (
        <ScButton variant="main" onPress={() => router.push(`/login?next=${encodeURIComponent('/invite')}` as Href)}>
          Sign up to join
        </ScButton>
      ) : claim.isPending ? (
        <T size={13} lh={18} color={colors.textSecondary}>
          Adding the invite to your account…
        </T>
      ) : claim.isSuccess ? (
        <>
          <T size={13} lh={18} color={colors.success}>
            You&apos;re in. Book your first wash to get your reward.
          </T>
          <ScButton variant="main" onPress={() => router.replace('/garages' as Href)}>
            Book a wash
          </ScButton>
        </>
      ) : claim.isError ? (
        <>
          <T size={13} lh={18} color={colors.warning}>
            {claim.error instanceof Error ? claim.error.message : "Couldn't add the invite."}
          </T>
          <ScButton variant="outline" onPress={() => router.replace('/garages' as Href)}>
            Find garages
          </ScButton>
        </>
      ) : null}
      <T size={11} lh={15} color={colors.textMuted}>
        For people new to Detlio. One invite per person.
      </T>
    </LinearGradient>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 24 },
  none: { alignItems: 'center', gap: 16, paddingTop: 48 },
  card: { gap: 12, borderRadius: 18, borderWidth: 1, borderColor: '#2A2A2E', paddingHorizontal: 20, paddingVertical: 24 },
}));
