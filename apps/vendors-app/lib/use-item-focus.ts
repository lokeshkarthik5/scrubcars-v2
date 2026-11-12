import { type ComponentRef, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';

import { toast } from '@repo/native-ui/toast';

import { locateItem, type Scope, type ScopeLookup, scrollTarget } from './focus-item';
import { t } from '@repo/core/i18n/translate';

/** How long the card is kept in view while what is above it finishes loading. */
const SETTLE_MS = 3000;

/**
 * A list screen (free redo claims, Requests) opened on one item: `?claim=<id>` or
 * `?request=<id>`. Once per id named, also when the screen is already mounted and
 * the param changes (tabs stay mounted): both lists are loaded afresh, the scope
 * that holds the item is shown (Open first), the card is scrolled to and flashes.
 * Neither list has it: the normal list and a quiet toast. Bookings does the same
 * for `?job=` with its own lists.
 */
export function useItemFocus({
  id,
  ready,
  open,
  closed,
  refetch,
  onScope,
  missing,
  scrollRef,
}: {
  /** The id the link named, from itemIdParam. */
  id: string | null;
  /** The lists can be asked for (the claims need the owner seat and the switch on). */
  ready: boolean;
  open: ScopeLookup;
  closed: ScopeLookup;
  /** Loads both lists again. */
  refetch: () => void;
  onScope: (scope: Scope) => void;
  /** The toast for an item neither list has. */
  missing: string;
  scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>;
}) {
  const [asked, setAsked] = useState<{ id: string; at: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const listTop = useRef(0);
  const tops = useRef(new Map<string, number>());
  const scrolledTo = useRef<string | null>(null);
  const scrolledTop = useRef<number | null>(null);
  const settleUntil = useRef(0);
  const [laidOut, setLaidOut] = useState(0);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // A new id: ask for both lists afresh, so a push that beat the polling finds its item.
  useEffect(() => {
    if (!id || !ready || asked?.id === id) return;
    setAsked({ id, at: Date.now() });
    refetchRef.current();
  }, [id, ready, asked?.id]);

  useEffect(() => {
    if (!id || !asked || asked.id !== id || done === id) return;
    const found = locateItem(id, asked.at, open, closed);
    if (found === 'wait') return;
    setDone(id);
    if (found === 'missing') toast.info(t(missing));
    if (typeof found === 'object') {
      onScope(found.scope);
      setTarget(id);
    }
  }, [id, asked, done, open, closed, missing, onScope]);

  useEffect(() => {
    if (!target) return;
    const top = tops.current.get(target);
    if (top === undefined) return;
    if (scrolledTo.current !== target) {
      scrolledTo.current = target;
      settleUntil.current = Date.now() + SETTLE_MS;
      scrolledTop.current = null;
    }
    // Photos above the card load after the list is laid out and push it down: follow it for a
    // moment, so the card is still where the link pointed once they have.
    if (Date.now() > settleUntil.current || scrolledTop.current === top) return;
    scrolledTop.current = top;
    scrollRef.current?.scrollTo({ y: scrollTarget(listTop.current, top), animated: false });
  }, [target, laidOut, scrollRef]);

  const onListLayout = useCallback((event: LayoutChangeEvent) => {
    listTop.current = event.nativeEvent.layout.y;
  }, []);

  /** Props for the card of item `itemId`: it reports where it is, and flashes when named. */
  const frameProps = (itemId: string) => ({
    flash: target === itemId,
    onLayout: (event: LayoutChangeEvent) => {
      tops.current.set(itemId, event.nativeEvent.layout.y);
      setLaidOut((n) => n + 1);
    },
  });

  return { onListLayout, frameProps };
}
