import { addOnTimeLabel } from '@repo/core/add-ons';
import { garageAddOnsApi, type AddOn } from '@repo/core/api/add-ons';
import { formatServicePrice } from '@repo/core/pricing';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { IconPlus } from '@repo/native-ui/icons';
import { ScCard } from '@repo/native-ui/primitives';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';
import { ADD_ON_DELETE_BODY, ADD_ONS_INTRO, routesMissing } from '@/lib/add-on-form';
import { errorText } from '@/lib/error-text';

import { ScBadge } from '../form-controls';
import { SectionHeader } from '../rows';
import { AddOnSheet } from './add-on-sheet';
import { Figures } from './figures';
import { RowAction } from './row-action';
import { useT } from '@repo/core/i18n';

/**
 * Add-ons under Services (add-ons frame A): small extras that go with any service. Rows are the
 * service card without its photo editor. Their own list and routes, so the Services list above
 * keeps meaning services. Draws nothing when the server has no add-on routes (an older API).
 */
export function AddOnsSection({ addRequest }: { addRequest: number }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [addOns, setAddOns] = useState<AddOn[] | null>(null);
  const [missing, setMissing] = useState(false);
  // null: closed. 'new': adding. An add-on: editing it.
  const [sheet, setSheet] = useState<'new' | AddOn | null>(null);
  const [deleting, setDeleting] = useState<AddOn | null>(null);

  useEffect(() => {
    garageAddOnsApi
      .list()
      .then(setAddOns)
      .catch((err) => {
        if (routesMissing(err)) {
          setMissing(true);
          return;
        }
        setAddOns([]);
        toast.error(t('Failed to load add-ons'));
      });
  }, []);

  // Adjusted during render, so the sheet opens with the tap that asked for it.
  const [seenRequest, setSeenRequest] = useState(addRequest);
  if (seenRequest !== addRequest) {
    setSeenRequest(addRequest);
    setSheet('new');
  }

  if (missing) return null;
  const list = addOns ?? [];

  const setActive = async (addOn: AddOn, isActive: boolean) => {
    try {
      const updated = await garageAddOnsApi.update(addOn.id, { isActive });
      setAddOns((current) => (current ?? []).map((a) => (a.id === addOn.id ? updated : a)));
      toast.success(t('Saved successfully'));
    } catch (err) {
      toast.error(errorText(err, t('Something went wrong')));
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <SectionHeader title={t('Add-ons')} />
        {list.length > 0 ? (
          <T num size={12} color={colors.textMuted}>
            {list.length}
          </T>
        ) : null}
      </View>
      <T size={13} color={colors.textSecondary}>
        {t(ADD_ONS_INTRO)}
      </T>
      <ScButton variant="outline" onPress={() => setSheet('new')}>
        <View style={styles.addRow}>
          <IconPlus size={16} />
          <T size={14} weight={500}>
            {t('Add add-on')}
          </T>
        </View>
      </ScButton>
      <View style={styles.list}>
        {list.map((addOn) => (
          <ScCard key={addOn.id} style={styles.card}>
            <View style={styles.top}>
              <View style={styles.text}>
                <T size={13} weight={600}>
                  {addOn.name}
                </T>
                <T size={12} color={colors.textSecondary} style={styles.price}>
                  <Figures text={formatServicePrice(addOn)} />
                  {' · '}
                  <Figures text={addOnTimeLabel(addOn.extraMins)} />
                </T>
              </View>
              <ScBadge variant={addOn.isActive ? 'success' : 'muted'}>{addOn.isActive ? t('Active') : t('Inactive')}</ScBadge>
            </View>
            <View style={styles.actions}>
              <RowAction onPress={() => setSheet(addOn)}>{t('Edit')}</RowAction>
              <RowAction onPress={() => void setActive(addOn, !addOn.isActive)}>
                {addOn.isActive ? t('Disable') : t('Enable')}
              </RowAction>
              <RowAction onPress={() => setDeleting(addOn)}>{t('Delete')}</RowAction>
            </View>
          </ScCard>
        ))}
      </View>

      <AddOnSheet
        open={sheet !== null}
        addOn={sheet !== null && sheet !== 'new' ? sheet : null}
        onClose={() => setSheet(null)}
        onSaved={(saved) => {
          setAddOns((current) => {
            const rows = current ?? [];
            return rows.some((a) => a.id === saved.id) ? rows.map((a) => (a.id === saved.id ? saved : a)) : [...rows, saved];
          });
          setSheet(null);
          toast.success(t('Saved successfully'));
        }}
      />

      <ConfirmSheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        level="firm"
        title={deleting ? t('Delete {name}?', { name: deleting.name }) : t('Delete this add-on?')}
        body={t(ADD_ON_DELETE_BODY)}
        confirmLabel={t('Delete add-on')}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await garageAddOnsApi.remove(deleting.id);
            setAddOns((current) => (current ?? []).filter((a) => a.id !== deleting.id));
            toast.success(t('Saved successfully'));
          } catch (err) {
            toast.error(errorText(err, t('Something went wrong')));
          }
          setDeleting(null);
        }}
      />
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  section: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  list: { gap: 8 },
  card: { gap: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  text: { flex: 1, minWidth: 0 },
  price: { marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
}));
