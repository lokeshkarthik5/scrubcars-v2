import { ACCOUNT_DELETION_CONFIRM, ACCOUNT_DELETION_WORDS } from '@repo/core/account-deletion';
import { type AccountDeletionPreview, deleteMyAccount, getAccountDeletionPreview } from '@repo/core/api/account';
import { typedConfirmMatches } from '@repo/core/confirm';
import { useT } from '@repo/core/i18n';
import { ScButton } from '@repo/native-ui/button';
import { ScInput } from '@repo/native-ui/inputs';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { errorText } from '@/lib/error-text';

type Phase = { kind: 'checking' } | { kind: 'failed'; message: string } | { kind: 'ready'; preview: AccountDeletionPreview } | { kind: 'deleted' };

/** DeleteAccountSheet (apps/users/components/profile/delete-account-sheet.tsx): the server decides. */
export function DeleteAccountSheet({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => void }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase({ kind: 'checking' });
    setTyped('');
    setError(null);
    let cancelled = false;
    getAccountDeletionPreview()
      .then((preview) => {
        if (!cancelled) setPhase({ kind: 'ready', preview });
      })
      .catch((err: unknown) => {
        if (!cancelled) setPhase({ kind: 'failed', message: errorText(err, t('Could not check your account.')) });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const close = () => {
    if (busy) return;
    if (phase.kind === 'deleted') onDeleted();
    else onClose();
  };

  const remove = async () => {
    if (!typedConfirmMatches(typed, ACCOUNT_DELETION_CONFIRM)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount();
      setPhase({ kind: 'deleted' });
    } catch (err) {
      setError(errorText(err, t('Could not delete your account.')));
    } finally {
      setBusy(false);
    }
  };

  const words = ACCOUNT_DELETION_WORDS;
  const canDelete = phase.kind === 'ready' && phase.preview.canDelete;
  const bullets = (lines: readonly string[]) =>
    lines.map((line) => (
      <T key={line} size={13} lh={18} color={colors.textSecondary}>
        {`•  ${t(line)}`}
      </T>
    ));

  return (
    <ScSheet horizontalPadding={16} open={open} onClose={close} dismissible={!busy} accessibilityLabel={t('Delete account')}>
      <View style={styles.column}>
        {phase.kind === 'deleted' ? (
          <>
            <T size={19} weight={600} lh={26}>
              {t(words.doneTitle)}
            </T>
            <T size={13} lh={18} color={colors.textSecondary} accessibilityLiveRegion="polite">
              {t(words.doneBody)}
            </T>
            <ScButton variant="main" onPress={onDeleted}>
              {t('Done')}
            </ScButton>
          </>
        ) : (
          <>
            <T size={19} weight={600} lh={26}>
              {t(words.title)}
            </T>
            {phase.kind === 'checking' ? (
              <T size={13} lh={18} color={colors.textSecondary}>
                {t('Checking your account…')}
              </T>
            ) : null}
            {phase.kind === 'failed' ? (
              <T accessibilityRole="alert" size={13} lh={18} color={colors.error}>
                {phase.message}
              </T>
            ) : null}
            {phase.kind === 'ready' && !phase.preview.canDelete ? (
              <>
                <T size={13} lh={18} color={colors.textSecondary}>
                  {t(words.blockedIntro)}
                </T>
                <View style={styles.list}>
                  {phase.preview.blockers.map((blocker) => (
                    <View key={blocker.code} style={styles.blocker}>
                      <T size={13} lh={18}>
                        {blocker.message}
                      </T>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            {canDelete ? (
              <>
                <View style={styles.list}>
                  <T size={13} weight={600} lh={18}>
                    {t(words.deletedHeading)}
                  </T>
                  {bullets(words.deleted)}
                </View>
                <View style={styles.list}>
                  <T size={13} weight={600} lh={18}>
                    {t(words.keptHeading)}
                  </T>
                  {bullets(words.kept)}
                </View>
                <T size={13} lh={18} color={colors.textSecondary}>
                  {t(words.final)}
                </T>
                <ScInput label={t('Type {word} to confirm', { word: ACCOUNT_DELETION_CONFIRM })} value={typed} onChangeText={setTyped} editable={!busy} autoComplete="off" autoCapitalize="characters" autoCorrect={false} spellCheck={false} />
              </>
            ) : null}
            {error ? (
              <T accessibilityRole="alert" size={13} lh={18} color={colors.error}>
                {error}
              </T>
            ) : null}
            <View style={styles.actions}>
              {canDelete ? (
                <ScButton variant="danger-outline" disabled={busy || !typedConfirmMatches(typed, ACCOUNT_DELETION_CONFIRM)} onPress={() => void remove()}>
                  {busy ? t('Deleting…') : t('Delete my account')}
                </ScButton>
              ) : null}
              <ScButton variant="outline" disabled={busy} onPress={close}>
                {canDelete ? t('Keep my account') : t('Close')}
              </ScButton>
            </View>
          </>
        )}
      </View>
    </ScSheet>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 16 },
  list: { gap: 6 },
  blocker: { borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 10 },
  actions: { gap: 8 },
}));
