import type { ApiAuthVendor } from '@repo/core/api/types';
import { type ComponentRef, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

import { IconCheck, IconChevronDown } from '@repo/native-ui/icons';
import { T } from '@repo/native-ui/text';

const ROLE_LABEL: Record<string, string> = {
  vendor_admin: 'Admin',
  vendor_operator: 'Operator',
};

/** CompanySwitcher: nothing for one garage; a dropdown with logo, name and role for more. */
export function CompanySwitcher() {
  const vendors = useAuth((s) => s.vendors);
  const activeVendorId = useAuth((s) => s.activeVendorId);
  const setActiveVendor = useAuth((s) => s.setActiveVendor);
  const [menuTop, setMenuTop] = useState<number | null>(null);
  const button = useRef<ComponentRef<typeof View>>(null);

  if (vendors.length < 2) return null;
  const active = vendors.find((v) => v.id === activeVendorId) ?? vendors[0];

  return (
    <>
      <Pressable
        ref={button}
        accessibilityRole="button"
        accessibilityLabel={`Garage: ${active.businessName}. Switch garage`}
        accessibilityState={{ expanded: menuTop !== null }}
        onPress={() => button.current?.measureInWindow((_x, y, _w, h) => setMenuTop(y + h + 4))}
        style={styles.button}
      >
        <CompanyLogo vendor={active} />
        <T size={12} weight={500} numberOfLines={1} style={styles.shrink}>
          {active.businessName}
        </T>
        <IconChevronDown size={14} stroke={1.5} color={colors.textMuted} />
      </Pressable>
      <Modal transparent visible={menuTop !== null} animationType="none" onRequestClose={() => setMenuTop(null)}>
        {/* Outside-tap closes. */}
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={() => setMenuTop(null)} />
        <View accessibilityRole="menu" style={[styles.menu, { top: menuTop ?? 0 }]}>
          {vendors.map((vendor) => {
            const isActive = vendor.id === active.id;
            return (
              <Pressable
                key={vendor.id}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: isActive }}
                onPress={() => {
                  setMenuTop(null);
                  setActiveVendor(vendor.id);
                }}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              >
                <CompanyLogo vendor={vendor} />
                <View style={styles.flex}>
                  <T size={13} weight={500} numberOfLines={1}>
                    {vendor.businessName}
                  </T>
                  <T size={11} color={colors.textSecondary}>
                    {vendor.isOwner ? 'Owner' : (ROLE_LABEL[vendor.role ?? ''] ?? 'Member')}
                  </T>
                </View>
                {isActive ? <IconCheck size={16} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </>
  );
}

function CompanyLogo({ vendor }: { vendor: ApiAuthVendor }) {
  if (vendor.logoUrl) return <Image source={{ uri: vendor.logoUrl }} style={styles.logo} />;
  return (
    <View style={[styles.logo, styles.logoLetter]}>
      <T size={11} weight={600} lh={14}>
        {vendor.businessName.charAt(0).toUpperCase()}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  button: {
    minHeight: 44,
    maxWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
  },
  menu: {
    position: 'absolute',
    right: 16,
    width: 248,
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  optionPressed: { backgroundColor: colors.surfaceElevated },
  logo: { width: 20, height: 20, borderRadius: 4 },
  logoLetter: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
});
