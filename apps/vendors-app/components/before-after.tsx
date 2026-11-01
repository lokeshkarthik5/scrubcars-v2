import { angleLabel, beforeAfterPairs } from '@repo/core/job-photo-standards';
import type { JobPhoto } from '@repo/core/types';
import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

import { Chip } from '@repo/native-ui/chip';
import { T } from '@repo/native-ui/text';

/**
 * BeforeAfterCompare: one picture with a slider, the before left of the line, the
 * after right of it, with angle chips when more than one angle has both. A drag in
 * place of the web's range input, and the same steps for a screen reader.
 */
export function BeforeAfterCompare({ photos, title = 'Before and after' }: { photos: readonly JobPhoto[]; title?: string }) {
  const pairs = beforeAfterPairs(photos);
  const [index, setIndex] = useState(0);
  const [split, setSplit] = useState(50);
  const [width, setWidth] = useState(0);
  const box = useRef({ width: 0, grab: 50 });
  box.current.width = width;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const at = (e.nativeEvent.locationX / (box.current.width || 1)) * 100;
          box.current.grab = at;
          setSplit(Math.max(0, Math.min(100, at)));
        },
        onPanResponderMove: (_e, g) => {
          const at = box.current.grab + (g.dx / (box.current.width || 1)) * 100;
          setSplit(Math.max(0, Math.min(100, at)));
        },
      }),
    []
  );

  if (pairs.length === 0) return null;
  const pair = pairs[Math.min(index, pairs.length - 1)];
  const label = angleLabel(pair.angle);
  const height = (width * 3) / 4;
  const offset = (split / 100) * width;

  return (
    <View accessibilityLabel={title} style={styles.column}>
      <View style={styles.head}>
        <T size={12} weight={500}>
          {title}
        </T>
        <T size={11} color={colors.textMuted}>
          {label}
        </T>
      </View>

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Slide between before and after, ${label.toLowerCase()}`}
        accessibilityValue={{ text: `${Math.round(split)}% before` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) =>
          setSplit((value) =>
            Math.max(0, Math.min(100, value + (event.nativeEvent.actionName === 'increment' ? 10 : -10)))
          )
        }
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={[styles.frame, { height }]}
        {...responder.panHandlers}
      >
        <Image source={{ uri: pair.before.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {/* The after picture, cut away left of the line. */}
        <View style={[styles.afterClip, { left: offset }]} pointerEvents="none">
          <Image
            source={{ uri: pair.after.url }}
            style={{ position: 'absolute', left: -offset, top: 0, width, height }}
            resizeMode="cover"
          />
        </View>
        <View pointerEvents="none" style={[styles.line, { left: offset - 1 }]} />
        <View pointerEvents="none" style={[styles.tag, styles.tagLeft]}>
          <T size={11} weight={500} lh={14} color={colors.white}>
            Before
          </T>
        </View>
        <View pointerEvents="none" style={[styles.tag, styles.tagRight]}>
          <T size={11} weight={500} lh={14} color={colors.white}>
            After
          </T>
        </View>
      </View>

      {pairs.length > 1 ? (
        <View accessibilityLabel="Angle" style={styles.chips}>
          {pairs.map((p, i) => (
            <Chip
              key={p.angle}
              label={angleLabel(p.angle)}
              selected={i === index}
              onPress={() => {
                setIndex(i);
                setSplit(50);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  frame: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  afterClip: { position: 'absolute', top: 0, bottom: 0, right: 0, overflow: 'hidden' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.white },
  tag: { position: 'absolute', top: 8, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 2 },
  tagLeft: { left: 8 },
  tagRight: { right: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
