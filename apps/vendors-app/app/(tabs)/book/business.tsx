import {
  useBookExpenses,
  useBookOwed,
  useBookReminders,
  useBookServices,
  useBookStats,
  useBookStock,
  useBookTeam,
  useMarkMilestoneSeen,
  useMilestone,
} from '@repo/core/api/hooks/use-garage-book';
import type { Milestone } from '@repo/core/api/garage-book';
import { monthName, rupees, teamTileLine } from '@repo/core/garage-book';
import { useT, useTn } from '@repo/core/i18n';
import { useCallback, useState, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Edge, Raised } from '@repo/native-ui/finish';
import {
  IconBell,
  IconCamera,
  IconCards,
  IconChevronRight,
  IconFileInvoice,
  IconLink,
  IconPackage,
  IconQrcode,
  IconReceipt,
  IconSettings,
  IconStar,
  IconTool,
  IconUser,
  IconUsers,
  type IconProps,
} from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { MilestoneCard } from '@/components/book/moments';
import { AMBER, go, IconWell, NewBadge, Overline } from '@/components/book/parts';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import { shareBook } from '@/lib/book-download';

type Tool = { icon: (props: IconProps) => ReactElement; title: string; line: string; href: string; tone?: string; fresh?: boolean };

/**
 * Business (B3; the web's app/book/business/page.tsx, OneBusiness.dc.html). Stages 2 and 3 add
 * Run the garage (Stock, Team, Expenses, Bills) and the booking link, payment details and
 * import; the money tools are the owner's, and staff see Team (no money) and Stock (no prices).
 * A milestone (moment 6) shows once at the top.
 */
