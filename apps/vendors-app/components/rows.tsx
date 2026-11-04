import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { openLink } from '@/lib/open-link';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { PRESSED_SCALE } from '@repo/native-ui/tokens';

import { IconArrowLeft, IconBrandWhatsapp, IconChevronRight, IconPhone } from '@repo/native-ui/icons';
import { PressRow, ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';

/** SectionHeader. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <T accessibilityRole="header" size={15} weight={600}>
      {title}
    </T>
  );
}

/** TopBar: a back arrow in a 44px target, and the screen's title. */
export function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.back}>
          <IconArrowLeft size={22} stroke={1.5} />
        </Pressable>
      ) : null}
      <T accessibilityRole="header" size={18} weight={700}>
        {title}
      </T>
    </View>
  );
}

/** ContactButtons: Call and WhatsApp, side by side; either half left out with no number. */
export function ContactButtons({
  callHref,
  whatsAppHref,
  who,
}: {
  callHref: string | null;
  whatsAppHref: string | null;
  who: string;
}) {
  const styles = useStyles();
  if (!callHref && !whatsAppHref) return null;
  return (
    <View style={styles.contact}>
      {callHref ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Call ${who}`}
          onPress={() => openLink(callHref)}
          style={styles.contactLink}
        >
          <IconPhone size={16} />
          <T size={13} weight={500}>
            Call
          </T>
        </Pressable>
      ) : null}
      {whatsAppHref ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`WhatsApp ${who}`}
          onPress={() => openLink(whatsAppHref)}
          style={styles.contactLink}
        >
          <IconBrandWhatsapp size={16} color="#25D366" />
          <T size={13} weight={500}>
            WhatsApp
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Settings' LinkRow: a graphite icon tile, a title, a line under it and a chevron. */
export function LinkRow({
  icon,
  title,
  description,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <PressRow accessibilityLabel={title} onPress={onPress}>
      <ScCard style={styles.linkRow}>
        <View style={styles.linkIcon}>{icon}</View>
        <View style={styles.flex}>
          <T size={13} weight={600}>
            {title}
          </T>
          <T size={11} color={colors.textSecondary}>
            {description}
          </T>
        </View>
        <IconChevronRight size={18} color={colors.textMuted} />
      </ScCard>
    </PressRow>
  );
}

/** ScSwitch. Amber when on with the warning tone: a state to notice, not an action. */
export function ScSwitch({
  checked,
  onChange,
  label,
  disabled,
  tone = 'default',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  tone?: 'default' | 'warning';
}) {
  const colors = useColors();
  const styles = useStyles();
  const warning = tone === 'warning';
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [
        styles.switch,
        disabled && styles.switchOff,
        pressed && { transform: [{ scale: PRESSED_SCALE }] },
      ]}
    >
      <View
        style={[
          styles.track,
          checked ? { backgroundColor: warning ? colors.warning : colors.chosenBg } : styles.trackOff,
        ]}
      >
        <View
          style={[
            styles.knob,
            checked
              ? { left: 22, backgroundColor: warning ? colors.textPrimary : colors.chosenText }
              : { left: 2, backgroundColor: colors.textSecondary },
          ]}
        />
      </View>
    </Pressable>
  );
}

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  topBar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, marginLeft: -11, marginRight: -11, alignItems: 'center', justifyContent: 'center' },
  contact: { flexDirection: 'row', gap: 8 },
  contactLink: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switch: { width: 56, height: 44, alignItems: 'center', justifyContent: 'center' },
  switchOff: { opacity: 0.5 },
  track: { width: 44, height: 24, borderRadius: 999 },
  trackOff: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  knob: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 10 },
}));
