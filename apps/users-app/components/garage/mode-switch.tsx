import { BOOKING_TYPE_LABELS } from '@repo/core/booking-types';
import type { BookingType } from '@repo/core/types';
import { ScSegmented } from '@repo/native-ui/primitives';

import { track } from '@/lib/shims/analytics';

/** ModeSwitch (apps/users/components/mode-switch.tsx). No icons at phone width, as the web. */
export function ModeSwitch({
  modes,
  value,
  onChange,
}: {
  modes: readonly BookingType[];
  value: BookingType;
  onChange: (mode: BookingType) => void;
}) {
  return (
    <ScSegmented
      accessibilityLabel="Service mode"
      value={value}
      onChange={(mode) => {
        if (mode !== value) track('mode_switch', { mode });
        onChange(mode);
      }}
      minHeight={44}
      labelSize={13}
      options={modes.map((mode) => ({ value: mode, label: BOOKING_TYPE_LABELS[mode] }))}
    />
  );
}
