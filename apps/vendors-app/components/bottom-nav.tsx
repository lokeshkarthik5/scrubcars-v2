import { type Href, router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsVendorAdmin } from '@/lib/auth';
import { colors } from '@/lib/theme';

import { IconCalendar, IconChartBar, IconHome, IconSettings, IconTool, type IconProps } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';

const ITEMS: { href: string; label: string; icon: (props: IconProps) => React.JSX.Element; adminOnly?: boolean }[] = [
  { href: '/home', label: 'Home', icon: IconHome },
  { href: '/bookings', label: 'Bookings', icon: IconCalendar },
  { href: '/services', label: 'Services', icon: IconTool, adminOnly: true },
  { href: '/earnings', label: 'Earnings', icon: IconChartBar, adminOnly: true },
  { href: '/settings', label: 'Settings', icon: IconSettings, adminOnly: true },
];

/** BottomNav, vendor type: an operator gets Home and Bookings. The bar's only red is the dot. */
export function BottomNav() {
  const pathname = usePathname();
  const isAdmin = useIsVendorAdmin();
  const insets = useSafeAreaInsets();
  const items = ITEMS.filter((item) => isAdmin || !item.adminOnly);

  return (
    <View accessibilityRole="tablist" style={[styles.nav, { paddingBottom: Math.max(8, insets.bottom) }]}>
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const tint = active ? colors.textPrimary : colors.textMuted;
        return (
          <Pressable
            key={href}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) router.navigate(href as Href);
            }}
            style={styles.item}
          >
            {active ? <View style={styles.dot} /> : null}
            <Icon size={22} stroke={active ? 2 : 1.5} color={tint} />
            <T size={11} weight={500} lh={16} color={tint}>
              {label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  item: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 4 },
  dot: {
    position: 'absolute',
    top: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brandRed,
  },
});
