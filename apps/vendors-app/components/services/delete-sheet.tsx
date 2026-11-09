import { ConfirmSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { useT } from '@repo/core/i18n';

/**
 * Delete asks first (UX audit, garage finding 5): one brushed tap used to remove a
 * priced service at once. Firm level, the web's words.
 */
export function DeleteSheet({
  target,
  noun,
  onClose,
  onConfirm,
}: {
  target: { id: string; name: string } | null;
  /** "service" or "package". */
  noun: 'service' | 'package';
  onClose: () => void;
  onConfirm: (id: string) => Promise<void>;
}) {
  const t = useT();
  const colors = useColors();
  return (
    <ConfirmSheet
      open={target !== null}
      onClose={onClose}
      level="firm"
      title={
        target
          ? t('Delete {name}?', { name: target.name })
          : noun === 'service'
            ? t('Delete this service?')
            : t('Delete this package?')
      }
      body={
        <T size={14} lh={19} color={colors.textSecondary}>
          {t("Customers can't book it any more, and it can't be undone. To stop it for a while, Disable it instead.")}
        </T>
      }
      confirmLabel={noun === 'service' ? t('Delete service') : t('Delete package')}
      onConfirm={async () => {
        if (target) await onConfirm(target.id);
        onClose();
      }}
    />
  );
}
