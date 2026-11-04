import type { GaragePull } from '@repo/core/api/garage';
import { useMarkGaragePullsSeen } from '@repo/core/api/hooks/use-garage';
import { ScButton } from '@repo/native-ui/button';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PullReveal } from './pull-reveal';

const SHOWN_AT_ONCE = 3;

/** PullRevealSheet: each new card, one after another, then all marked seen. */
export function PullRevealSheet({ pulls, focusId = null, firstName = null }: { pulls: GaragePull[]; focusId?: string | null; firstName?: string | null }) {
  const colors = useColors();
  const seen = useMarkGaragePullsSeen();
  const [queue, setQueue] = useState<GaragePull[]>([]);
  const [waiting, setWaiting] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);

  const ordered = useMemo(() => {
    const fresh = pulls.filter((p) => !p.seen && !done.includes(p.id));
    const first = fresh.find((p) => p.id === focusId);
    return first ? [first, ...fresh.filter((p) => p !== first)] : fresh;
  }, [pulls, focusId, done]);

  useEffect(() => {
    if (open || ordered.length === 0) return;
    const timer = setTimeout(() => {
      setQueue(ordered.slice(0, SHOWN_AT_ONCE));
      setWaiting(ordered.map((p) => p.id));
      setIndex(0);
      setOpen(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [ordered, open]);

  const finish = () => {
    if (!open) return;
    setDone((current) => [...current, ...waiting]);
    setOpen(false);
    seen.mutate(waiting);
  };
  const pull = queue[index] ?? null;
  const more = queue.length - index - 1;
  return (
    <ScSheet horizontalPadding={16} open={open && pull !== null} onClose={finish} accessibilityLabel="New car for your Garage">
      {pull ? (
        <ScrollView key={pull.id} style={{ maxHeight: 720 }} contentContainerStyle={{ alignItems: 'center', gap: 4, paddingBottom: 8 }}>
          <T size={12} lh={16} uppercase tracking={0.14} color={colors.textSecondary}>
            New car for your Garage
          </T>
          <View style={{ alignSelf: 'stretch' }}>
            <PullReveal pull={{ ...pull, seen: false }} onRevealed={() => setRevealed(true)} firstName={firstName} compact />
          </View>
          {revealed ? (
            <View style={{ alignSelf: 'stretch' }}>
              <ScButton
                variant="outline"
                onPress={() => {
                  setRevealed(false);
                  if (more > 0) setIndex(index + 1);
                  else finish();
                }}
              >
                {more > 0 ? `Next card (${more} more)` : 'Done'}
              </ScButton>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </ScSheet>
  );
}
