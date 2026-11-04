import { useCreateInvite } from '@repo/core/api/hooks/use-rewards';
import type { MyRewards } from '@repo/core/api/rewards';
import { rewardRupees } from '@repo/core/rewards';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconCopy, IconShare } from '@repo/native-ui/icons';
import { ScCard } from '@repo/native-ui/primitives';
import { FigureLine, T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import * as Clipboard from 'expo-clipboard';
import { Share, View } from 'react-native';

const WEB = 'https://detlio.com';

/** InviteCard: the customer's own link, shared from their phone. Detlio sends nothing itself. */
export function InviteCard({ invite }: { invite: MyRewards['invite'] }) {
  const colors = useColors();
  const styles = useStyles();
  const create = useCreateInvite();
  const code = invite.code ?? create.data?.code ?? null;
  const url = code ? `${WEB}/invite/${code}` : null;
  const left = Math.max(0, invite.maxPerYear - invite.rewardedThisYear);
  const copy = async () => {
    if (!url) return;
    try {
      await Clipboard.setStringAsync(url);
      toast.success('Link copied');
    } catch {
      toast.info("Couldn't copy the link. Press and hold it to copy it instead.");
    }
  };
  const share = () => {
    if (!url) return;
    Share.share({ title: 'Detlio', message: `Book your car wash on Detlio and get ${rewardRupees(invite.amount)} off your first booking: ${url}` }).catch(() => undefined);
  };
  return (
    <ScCard style={styles.card}>
      <View>
        <T size={14} weight={600} lh={20}>
          Invite a friend
        </T>
        <FigureLine size={13} lh={18} color={colors.textSecondary} text={`You both get ${rewardRupees(invite.amount)} off when their first booking of ${rewardRupees(invite.minAmount)} or more is done.`} />
      </View>
      {url ? (
        <>
          <View style={styles.url}>
            <T num selectable size={13} lh={18} numberOfLines={1}>
              {url}
            </T>
          </View>
          <View style={styles.pair}>
            <View style={styles.half}>
              <ScButton variant="outline" onPress={share}>
                <IconShare size={16} color={colors.textPrimary} />
                <Label>Share</Label>
              </ScButton>
            </View>
            <View style={styles.half}>
              <ScButton variant="outline" onPress={() => void copy()}>
                <IconCopy size={16} color={colors.textPrimary} />
                <Label>Copy link</Label>
              </ScButton>
            </View>
          </View>
        </>
      ) : (
        <ScButton variant="outline" disabled={create.isPending} onPress={() => create.mutate()}>
          {create.isPending ? 'Making your link…' : 'Get your invite link'}
        </ScButton>
      )}
      <FigureLine size={11} lh={15} color={colors.textMuted} text={`${invite.rewardedThisYear} rewarded this year (up to ${invite.maxPerYear}; ${left} left)${invite.pending > 0 ? ` · ${invite.pending} waiting for a first booking` : ''}. For people new to Detlio only.`} />
    </ScCard>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: 12, paddingVertical: 16 },
  url: { borderRadius: 10, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
}));
