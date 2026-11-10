import { useDismissNotice } from '@repo/core/api/hooks/use-home';
import type { HomeData, UpdateKind } from '@repo/core/api/home';
import { updateTimeLabel } from '@repo/core/home-display';
import {
  IconArrowUpRight,
  IconBell,
  IconBuildingStore,
  IconCalendarCheck,
  IconCalendarQuestion,
  IconCalendarRepeat,
  IconCalendarX,
  IconCar,
  IconCircleCheck,
  IconClock,
  IconFileInvoice,
  IconGift,
  IconMessageCheck,
  IconMessageDots,
  IconMessageX,
  IconPhoto,
  IconPlayerPause,
  IconReceipt,
  IconReceiptRefund,
  IconShieldCheck,
  IconShieldX,
  IconSparkles,
  IconSpeakerphone,
  IconStar,
  IconTool,
  IconToolsOff,
  IconTruckDelivery,
  IconX,
  type IconProps,
} from '@repo/native-ui/icons';
import { Disc, HubCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import type { ReactElement } from 'react';

import { rewriteSystemPath } from '@/lib/deep-link';
import { UnreadLight } from '@/components/moments/unread-light';

const KIND_ICONS: Record<UpdateKind, (props: IconProps) => ReactElement> = {
  notice: IconSpeakerphone,
  accepted: IconCalendarCheck,
  reminder: IconClock,
  started: IconTool,
  completed: IconCircleCheck,
  photos: IconPhoto,
  bill_due: IconReceipt,
  bill_not_needed: IconReceipt,
  bill_paid: IconReceipt,
  receipt_ready: IconFileInvoice,
  declined: IconCalendarX,
  cancelled: IconCalendarX,
  refunded: IconReceiptRefund,
  moved: IconCalendarRepeat,
  garage_paused: IconPlayerPause,
  complaint_acknowledged: IconMessageDots,
  complaint_resolved: IconMessageCheck,
  complaint_closed: IconMessageX,
  picked_up: IconCar,
  at_garage: IconBuildingStore,
  out_for_delivery: IconTruckDelivery,
  time_proposal: IconCalendarQuestion,
  extra_work_due: IconTool,
  extra_work_paid: IconTool,
  extra_work_declined: IconToolsOff,
  extra_work_withdrawn: IconToolsOff,
  service_reminder: IconSparkles,
  slot_opened: IconBell,
  report_reward: IconGift,
  redo_claim: IconShieldCheck,
  redo_approved: IconShieldCheck,
  redo_refund: IconReceiptRefund,
  redo_not_approved: IconShieldX,
  redo_closed: IconShieldX,
  reward_card: IconStar,
  reward_voucher: IconGift,
  reward_nudge: IconStar,
};

export interface UpdateRowData {
  kind: UpdateKind;
  title: string;
  body: string | null;
  at: string;
  unread: boolean;
  bookingId: string | null;
  from?: string | null;
  linkUrl?: string | null;
  linkLabel?: string | null;
}

/** UpdateRow: shared with Updates when stage 3 builds it. */
export function UpdateRow({
  row,
  now,
  pinned = false,
  first = false,
  onDismiss,
}: {
  row: UpdateRowData;
  now: Date;
  pinned?: boolean;
  first?: boolean;
  onDismiss?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const Icon = KIND_ICONS[row.kind] ?? IconBell;
  const when = updateTimeLabel(row.at, now).replace(/\b(AM|PM)\b/g, (m) => m.toLowerCase());
  const meta = [row.from, row.body, when].filter(Boolean).join(' · ');
  const href = row.linkUrl ?? (row.bookingId ? `/bookings/${row.bookingId}` : null);
  const external = !!row.linkUrl && row.linkUrl.startsWith('https://');
  const open = () => {
    if (!href) return;
    if (external) void Linking.openURL(href);
    else router.push(rewriteSystemPath(href) as Href);
  };
  return (
    <View style={styles.row}>
      {first ? null : <View style={styles.hairline} />}
      <Pressable accessibilityRole={href ? 'link' : undefined} disabled={!href} onPress={open} style={styles.main}>
        <Disc strong={pinned}>
          <Icon size={20} stroke={1.5} />
        </Disc>
        <View style={styles.words}>
          <T size={17} lh={22} tracking={-0.012} numberOfLines={2} color={row.unread ? colors.textPrimary : colors.textRead}>
            {row.title}
          </T>
          {meta ? (
            <T size={13} numberOfLines={2} color={colors.dim} style={styles.meta}>
              {meta}
            </T>
          ) : null}
          {row.linkUrl && row.linkLabel ? (
            <View style={styles.link}>
              <T size={13} weight={500}>
                {row.linkLabel}
              </T>
              <IconArrowUpRight size={14} stroke={1.6} />
            </View>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.side}>
        {row.unread ? <UnreadLight /> : null}
        {onDismiss ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Hide notice: ${row.title}`} onPress={onDismiss} style={styles.x}>
            <IconX size={18} stroke={1.5} color={colors.dim} />
          </Pressable>
        ) : null}
        {!row.unread && !onDismiss ? <View style={styles.pad} /> : null}
      </View>
    </View>
  );
}

/** UpdatesBlock: the pinned notice, then the newest two rows, then See all. */
export function UpdatesBlock({ updates, now }: { updates: NonNullable<HomeData['updates']>; now: Date }) {
  const colors = useColors();
  const styles = useStyles();
  const dismiss = useDismissNotice();
  const { pinnedNotice, items } = updates;
  if (!pinnedNotice && items.length === 0) return null;
  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <T accessibilityRole="header" size={17} weight={500} tracking={-0.012}>
          Updates
        </T>
        <Pressable accessibilityRole="link" hitSlop={12} onPress={() => router.push('/updates' as Href)}>
          <T size={15} color={colors.textSoft}>
            See all
          </T>
        </Pressable>
      </View>
      <HubCard accessibilityLabel="Latest updates" style={styles.list}>
        {pinnedNotice ? (
          <UpdateRow
            pinned
            first
            now={now}
            row={{
              kind: 'notice',
              title: pinnedNotice.title,
              body: pinnedNotice.body,
              at: pinnedNotice.startsAt,
              unread: false,
              bookingId: null,
              from: 'Detlio team',
              linkUrl: pinnedNotice.linkUrl,
              linkLabel: pinnedNotice.linkLabel,
            }}
            onDismiss={() => dismiss.mutate(pinnedNotice.id)}
          />
        ) : null}
        {items.map((item, i) => (
          <UpdateRow
            key={item.id}
            first={i === 0 && !pinnedNotice}
            now={now}
            row={{ ...item, from: item.kind === 'notice' ? 'Detlio team' : null }}
            onDismiss={item.noticeId ? () => dismiss.mutate(item.noticeId!) : undefined}
          />
        ))}
      </HubCard>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  block: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 16 },
  list: { paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 8 },
  hairline: { position: 'absolute', top: 0, left: 70, right: 18, height: 1, backgroundColor: c.line },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 16, paddingLeft: 16 },
  words: { flex: 1, minWidth: 0 },
  meta: { marginTop: 4 },
  link: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  side: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 13, flexShrink: 0 },
  dot: { marginTop: 9, marginRight: 8, width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.red },
  x: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pad: { width: 8 },
}));
