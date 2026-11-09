import { type Href, router, usePathname } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsVendorAdmin } from '@/lib/auth';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { IconCalendar, IconChartBar, IconHome, IconSettings, IconTool, type IconProps } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';
import { msg, useT } from '@repo/core/i18n';

const ITEMS: { href: string; label: string; icon: (props: IconProps) => React.JSX.Element; adminOnly?: boolean }[] = [
  { href: '/home', label: msg('Home'), icon: IconHome },
  { href: '/bookings', label: msg('Bookings'), icon: IconCalendar },
  { href: '/services', label: msg('Services'), icon: IconTool, adminOnly: true },
  { href: '/earnings', label: msg('Earnings'), icon: IconChartBar, adminOnly: true },
  { href: '/settings', label: msg('Settings'), icon: IconSettings, adminOnly: true },
];

/** BottomNav, vendor type: an operator gets Home and Bookings. The bar's only red is the dot. */
export function BottomNav() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
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
            accessibilityLabel={t(label)}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) router.navigate(href as Href);
            }}
            style={styles.item}
          >
            {active ? <View style={styles.dot} /> : null}
            <Icon size={22} stroke={active ? 2 : 1.5} color={tint} />
            {/* Tamil is longer: one line, shrunk to fit its fifth of the bar. */}
            <T size={11} weight={500} lh={16} color={tint} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {t(label)}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = createStyles((colors) => ({
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
    backgroundColor: colors.red,
  },
}));
