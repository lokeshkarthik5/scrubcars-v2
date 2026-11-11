import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import { msg, useT } from '@repo/core/i18n';
import type { BookingType } from '@repo/core/types';
import { GraphiteSwitch } from '@repo/native-ui/finish';
import { IconBuildingStore, IconCarGarage, IconHome, type IconProps } from '@repo/native-ui/icons';
import type { ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { track } from '@/lib/shims/analytics';

const ICONS: Record<BookingType, (props: IconProps) => ReactElement> = {
  dropin: IconBuildingStore,
  doorstep: IconHome,
  pickup: IconCarGarage,
};

/** Each mode's quiet second line (§3): what it means in four words. */
export const MODE_QUIET: Record<BookingType, string> = {
  dropin: msg('Drive it in'),
  doorstep: msg('We come to you'),
  pickup: msg('We collect it'),
};

/**
 * ModeSwitch (apps/users/components/mode-switch.tsx): the At garage / Doorstep / Pickup &
 * drop switch on a garage's page and the booking page, the graphite switch of the garages
 * list (customer UI round, §5, §6), with the same names, the quiet lines and only the
 * modes given. A radiogroup named "Service mode"; on the garage page a tap to another mode
 * records mode_switch, as it always has; checkout's never did (`track={false}`).
 */
export function ModeSwitch({
  modes,
  value,
  onChange,
  track: tracked = true,
  style,
}: {
  modes: readonly BookingType[];
  value: BookingType;
  onChange: (mode: BookingType) => void;
  track?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useT();
  return (
    <GraphiteSwitch
      accessibilityLabel={t('Service mode')}
      style={style}
      value={value}
      onChange={(mode) => {
        if (tracked && mode !== value) track('mode_switch', { mode });
        onChange(mode);
      }}
      options={modes.map((mode) => {
        const Icon = ICONS[mode];
        return {
          value: mode,
          label: t(BOOKING_TYPE_LABELS[mode]),
          quiet: t(MODE_QUIET[mode]),
          icon: (ink: string) => <Icon size={18} color={ink} />,
        };
      })}
    />
  );
}
