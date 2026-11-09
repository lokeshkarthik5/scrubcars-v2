import { COUNT_UP_MS, countUpFrame } from '@repo/core/figure-motion';
import { useReduceMotion as useReduceMotionSetting } from '@repo/native-ui/motion';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

export { useReducedMotion };

/** A short buzz where the phone has one; the moment is the same without it. */
export function buzz(kind: 'light' | 'legendary' = 'light') {
  const run = async () => {
    if (kind === 'light') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  run().catch(() => undefined);
}

/**
 * A figure that counts up from nothing once `run` turns true (a card coming into
 * view), with the settled figure's decimals on every frame (@repo/core/figure-motion,
 * the website's useCountUp). The settled figure before `run` and under Reduce Motion,
 * so a card that never animates is never left at 0.
 */
export function useCountUp(to: number, decimals: number, run: boolean): string {
  const reduce = useReduceMotionSetting();
  const [frame, setFrame] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!run || reduce || started.current || !Number.isFinite(to)) return;
    started.current = true;
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const elapsed = Date.now() - t0;
      setFrame(countUpFrame(to, elapsed, decimals));
      if (elapsed < COUNT_UP_MS) raf = requestAnimationFrame(tick);
      else setFrame(null);
    };
    raf = requestAnimationFrame(tick);
    // A new figure mid-count (the list refetching with a location) must not leave the
    // card on a part-way frame: the settled figure shows, and the new one counts again.
    return () => {
      cancelAnimationFrame(raf);
      setFrame(null);
      started.current = false;
    };
  }, [run, reduce, to, decimals]);
  return frame ?? (Number.isFinite(to) ? to.toFixed(decimals) : '');
}
