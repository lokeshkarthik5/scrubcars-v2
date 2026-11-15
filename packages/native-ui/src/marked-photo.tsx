import { useState, type ReactNode } from 'react';
import { Image, View, type DimensionValue, type ViewStyle } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';

import { T } from './text';
import { createStyles, useColors } from './theme';

/** A mark to draw: its box on the photo (0-1 from the top left) and its words. */
export interface PhotoMark {
  id: string;
  box: { x: number; y: number; w: number; h: number } | null;
  label: string;
}

const pct = (value: number): DimensionValue => `${value * 100}%`;

/**
 * Where a mark's tag sits (packages/ui/src/features/marked-photo.tsx): from the
 * circle's left edge, or its right edge on the right half of the photo, so a tag
 * stays on the photo; above the circle, or under it when it is near the top.
 */
export function markTagPlacement(box: NonNullable<PhotoMark['box']>): ViewStyle {
  return {
    ...(box.x + box.w / 2 <= 0.5 ? { left: pct(box.x) } : { right: pct(1 - box.x - box.w) }),
    ...(box.y > 0.14 ? { bottom: `${(1 - box.y) * 100 + 1}%` } : { top: `${(box.y + box.h) * 100 + 1}%` }),
  };
}

/**
 * MarkedPhoto (packages/ui/src/features/marked-photo.tsx): a car condition check
 * photo (0075) with a red circle round each mark and, with `labels`, a small tag
 * naming it ("Scratch – rear left door"). Shared by the garage's Check the marks,
 * its warning above Complete job, and the customer's condition card, so both
 * sides see the same circles.
 *
 * The photo keeps its own shape (no cropping), so the boxes land where the model
 * put them. The circles are drawn once the photo's width is known, so they are
 * true ellipses at any size. The circles are decoration: the marks are listed in
 * words beside every use, so the photo's label names the photo only.
 */
export function MarkedPhoto({
  uri,
  accessibilityLabel,
  marks,
  labels = true,
  radius = 16,
  children,
}: {
  uri: string;
  accessibilityLabel: string;
  marks: readonly PhotoMark[];
  labels?: boolean;
  radius?: number;
  /** Laid over the photo, e.g. the angle's chip. */
  children?: ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  // 4:3 until the photo says otherwise (the web's <img> takes the photo's own shape).
  const [ratio, setRatio] = useState(4 / 3);
  const [width, setWidth] = useState(0);
  const height = width > 0 ? width / ratio : 0;
  const boxed = marks.filter((mark): mark is PhotoMark & { box: NonNullable<PhotoMark['box']> } => mark.box !== null);

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.frame, { borderRadius: radius, aspectRatio: ratio }]}
    >
      <Image
        accessibilityLabel={accessibilityLabel}
        source={{ uri }}
        onLoad={(event) => {
          const { width: w, height: h } = event.nativeEvent.source;
          if (w && h) setRatio(w / h);
        }}
        style={styles.fill}
        resizeMode="cover"
      />
      {width > 0 && boxed.length > 0 ? (
        <Svg width={width} height={height} style={styles.layer} pointerEvents="none">
          {boxed.map((mark) => {
            const cx = (mark.box.x + mark.box.w / 2) * width;
            const cy = (mark.box.y + mark.box.h / 2) * height;
            const rx = Math.max(1, (mark.box.w * width) / 2 - 1);
            const ry = Math.max(1, (mark.box.h * height) / 2 - 1);
            return (
              // The web's 0 0 0 1px shadow round a 2px red ring: a darker ring under it.
              <Ellipse key={`${mark.id}-shade`} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={4} />
            );
          })}
          {boxed.map((mark) => (
            <Ellipse
              key={mark.id}
              cx={(mark.box.x + mark.box.w / 2) * width}
              cy={(mark.box.y + mark.box.h / 2) * height}
              rx={Math.max(1, (mark.box.w * width) / 2 - 1)}
              ry={Math.max(1, (mark.box.h * height) / 2 - 1)}
              fill="none"
              stroke={colors.red}
              strokeWidth={2}
            />
          ))}
        </Svg>
      ) : null}
      {labels
        ? boxed.map((mark) => (
            <View key={`${mark.id}-tag`} pointerEvents="none" style={[styles.tag, markTagPlacement(mark.box)]}>
              <T size={11} weight={500} lh={14} color={colors.white} numberOfLines={1}>
                {mark.label}
              </T>
            </View>
          ))
        : null}
      {children}
    </View>
  );
}

/** The small chip over a photo's bottom left: its angle, or Before / After. */
export function PhotoChip({ children, small = false }: { children: string; small?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View pointerEvents="none" style={[styles.chip, small && styles.chipSmall]}>
      <T size={small ? 12 : 14} weight={500} lh={small ? 16 : 18} color={colors.white}>
        {children}
      </T>
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  frame: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fill: { width: '100%', height: '100%' },
  layer: { position: 'absolute', left: 0, top: 0 },
  tag: {
    position: 'absolute',
    maxWidth: '60%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(239,50,64,0.7)',
    backgroundColor: 'rgba(10,10,11,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,11,0.8)',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  chipSmall: { left: 6, bottom: 6, paddingHorizontal: 8 },
}));
