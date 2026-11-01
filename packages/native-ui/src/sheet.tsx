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

import { ScButton } from './button';
import { Spinner } from './primitives';
import { T } from './text';
import { createStyles, useColors, useTheme } from './theme';
import { ToastHost } from './toast';

const DURATION = 220;

/** iOS drops a modal presented while another is going away: wait this long after closing one. */
export const AFTER_SHEET_MS = DURATION + 120;

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
  const { scheme } = useTheme();
  const styles = useStyles();
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
          <BlurView intensity={8} tint={scheme} style={StyleSheet.absoluteFill} />
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

/** ScModal: the centred dialog (the photo viewer). */
export function ScModal({
  open,
  onClose,
  children,
  dismissible = true,
  accessibilityLabel,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  dismissible?: boolean;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  if (!open) return null;
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (dismissible) onClose();
      }}
    >
      <Pressable
        accessibilityLabel="Close"
        style={[StyleSheet.absoluteFill, styles.modalBackdrop]}
        onPress={() => dismissible && onClose()}
      />
      <View style={styles.modalCentre} pointerEvents="box-none">
        <View accessibilityViewIsModal accessibilityLabel={accessibilityLabel} style={styles.modalPanel}>
          {children}
        </View>
      </View>
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
  error,
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
  /** Why it didn't work, shown in the sheet: a caller keeps it open and sets this. */
  error?: string;
}) {
  const colors = useColors();
  const styles = useStyles();
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
        {error ? (
          <T accessibilityRole="alert" size={14} lh={19} color={colors.error} style={styles.confirmError}>
            {error}
          </T>
        ) : null}
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

const useStyles = createStyles((c) => ({
  fill: { flex: 1 },
  modalBackdrop: { backgroundColor: c.sheetBackdrop },
  modalCentre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  modalPanel: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.canvas,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 20,
  },
  end: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: c.sheetBackdrop },
  panel: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: c.border,
    backgroundColor: c.canvas,
  },
  handleRow: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 999, backgroundColor: c.border },
  confirm: { paddingHorizontal: 20, paddingTop: 4 },
  confirmBody: { marginTop: 8 },
  confirmError: { marginTop: 16 },
  confirmActions: { marginTop: 20, gap: 10 },
  confirmLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
