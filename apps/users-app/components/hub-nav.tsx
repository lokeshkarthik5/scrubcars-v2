import { IconCalendar, IconHome, IconMap2, IconPlus, IconUser, type IconProps } from '@repo/native-ui/icons';
import { PressRow } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router, usePathname } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { HUB_NAV_HREF, hubNavCurrent, type HubNavItem } from '@/lib/hub-nav';

const NAV_HEIGHT = 64;
const NAV_GAP = 20;

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.navBorder,
    backgroundColor: c.navBg,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: c.navShadowOpacity,
    shadowRadius: 20,
  },
  tab: { minHeight: 48, minWidth: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  plus: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.plusBg,
  },
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
  const active = current === item;
  const tint = active ? colors.textPrimary : colors.dim;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={() => router.navigate(HUB_NAV_HREF[item] as Href)}
      style={styles.tab}
    >
      <Icon size={21} stroke={active ? 1.8 : 1.5} color={tint} />
      <T size={11} lh={11} weight={active ? 500 : 400} color={tint}>
        {label}
      </T>
    </Pressable>
  );
}

/** HubNav (apps/users/components/home/hub-nav.tsx): the floating pill, with its white +. */
export function HubNav() {
  const colors = useColors();
  const styles = useStyles();
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
      <View accessibilityRole="tablist" style={[styles.nav, { bottom: Math.max(NAV_GAP, insets.bottom) }]}>
        <Tab item="home" label="Home" icon={IconHome} current={current} />
        <Tab item="map" label="Map" icon={IconMap2} current={current} />
        <PressRow
          accessibilityLabel="New booking"
          onPress={() => router.navigate(HUB_NAV_HREF.new as Href)}
          style={styles.plus}
        >
          <IconPlus size={20} stroke={1.75} color={colors.plusText} />
        </PressRow>
        <Tab item="bookings" label="Bookings" icon={IconCalendar} current={current} />
        <Tab item="profile" label="Profile" icon={IconUser} current={current} />
      </View>
    </>
  );
}
