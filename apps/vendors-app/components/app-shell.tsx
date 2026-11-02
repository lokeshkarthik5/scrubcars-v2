import { Fragment, type ComponentRef, type ComponentType, type ReactNode, type RefObject } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

import { CompanySwitcher } from './company-switcher';
import { BrandMark } from './primitives';
import { SupportSessionBanner, useSupportSession } from './support-session-banner';

/**
 * VendorScope: every garage screen is keyed by the active garage, so a switch
 * remounts it and no state of the last garage can stay on screen. Wrap a route's
 * screen in this, and a screen added later can't forget.
 */
export function garageScreen<P extends object>(Screen: ComponentType<P>) {
  return function GarageScreen(props: P) {
    const activeVendorId = useAuth((s) => s.activeVendorId);
    return (
      <Fragment key={activeVendorId ?? 'none'}>
        <Screen {...props} />
      </Fragment>
    );
  };
}

/** VendorShellHeader: which garage, and whether this is a support session. */
function VendorShellHeader() {
  const vendorCount = useAuth((s) => s.vendors.length);
  const support = useSupportSession();
  if (vendorCount < 2 && !support) return null;
  return (
    <View style={styles.shellHeader}>
      <SupportSessionBanner />
      {vendorCount > 1 ? (
        <View style={styles.switcherRow}>
          <CompanySwitcher />
        </View>
      ) : null}
    </View>
  );
}

/**
 * AppShell (packages/ui/src/sc/app-shell.tsx): the screen's column, under the
 * garage header and the brand row. The bottom nav comes from the tab layout.
 */
export function AppShell({
  children,
  showBrand = false,
  brandRight,
  gap = 20,
  hasNav = true,
  scrollRef,
  footer,
}: {
  children: ReactNode;
  showBrand?: boolean;
  brandRight?: ReactNode;
  /** The web's gap-*: Home's gap-5, Bookings' gap-4. */
  gap?: number;
  /** A tab screen sits above the nav; a screen off the tabs reaches the edge. */
  hasNav?: boolean;
  scrollRef?: RefObject<ComponentRef<typeof ScrollView> | null>;
  /** Docked under the scroll, above the keyboard: the job's one next step. */
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    // The inset is outside the scroll, so content never runs under the status bar.
    <KeyboardAvoidingView
      behavior={footer && Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.page, { paddingTop: insets.top }]}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.page}
        keyboardShouldPersistTaps="handled"
        // Without a docked footer nothing lifts the page above the keyboard: iOS adds the
        // keyboard's height to the scroll's bottom inset and scrolls the focused box into
        // view (a no-op while the keyboard is down). A footer screen has the padding above.
        automaticallyAdjustKeyboardInsets={!footer}
        contentContainerStyle={[
          styles.content,
          { gap, paddingTop: 16, paddingBottom: hasNav || footer ? 16 : insets.bottom + 16 },
        ]}
      >
        <VendorShellHeader />
        {showBrand ? (
          <View style={styles.brand}>
            <BrandMark height={32} />
            {brandRight ? <View style={styles.brandRight}>{brandRight}</View> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>{footer}</View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.brandBlack },
  content: { flexGrow: 1, paddingHorizontal: 16 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.brandBlack,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  shellHeader: { gap: 8 },
  switcherRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandRight: { flexShrink: 1, minWidth: 0 },
});
