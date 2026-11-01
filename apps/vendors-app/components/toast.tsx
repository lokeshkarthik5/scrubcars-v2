import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/lib/theme';

import { IconAlertCircle, IconCheck, IconInfoCircle, IconX } from './icons';
import { T } from './text';

/**
 * The web's toasts (react-toastify as each app's layout sets it up: top centre,
 * 3 seconds, no progress bar, the dark surface, 13px, radius 10) and
 * showUndoToast (packages/ui/src/sc/undo-toast.tsx).
 */
type Kind = 'plain' | 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  kind: Kind;
  message: string;
  durationMs: number;
  undo?: { label: string; onPress: () => void };
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function publish(next: ToastItem[]) {
  items = next;
  listeners.forEach((listener) => listener());
}

function dismiss(id: string) {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  publish(items.filter((item) => item.id !== id));
}

function show(item: Omit<ToastItem, 'id'> & { id?: string }): string {
  const id = item.id ?? `toast-${nextId++}`;
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  publish([...items.filter((other) => other.id !== id), { ...item, id }]);
  timers.set(
    id,
    setTimeout(() => dismiss(id), item.durationMs)
  );
  return id;
}

const AUTO_CLOSE = 3000;

export const toast = {
  success: (message: string) => show({ kind: 'success', message, durationMs: AUTO_CLOSE }),
  error: (message: string) => show({ kind: 'error', message, durationMs: AUTO_CLOSE }),
  info: (message: string) => show({ kind: 'info', message, durationMs: AUTO_CLOSE }),
  dismiss,
};

/**
 * "Job started · Undo": undoes once, however often it is tapped, and only Undo
 * closes it early. Its timer never pauses, because the action is saved when its
 * own timer runs out whatever the toast does.
 */
export function showUndoToast(
  message: string,
  opts: { onUndo: () => void; durationMs?: number; toastId?: string }
): string {
  let undone = false;
  const id: string = show({
    id: opts.toastId,
    kind: 'plain',
    message,
    durationMs: opts.durationMs ?? 6000,
    undo: {
      label: 'Undo',
      onPress: () => {
        if (!undone) {
          undone = true;
          opts.onUndo();
        }
        dismiss(id);
      },
    },
  });
  return id;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const KIND_ICON = {
  success: { Icon: IconCheck, color: colors.success },
  error: { Icon: IconAlertCircle, color: colors.error },
  info: { Icon: IconInfoCircle, color: colors.info },
} as const;

/** Mounted once at the root, and again inside a sheet (a native modal covers the root). */
export function ToastHost() {
  const list = useSyncExternalStore(subscribe, () => items);
  const insets = useSafeAreaInsets();
  if (list.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      {list.map((item) => {
        const kind = item.kind === 'plain' ? null : KIND_ICON[item.kind];
        return (
          <View
            key={item.id}
            accessibilityRole={item.kind === 'error' ? 'alert' : undefined}
            accessibilityLiveRegion="polite"
            style={styles.toast}
          >
            {kind ? <kind.Icon size={18} color={kind.color} /> : null}
            <T size={13} lh={18} style={styles.message}>
              {item.message}
            </T>
            {item.undo ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={item.undo.onPress} style={styles.undo}>
                <T size={14} weight={600} style={styles.undoText}>
                  {item.undo.label}
                </T>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => dismiss(item.id)}
              >
                <IconX size={14} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, zIndex: 100, gap: 8 },
  toast: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  message: { flex: 1, minWidth: 0 },
  undo: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  undoText: { textDecorationLine: 'underline' },
});
