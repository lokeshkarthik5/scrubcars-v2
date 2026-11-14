import { washGaugeAngle, washGaugeShare } from '@repo/core/moments';
import { WashGaugeDial } from '@repo/native-ui/wash-gauge';

/**
 * The Home wash gauge (moment 7; the website's wash-status-tile.tsx): days since the last
 * wash on a dial whose needle sweeps once and settles where the car is, by the existing
 * wash-status rule (core's washGaugeAngle: the interval reached is the far end). The dial
 * itself is shared with the garage app's Garage Book (packages/native-ui/src/wash-gauge.tsx).
 */
export function WashGauge({
  daysSinceWash,
  intervalDays,
  over,
}: {
  daysSinceWash: number | null;
  intervalDays: number;
  over: boolean;
}) {
  return (
    <WashGaugeDial
      angle={washGaugeAngle(daysSinceWash, intervalDays)}
      share={washGaugeShare(daysSinceWash, intervalDays)}
      over={over}
    />
  );
}
