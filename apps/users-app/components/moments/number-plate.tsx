import { formatIndianPlate } from '@repo/core/moments';
import { PlateDrawing } from '@repo/native-ui/number-plate';

/**
 * A car's plate drawn like an Indian number plate (moment 8; the website's
 * components/moments/number-plate.tsx), laid out by core's formatIndianPlate. The
 * drawing is shared with the garage app's Garage Book (packages/native-ui/src/number-plate.tsx).
 */
export function NumberPlate({ plate, size = 'md' }: { plate: string; size?: 'sm' | 'md' }) {
  return <PlateDrawing text={formatIndianPlate(plate)} size={size} />;
}
