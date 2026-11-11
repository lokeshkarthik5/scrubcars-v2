import { useT } from '@repo/core/i18n';
import { Glass, NavOrb, Pearl, usePearlInk } from '@repo/native-ui/finish';
import { IconCalendar, IconHome, IconMap2, IconPlus, IconUser, type IconProps } from '@repo/native-ui/icons';
import { PressScale } from '@repo/native-ui/motion';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router, usePathname } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { HUB_NAV_HREF, hubNavCurrent, type HubNavItem } from '@/lib/hub-nav';

const NAV_HEIGHT = 64;
const NAV_GAP = 20;
const ORB = 30;

/** How much a scrolling screen leaves clear at its end (FLOATING_NAV_CLEARANCE). */
export function useNavClearance() {
  const insets = useSafeAreaInsets();
  return NAV_HEIGHT + NAV_GAP + insets.bottom + 16;
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
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  // maxWidth: a longer Tamil label shrinks to fit rather than widening the tab.
  tab: { minHeight: 48, minWidth: 52, maxWidth: 76, alignItems: 'center', justifyContent: 'center', gap: 2 },
  // Where the 21-point silver icon sits, so an orb and an icon line up across the bar.
  icon: { height: ORB, alignItems: 'center', justifyContent: 'center' },
}));

function Tab({
  item,
  label,
  icon: Icon,
  current,
}: {
  item: HubNavItem;
  label: string;
  icon: (props: IconProps) => ReactElement;
  current: HubNavItem | null;
}) {
  const colors = useColors();
  const styles = useStyles();
  const { fx, scheme } = useFinish();
  const active = current === item;
  // Light keeps the bar's own ink: the brushed metal is drawn for a dark glass bar.
  const silver = scheme === 'dark';
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={() => router.navigate(HUB_NAV_HREF[item] as Href)}
      style={styles.tab}
    >
      {active ? (
        <NavOrb key={item}>
          <Icon size={17} line={1.9} color="#FFFFFF" />
        </NavOrb>
      ) : (
        <View style={styles.icon}>
          <Icon size={21} metal={silver} color={silver ? undefined : fx.quietBright} />
        </View>
      )}
      {/* One line: a longer Tamil label shrinks to fit rather than wrapping out of the pill. */}
      <T variant="t5" weight={active ? 600 : 500} lh={11} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} color={active ? colors.textPrimary : silver ? '#B4B4BC' : fx.quietBright}>
        {label}
      </T>
    </Pressable>
  );
}

/**
 * HubNav (apps/users/components/home/hub-nav.tsx): the floating glass pill, F + H silver
 * (customer UI round, Nov 2026): the tab you are on in a graphite orb with a ring of light,
 * the others brushed silver, the + pearl and never shining. Labels in T5.
 */
export function HubNav() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const ink = usePearlInk();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const guest = useAuth((s) => s.status === 'ready' && s.user === null);
  const current = hubNavCurrent(pathname, { guest });
  const onMap = current === 'map';

  return (
    <>
      {/* The fade, so content scrolling beneath fades out. Off on the map: it'd hide the streets. */}
      {onMap ? null : (
        <LinearGradient pointerEvents="none" colors={[colors.scrimClear, colors.scrim]} style={styles.scrim} />
      )}
      <Glass radius={999} accessibilityRole="tablist" style={[styles.nav, { bottom: Math.max(NAV_GAP, insets.bottom) }]}>
        <View style={styles.row}>
          <Tab item="home" label={t('Home')} icon={IconHome} current={current} />
          <Tab item="map" label={t('Map')} icon={IconMap2} current={current} />
          {/* Where every booking starts. Pearl, not red: a screen's one red is its own main action. */}
          <PressScale accessibilityRole="button" accessibilityLabel={t('New booking')} onPress={() => router.navigate(HUB_NAV_HREF.new as Href)}>
            <Pearl size={48}>
              <IconPlus size={20} color={ink} />
            </Pearl>
          </PressScale>
          <Tab item="bookings" label={t('Bookings')} icon={IconCalendar} current={current} />
          <Tab item="profile" label={t('Profile')} icon={IconUser} current={current} />
        </View>
      </Glass>
    </>
  );
}
