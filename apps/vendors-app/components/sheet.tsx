import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/lib/theme';

import { ScButton } from './button';
import { Spinner } from './primitives';
import { T } from './text';
import { ToastHost } from './toast';

const DURATION = 220;

/**
 * ScSheet (packages/ui/src/sc/modal.tsx): slides up from the edge over a dimmed,
 * lightly blurred page. Stays mounted through its exit, as the web's does.
 */
export function ScSheet({
  open,
  onClose,
  children,
  dismissible = true,
  accessibilityLabel,
  horizontalPadding = 0,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  dismissible?: boolean;
  accessibilityLabel?: string;
  horizontalPadding?: number;
}) {
  const [visible, setVisible] = useState(open);
  const progress = useRef(new Animated.Value(0)).current;
  const height = Dimensions.get('window').height;
  const insets = useSafeAreaInsets();

  if (open && !visible) setVisible(true);

  useEffect(() => {
    if (open) {
      Animated.timing(progress, { toValue: 1, duration: DURATION, useNativeDriver: true }).start();
    } else if (visible) {
      Animated.timing(progress, { toValue: 0, duration: DURATION, useNativeDriver: true }).start(() =>
        setVisible(false)
      );
    }
  }, [open, visible, progress]);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => {
        if (dismissible) onClose();
      }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable
            accessibilityLabel="Close"
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={() => dismissible && onClose()}
          />
        </Animated.View>
        <View style={styles.end} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            accessibilityLabel={accessibilityLabel}
            style={[
              styles.panel,
              { maxHeight: height * 0.88 },
              {
                transform: [
                  { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.5, 0] }) },
                ],
              },
            ]}
          >
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              bounces={false}
              contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingBottom: Math.max(24, insets.bottom + 8) }}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      <ToastHost />
    </Modal>
  );
}

/** ConfirmSheet, 'light' and 'firm' levels: closing after the action is the caller's. */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  level,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Keep it',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  level: 'light' | 'firm';
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const working = busy || pending;
  const confirm = async () => {
    if (working) return;
    setPending(true);
    try {
      await onConfirm();
    } catch {
      // A rejected onConfirm is the caller's to explain.
    } finally {
      setPending(false);
    }
  };

  return (
    <ScSheet open={open} onClose={onClose} dismissible={!working} accessibilityLabel={title}>
      <View style={styles.confirm}>
        <T size={17} weight={600}>
          {title}
        </T>
        {body ? <View style={styles.confirmBody}>{body}</View> : null}
        <View style={styles.confirmActions}>
          <ScButton
            variant={level === 'light' ? 'main' : 'danger-outline'}
            onPress={() => void confirm()}
            disabled={working}
          >
            <View style={styles.confirmLabel}>
              {working ? <Spinner size={16} color={colors.textMuted} /> : null}
              <T
                size={15}
                weight={600}
                lh={20}
                color={working ? colors.textMuted : level === 'light' ? colors.white : colors.error}
              >
                {confirmLabel}
              </T>
            </View>
          </ScButton>
          <ScButton variant="outline" onPress={onClose} disabled={working}>
            {cancelLabel}
          </ScButton>
        </View>
      </View>
    </ScSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  end: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.brandBlack,
  },
  handleRow: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 999, backgroundColor: colors.border },
  confirm: { paddingHorizontal: 20, paddingTop: 4 },
  confirmBody: { marginTop: 8 },
  confirmActions: { marginTop: 20, gap: 10 },
  confirmLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
