import type { HomeActionCard } from '@repo/core/api/home';
import { useDismissNotice, useDismissReviewPrompt, useMarkUpdatesSeen, useUpdates } from '@repo/core/api/hooks/use-home';
import { groupUpdates } from '@repo/core/home-display';
import { useT } from '@repo/core/i18n';
import { IconArrowLeft } from '@repo/native-ui/icons';
import { ErrorState, HubCard, Skeleton } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BillDueCard, ExtraWorkHomeCard, GarageClosedCard, RateWashCard, TimeProposalHomeCard } from '@/components/home/action-cards';
import { UpdateRow } from '@/components/home/updates-block';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';

function GroupLabel({ children }: { children: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <T size={13} weight={500} lh={18} color={colors.dim} style={styles.group}>
      {children}
    </T>
  );
}

/** UpdatesScreen (apps/users/components/home/updates-screen.tsx). */
export default function UpdatesScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const updates = useUpdates();
  const markSeen = useMarkUpdatesSeen();
  const dismissNotice = useDismissNotice();
  const dismissRate = useDismissReviewPrompt();
  const [cleared, setCleared] = useState(false);
  const [pulling, setPulling] = useState(false);
  const markedAt = useRef<string | null>(null);
  const data = updates.data;
  const anyUnread = !!data && (data.items.some((item) => item.unread) || !!data.pinnedNotice?.unread);
  useRefreshOnFocus(['home', 'updates']);

  useEffect(() => {
    if (!data || !anyUnread || markedAt.current === data.now) return;
    markedAt.current = data.now;
    markSeen.mutate(data.now);
  }, [data, anyUnread, markSeen]);

  const now = data ? new Date(data.now) : null;
  const unread = (value: boolean) => value && !cleared;

  const todoCard = (card: HomeActionCard) => {
    switch (card.kind) {
      case 'time_proposal':
        return <TimeProposalHomeCard key={card.proposalId} card={card} />;
      case 'extra_work_due':
        return <ExtraWorkHomeCard key={card.chargeId} card={card} now={now!} />;
      case 'bill_due':
        return <BillDueCard key={card.chargeId} card={card} now={now!} />;
      case 'garage_closed':
        return <GarageClosedCard key={card.bookingId} card={card} />;
      case 'rate':
        return <RateWashCard key={card.bookingId} card={card} dismissing={dismissRate.isPending} onDismiss={() => dismissRate.mutate(card.bookingId)} />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={() => {
              setPulling(true);
              void updates.refetch().finally(() => setPulling(false));
            }}
          />
        }
      >
        <View style={styles.top}>
          <Pressable accessibilityRole="link" accessibilityLabel={t('Back to Home')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home' as Href))} style={styles.back}>
            <IconArrowLeft size={22} stroke={1.5} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!data || !anyUnread || cleared}
            onPress={() => {
              setCleared(true);
              if (data && markedAt.current !== data.now) {
                markedAt.current = data.now;
                markSeen.mutate(data.now);
              }
            }}
            style={styles.mark}
          >
            <T size={13} weight={500} lh={18} color={!data || !anyUnread || cleared ? colors.textMuted : colors.textPrimary}>
              {t('Mark all read')}
            </T>
          </Pressable>
        </View>
        <T accessibilityRole="header" variant="title" style={styles.title}>
          {t('Updates')}
        </T>
        {updates.isPending ? (
          <View style={styles.stack}>
            <Skeleton height={124} radius={28} />
            <Skeleton height={124} radius={28} />
          </View>
        ) : !data || !now ? (
          <ErrorState message={t("Couldn't load your updates. Check your connection.")} onRetry={() => void updates.refetch()} />
        ) : (
          <>
            {data.todo.length > 0 ? (
              <View>
                <GroupLabel>{t('To do')}</GroupLabel>
                <View style={styles.stack}>{data.todo.map(todoCard)}</View>
              </View>
            ) : null}
            {data.pinnedNotice ? (
              <HubCard radius={22} style={styles.list}>
                <UpdateRow
                  first
                  pinned
                  now={now}
                  row={{
                    kind: 'notice',
                    title: data.pinnedNotice.title,
                    body: data.pinnedNotice.body,
                    at: data.pinnedNotice.startsAt,
                    unread: unread(data.pinnedNotice.unread),
                    bookingId: null,
                    from: t('Detlio team'),
                    linkUrl: data.pinnedNotice.linkUrl,
                    linkLabel: data.pinnedNotice.linkLabel,
                  }}
                  onDismiss={() => dismissNotice.mutate(data.pinnedNotice!.id)}
                />
              </HubCard>
            ) : null}
            {groupUpdates(data.items, now).map((group) => (
              <View key={group.name}>
                <GroupLabel>{t(group.name)}</GroupLabel>
                <HubCard radius={22} style={styles.list}>
                  {group.items.map((item, index) => (
                    <UpdateRow
                      key={item.id}
                      first={index === 0}
                      now={now}
                      row={{ ...item, unread: unread(item.unread), from: item.kind === 'notice' ? t('Detlio team') : null }}
                      onDismiss={item.noticeId ? () => dismissNotice.mutate(item.noticeId!) : undefined}
                    />
                  ))}
                </HubCard>
              </View>
            ))}
            <T size={13} lh={18} color={colors.dim} align="center">
              {data.items.length === 0 && data.todo.length === 0 && !data.pinnedNotice ? t('Nothing yet. Your bookings, bills and notes from the Detlio team will show here.') : t('The last 30 days.')}
            </T>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { paddingHorizontal: 16, gap: 16 },
  top: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { height: 44, width: 44, marginLeft: -8, alignItems: 'center', justifyContent: 'center' },
  mark: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  title: { paddingHorizontal: 4 },
  group: { marginBottom: 8, paddingHorizontal: 4 },
  stack: { gap: 8 },
  list: { paddingVertical: 0 },
}));
