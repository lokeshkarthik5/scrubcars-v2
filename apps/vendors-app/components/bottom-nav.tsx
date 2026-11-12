import { LinearGradient } from 'expo-linear-gradient';
import { type Href, router, usePathname } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsVendorAdmin } from '@/lib/auth';
import { Glass, NavOrb } from '@repo/native-ui/finish';
import { IconCalendar, IconChartBar, IconHome, IconSettings, IconTool, type IconProps } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors, useFinish } from '@repo/native-ui/theme';
import { msg, useT } from '@repo/core/i18n';

const ITEMS: { href: string; label: string; icon: (props: IconProps) => ReactElement; adminOnly?: boolean }[] = [
  { href: '/home', label: msg('Home'), icon: IconHome },
  { href: '/bookings', label: msg('Bookings'), icon: IconCalendar },
  { href: '/services', label: msg('Services'), icon: IconTool, adminOnly: true },
  { href: '/earnings', label: msg('Earnings'), icon: IconChartBar, adminOnly: true },
  { href: '/settings', label: msg('Settings'), icon: IconSettings, adminOnly: true },
];

const NAV_HEIGHT = 64;
const NAV_GAP = 20;
// The orb's size, where the 21-point silver icon sits too, so the two line up.
const ICON_BOX = 30;

/** How much a scrolling screen leaves clear at its end (the web's FLOATING_NAV_CLEARANCE). */
export function useNavClearance() {
  const insets = useSafeAreaInsets();
  return NAV_HEIGHT + NAV_GAP + insets.bottom + 16;
}

/**
 * BottomNav (packages/ui/src/sc/garage-nav.tsx): the garage's tabs on the customer app's
 * floating glass pill (owner, 10 Nov 2026: "Yes, restyle them"), the same order and
 * places as before; an operator gets Home and Bookings. The tab you are on sits in the
 * graphite orb with its ring of light (popping in once, simply there under Reduce Motion), the
 * others are brushed silver, each labelled in T5. No pearl +: the garage has no action
 * that belongs in the bar.
 */
export function BottomNav() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const { fx, scheme } = useFinish();
  const pathname = usePathname();
  const isAdmin = useIsVendorAdmin();
  const insets = useSafeAreaInsets();
  const items = ITEMS.filter((item) => isAdmin || !item.adminOnly);
  // Light keeps the bar's own ink: the brushed metal is drawn for a dark glass bar.
  const silver = scheme === 'dark';

  return (
    <>
      {/* The fade, so content scrolling beneath the pill fades out. */}
      <LinearGradient pointerEvents="none" colors={[colors.scrimClear, colors.scrim]} style={styles.scrim} />
      <Glass
        radius={999}
        accessibilityRole="tablist"
        style={[
          styles.nav,
          // Five tabs fill the width as the web's do; an operator's two sit in a shorter pill.
          { bottom: Math.max(NAV_GAP, insets.bottom), width: items.length * 76 + 16 },
        ]}
      >
        <View style={styles.row}>
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Pressable
                key={href}
                accessibilityRole="tab"
                accessibilityLabel={t(label)}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (!active) router.navigate(href as Href);
                }}
                style={styles.tab}
              >
                {active ? (
                  <NavOrb key={href}>
                    <Icon size={17} line={1.9} color="#FFFFFF" />
                  </NavOrb>
                ) : (
                  <View style={styles.icon}>
                    <Icon size={21} line={1.6} metal={silver} color={silver ? undefined : fx.quietBright} />
                  </View>
                )}
                {/* Tamil is longer: one line, shrunk to fit its fifth of the pill. */}
                <T
                  variant="t5"
                  weight={active ? 600 : 500}
                  lh={11}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  color={active ? colors.textPrimary : silver ? '#B4B4BC' : fx.quietBright}
                >
                  {t(label)}
                </T>
              </Pressable>
            );
          })}
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
    maxWidth: '91%',
    height: NAV_HEIGHT,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: c.navShadowOpacity * 0.6,
    shadowRadius: 18,
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon: { height: ICON_BOX, alignItems: 'center', justifyContent: 'center' },
}));
