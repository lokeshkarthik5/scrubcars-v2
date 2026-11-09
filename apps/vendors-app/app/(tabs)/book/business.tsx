import { useBookOwed, useBookReminders, useBookServices, useBookStats } from '@repo/core/api/hooks/use-garage-book';
import { monthName, rupees } from '@repo/core/garage-book';
import { useState, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Edge, Raised } from '@repo/native-ui/finish';
import {
  IconBell,
  IconChevronRight,
  IconReceipt,
  IconSettings,
  IconStar,
  IconTool,
  IconUser,
  type IconProps,
} from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { go, IconWell, Overline } from '@/components/book/parts';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import { shareBook } from '@/lib/book-download';

type Tool = { icon: (props: IconProps) => ReactElement; title: string; line: string; href: string; tone?: string };

/** Business (B3; the web's app/book/business/page.tsx). Stage 2 and 3 tools stay hidden. */
function BusinessScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { scheme } = useFinish();
  const isOwner = useIsVendorAdmin();
  const garage = useAuth((s) => s.vendor?.businessName) ?? 'your garage';
  const now = new Date();
  const stats = useBookStats(undefined, 'all', isOwner);
  const owed = useBookOwed(isOwner);
  const reminders = useBookReminders();
  const services = useBookServices(isOwner);
  const [downloading, setDownloading] = useState(false);
  const dueToday = reminders.data?.due.filter((r) => !r.sentAt).length;
  const metal = scheme === 'dark';

  const groups: Array<{ group: string; items: Tool[] }> = [
    {
      group: 'Money and customers',
      items: [
        ...(isOwner
          ? [
              {
                icon: IconReceipt,
                title: 'Money owed',
                line: owed.data
                  ? owed.data.totalPaise > 0
                    ? `${rupees(owed.data.totalPaise)} · ${owed.data.customers.length} ${owed.data.customers.length === 1 ? 'customer' : 'customers'}`
                    : 'No one owes you'
                  : ' ',
                href: '/book/owed',
                tone: owed.data && owed.data.totalPaise > 0 ? '#FF8A95' : undefined,
              },
            ]
          : []),
        {
          icon: IconBell,
          title: 'Reminders',
          line: dueToday === undefined ? ' ' : dueToday > 0 ? `${dueToday} due today` : 'No one due today',
          href: '/book/reminders',
          tone: dueToday ? '#F5A524' : undefined,
        },
        ...(isOwner ? [{ icon: IconStar, title: 'Reviews', line: 'Your rating and replies', href: '/reviews' }] : []),
      ],
    },
    ...(isOwner
      ? [
          {
            group: 'With Detlio',
            items: [
              { icon: IconReceipt, title: 'Payouts', line: 'Earnings and payouts', href: '/earnings' },
              { icon: IconTool, title: 'Services & prices', line: services.data ? `${services.data.filter((s) => !s.isAddon).length} services` : ' ', href: '/services' },
            ],
          },
        ]
      : [{ group: 'You', items: [{ icon: IconUser, title: 'Your account', line: 'Leave, log out', href: '/account' }] }]),
  ];

  const download = async () => {
    setDownloading(true);
    try {
      const shared = await shareBook(`${garage.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-book.xlsx`);
      if (!shared) toast.error('This phone can’t share files.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't download your book. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <BookScreen gap={20}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <T accessibilityRole="header" variant="title">
            Business
          </T>
          <T variant="t4" weight={400} color={colors.textSecondary}>{`Everything to run ${garage}`}</T>
        </View>
        {isOwner ? (
          <PressScale accessibilityRole="button" accessibilityLabel="Settings" onPress={() => go('/settings')}>
            <Raised radius={12} style={styles.square}>
              <IconSettings size={20} metal={metal} />
            </Raised>
          </PressScale>
        ) : null}
      </View>

      {isOwner ? (
        <PressScale accessibilityRole="link" onPress={() => go('/book/stats')}>
          <Edge radius={22} innerStyle={styles.stats}>
            <View style={styles.flex}>
              <Overline>{`Stats · ${monthName(stats.data?.month ?? now.toISOString().slice(0, 7), now)}`}</Overline>
              <T num size={28} weight={600} lh={36}>
                {stats.data ? (rupees(stats.data.takenPaise) ?? '₹0') : '–'}
              </T>
              <T size={12} color={colors.textSecondary}>
                {stats.data?.changePercent !== null && stats.data?.changePercent !== undefined
                  ? `${stats.data.changePercent >= 0 ? '↑' : '↓'} ${Math.abs(stats.data.changePercent)}% on last month, same days`
                  : 'Your own and Detlio, this month'}
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
                  <IconWell>
                    <tool.icon size={19} metal={metal} />
                  </IconWell>
                  <View>
                    <T variant="t3" weight={600}>
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
                {downloading ? 'Getting your book…' : 'Download my book'}
              </T>
              <T size={12} color={colors.textSecondary}>
                Customers, jobs and money as Excel
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
  download: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
}));
