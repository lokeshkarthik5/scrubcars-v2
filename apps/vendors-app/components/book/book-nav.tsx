import { type Href, router, usePathname } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { Glass, NavOrb, Pearl, usePearlInk } from '@repo/native-ui/finish';
import { IconCalendar, IconHome, IconLayoutGrid, IconPlus, IconUsers, type IconProps } from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { msg, useT } from '@repo/core/i18n';

type Place = 'home' | 'jobs' | 'customers' | 'business';

const NAV_HEIGHT = 64;
const NAV_GAP = 20;

const under = (path: string, route: string) => path === route || path.startsWith(`${route}/`);

/** Which tab is lit (the web's bookPlace). Today's Services, Earnings and Settings live under Business. */
export function bookPlace(path: string | null): Place | null {
  if (!path) return null;
  if (under(path, '/home')) return 'home';
  if (under(path, '/book/jobs') || under(path, '/book/bill') || under(path, '/bookings')) return 'jobs';
  if (under(path, '/book/customers') || under(path, '/book/reminders')) return 'customers';
  if (
    [
      '/book/business',
      '/book/stats',
      '/book/owed',
      '/book/team',
      '/book/expenses',
      '/book/link',
      '/book/payments',
      '/book/import',
      '/book/stock',
      '/services',
      '/earnings',
      '/settings',
      '/reviews',
      '/photos',
      '/requests',
      '/guarantee',
      '/agreement',
      '/account',
    ].some((route) => under(path, route))
  ) {
    return 'business';
  }
  return null;
}

function Tab({
  place,
  href,
  label,
  icon: Icon,
  current,
}: {
  place: Place;
  href: string;
  label: string;
  icon: (props: IconProps) => ReactElement;
  current: Place | null;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { fx, scheme } = useFinish();
  const active = current === place;
  const silver = scheme === 'dark';
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={t(label)}
      accessibilityState={{ selected: active }}
      onPress={() => {
        if (!active) router.navigate(href as Href);
      }}
      style={styles.tab}
    >
      {active ? (
        <NavOrb key={place}>
          <Icon size={17} line={1.9} color="#FFFFFF" />
        </NavOrb>
      ) : (
        <View style={styles.icon}>
          <Icon size={21} metal={silver} color={silver ? undefined : fx.quietBright} />
        </View>
      )}
      <T variant="t5" numberOfLines={1} weight={active ? 600 : 500} lh={11} color={active ? colors.textPrimary : silver ? '#B4B4BC' : fx.quietBright}>
        {t(label)}
      </T>
    </Pressable>
  );
}

/**
 * Garage Book's bar (the web's components/book/book-nav.tsx): Home · Jobs · + · Customers ·
 * Business on a floating glass pill; the lit tab in the graphite orb with its ring of light
 * (F), the others brushed silver (H); the pearl + adds a walk-in.
 */
export function BookNav() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const ink = usePearlInk();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const current = bookPlace(pathname);
  return (
    <>
      <LinearGradient pointerEvents="none" colors={[colors.scrimClear, colors.scrim]} style={styles.scrim} />
      <Glass radius={999} accessibilityRole="tablist" style={[styles.nav, { bottom: Math.max(NAV_GAP, insets.bottom) }]}>
        <View style={styles.row}>
          <Tab place="home" href="/home" label={msg('Home')} icon={IconHome} current={current} />
          <Tab place="jobs" href="/book/jobs" label={msg('Jobs')} icon={IconCalendar} current={current} />
          <PressScale accessibilityRole="button" accessibilityLabel={t('Add a walk-in job')} onPress={() => router.push('/book/new' as Href)}>
            <Pearl size={48}>
              <IconPlus size={20} color={ink} />
            </Pearl>
          </PressScale>
          <Tab place="customers" href="/book/customers" label={msg('Customers')} icon={IconUsers} current={current} />
          <Tab place="business" href="/book/business" label={msg('Business')} icon={IconLayoutGrid} current={current} />
        </View>
      </Glass>
    </>
  );
}

const useStyles = createStyles((c) => ({
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 },
  nav: {
    position: 'absolute',
    alignSelf: 'center',
    width: 340,
    maxWidth: '91%',
    height: NAV_HEIGHT,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: c.navShadowOpacity * 0.6,
    shadowRadius: 18,
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  // maxWidth: a longer Tamil label ends in an ellipsis rather than widening the tab.
  tab: { minHeight: 48, minWidth: 52, maxWidth: 68, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon: { height: 30, alignItems: 'center', justifyContent: 'center' },
}));