function BusinessScreen() {
  const t = useT();
  const tn = useTn();
  const styles = useStyles();
  const colors = useColors();
  const { scheme } = useFinish();
  const isOwner = useIsVendorAdmin();
  const businessName = useAuth((s) => s.vendor?.businessName);
  const garage = businessName ?? t('your garage');
  const now = new Date();
  const stats = useBookStats(undefined, 'all', isOwner);
  const owed = useBookOwed(isOwner);
  const reminders = useBookReminders();
  const services = useBookServices(isOwner);
  const team = useBookTeam(undefined);
  const stock = useBookStock();
  const expenses = useBookExpenses(undefined, isOwner);
  const milestone = useMilestone(isOwner);
  const markSeen = useMarkMilestoneSeen();
  // Kept as first given: marking it seen refreshes the book, and the card stays while the owner is here.
  const [shown, setShown] = useState<Milestone | null>(null);
  if (!shown && milestone.data?.milestone) setShown(milestone.data.milestone);
  const seen = useCallback((key: string) => markSeen.mutate(key), [markSeen.mutate]);
  const [downloading, setDownloading] = useState(false);
  const dueToday = reminders.data?.due.filter((r) => !r.sentAt).length;
  const metal = scheme === 'dark';

  const lowCount = stock.data?.lowCount ?? 0;
  const groups: Array<{ group: string; items: Tool[] }> = [
    {
      group: t('Run the garage'),
      items: [
        {
          icon: IconPackage,
          title: t('Stock'),
          line: stock.data
            ? lowCount > 0
              ? tn(lowCount, '{count} running low', '{count} running low')
              : stock.data.items.length > 0
                ? t('All stocked')
                : t('What you use, counted')
            : ' ',
          href: '/book/stock',
          tone: lowCount > 0 ? AMBER : undefined,
          fresh: true,
        },
        { icon: IconUsers, title: t('Team'), line: team.data ? (team.data.members.length > 0 ? teamTileLine(team.data) : t('Who did each job')) : ' ', href: '/book/team', fresh: true },
        ...(isOwner
          ? [
              {
                icon: IconCards,
                title: t('Expenses'),
                line: expenses.data ? t('{amount} this month', { amount: rupees(expenses.data.spentPaise) ?? '₹0' }) : ' ',
                href: '/book/expenses',
                fresh: true,
              },
              // A bill is made from its job: Jobs, then the job, then Bill.
              { icon: IconFileInvoice, title: t('Bills'), line: t('Send a bill on WhatsApp'), href: '/book/jobs', fresh: true },
            ]
          : []),
      ],
    },
    {
      group: t('Money and customers'),
      items: [
        ...(isOwner
          ? [
              {
                icon: IconReceipt,
                title: t('Money owed'),
                line: owed.data
                  ? owed.data.totalPaise > 0
                    ? `${rupees(owed.data.totalPaise)} · ${tn(owed.data.customers.length, '{count} customer', '{count} customers')}`
                    : t('No one owes you')
                  : ' ',
                href: '/book/owed',
                tone: owed.data && owed.data.totalPaise > 0 ? '#FF8A95' : undefined,
              },
            ]
          : []),
        {
          icon: IconBell,
          title: t('Reminders'),
          line: dueToday === undefined ? ' ' : dueToday > 0 ? t('{count} due today', { count: dueToday }) : t('No one due today'),
          href: '/book/reminders',
          tone: dueToday ? '#F5A524' : undefined,
        },
        ...(isOwner
          ? [
              { icon: IconLink, title: t('Booking link'), line: t('Your own page and QR'), href: '/book/link', fresh: true },
              { icon: IconQrcode, title: t('Payment details'), line: t('Your UPI QR on bills'), href: '/book/payments', fresh: true },
              { icon: IconCamera, title: t('Bring in your book'), line: t('From paper or Excel'), href: '/book/import', fresh: true },
              { icon: IconStar, title: t('Reviews'), line: t('Your rating and replies'), href: '/reviews' },
            ]
          : []),
      ],
    },
    ...(isOwner
      ? [
          {
            group: t('With Detlio'),
            items: [
              { icon: IconReceipt, title: t('Payouts'), line: t('Earnings and payouts'), href: '/earnings' },
              { icon: IconTool, title: t('Services & prices'), line: services.data ? t('{count} services', { count: services.data.filter((s) => !s.isAddon).length }) : ' ', href: '/services' },
            ],
          },
        ]
      : [{ group: t('You'), items: [{ icon: IconUser, title: t('Your account'), line: t('Leave, log out'), href: '/account' }] }]),
  ];

  const download = async () => {
    setDownloading(true);
    try {
      const shared = await shareBook(`${(businessName ?? 'your garage').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-book.xlsx`);
      if (!shared) toast.error(t('This phone can’t share files.'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Couldn't download your book. Try again."));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <BookScreen gap={20}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <T accessibilityRole="header" variant="title">
            {t('Business')}
          </T>
          <T variant="t4" weight={400} color={colors.textSecondary}>{t('Everything to run {garage}', { garage })}</T>
        </View>
        {isOwner ? (
          <PressScale accessibilityRole="button" accessibilityLabel={t('Settings')} onPress={() => go('/settings')}>
            <Raised radius={12} style={styles.square}>
              <IconSettings size={20} metal={metal} />
            </Raised>
          </PressScale>
        ) : null}
      </View>

      {isOwner && shown ? <MilestoneCard milestone={shown} garage={garage} onSeen={seen} /> : null}

      {isOwner ? (
        <PressScale accessibilityRole="link" onPress={() => go('/book/stats')}>
          <Edge radius={22} innerStyle={styles.stats}>
            <View style={styles.flex}>
              <Overline>{t('Stats · {month}', { month: monthName(stats.data?.month ?? now.toISOString().slice(0, 7), now) })}</Overline>
              <T num size={28} weight={600} lh={36}>
                {stats.data ? (rupees(stats.data.takenPaise) ?? '₹0') : '–'}
              </T>
              <T size={12} color={colors.textSecondary}>
                {stats.data?.profitPaise !== null && stats.data?.profitPaise !== undefined && stats.data.spentPaise !== null && stats.data.spentPaise !== undefined
                  ? `${t('Profit {amount}', { amount: rupees(stats.data.profitPaise) ?? '₹0' })} · `
                  : ''}
                {stats.data?.changePercent !== null && stats.data?.changePercent !== undefined
                  ? t('{arrow} {percent}% on last month, same days', {
                      arrow: stats.data.changePercent >= 0 ? '↑' : '↓',
                      percent: Math.abs(stats.data.changePercent),
                    })
                  : t('Your own and Detlio, this month')}
              </T>
            </View>
            {stats.data ? <Spark counts={stats.data.busiestDays} /> : null}
          </Edge>
        </PressScale>
      ) : null}

      {groups.map((group) => (
        <View key={group.group} style={styles.group}>
          <Overline>{group.group}</Overline>
          <View style={styles.grid}>
            {group.items.map((tool) => (
              <PressScale key={tool.title} accessibilityRole="link" onPress={() => go(tool.href)} style={styles.cell}>
                <Edge radius={22} innerStyle={styles.tool}>
                  <View style={styles.toolHead}>
                    <IconWell>
                      <tool.icon size={19} metal={metal} />
                    </IconWell>
                    {tool.fresh ? <NewBadge /> : null}
                  </View>
                  <View>
                    <T variant="t3" weight={600} numberOfLines={2}>
                      {tool.title}
                    </T>
                    <T size={12} color={tool.tone ?? colors.textSecondary} numberOfLines={1}>
                      {tool.line}
                    </T>
                  </View>
                </Edge>
              </PressScale>
            ))}
          </View>
        </View>
      ))}

      {isOwner ? (
        <Pressable accessibilityRole="button" disabled={downloading} onPress={() => void download()}>
          <Raised radius={18} innerStyle={styles.download}>
            <View style={styles.flex}>
              <T variant="t3" weight={600}>
                {downloading ? t('Getting your book…') : t('Download my book')}
              </T>
              <T size={12} color={colors.textSecondary}>
                {t('Customers, jobs and money as Excel')}
              </T>
            </View>
            <IconChevronRight size={20} color={colors.textMuted} />
          </Raised>
        </Pressable>
      ) : null}
    </BookScreen>
  );
}

function Spark({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const points = counts.map((n, i) => [2 + i * 19, 36 - (n / max) * 30] as const);
  const last = points.at(-1) ?? ([116, 6] as const);
  return (
    <Svg width={120} height={40} viewBox="0 0 120 40">
      <Polyline points={points.map((p) => p.join(',')).join(' ')} fill="none" stroke="#FF2D4A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last[0]} cy={last[1]} r={3} fill="#FFFFFF" />
    </Svg>
  );
}

export default garageScreen(BusinessScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  square: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  group: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '48.8%', flexGrow: 1, flexBasis: '45%' },
  tool: { padding: 12, gap: 10 },
  toolHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  download: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
}));
