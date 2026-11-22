import type { MediaConfig } from '@repo/core/api/service-media';
import { SERVICE_CATEGORY_OPTIONS, groupByCategory, showCategoryHeadings } from '@repo/core/categories';
import { withMedia } from '@repo/core/service-media';
import type { Service, ServiceMedia } from '@repo/core/types';
import { type Dispatch, type SetStateAction, useCallback, useState } from 'react';
import { View } from 'react-native';

import { HubBack, HubPill, HubTile, TileRow } from '@/components/hub/parts';
import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconCheck, IconPhoto, IconPlus, IconTool } from '@repo/native-ui/icons';
import { ScInput, ScTextarea } from '@repo/native-ui/inputs';
import { EmptyState, HubCard } from '@repo/native-ui/primitives';
import {
  canSubmitService,
  emptyServiceForm,
  formFromService,
  type ServiceForm,
  sanitizeDigits,
  servicePayload,
} from '@/lib/service-form';
import { createService, deleteService, toggleServiceActive, updateService } from '@/lib/services-api';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { AddOnsSection } from './add-ons-section';
import { CategoryHeading } from './category-heading';
import { CatalogueCard, CatalogueTools, hasMedia } from './catalogue-card';
import { DeleteSheet } from './delete-sheet';
import { ChipRow, PricingBlock } from './pricing-block';
import { FieldLabel } from './section-title';
import { useSaver } from './use-saver';
import { useT } from '@repo/core/i18n';

/**
 * The Services tab (apps/vendors/app/services/page.tsx) in the Home look (mockup
 * garage-hub 3): two tiles (how many are on the listing, how many have photos), one compact
 * card per service and "Add a service". A card opens its edit view: the same form, and
 * under it the photo and video uploads and Disable / Delete that used to sit on every card.
 * The list and the form live in the screen, as the web's do, so they survive a visit to
 * the Packages tab.
 */
export function ServicesTab({
  services,
  setServices,
  form,
  setForm,
  editingId,
  setEditingId,
  mediaConfig,
  formOpen,
  setFormOpen,
  onEditStarted,
}: {
  services: Service[];
  setServices: Dispatch<SetStateAction<Service[]>>;
  form: ServiceForm;
  setForm: Dispatch<SetStateAction<ServiceForm>>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  mediaConfig: MediaConfig | null;
  /** The add / edit view is showing in place of the list. */
  formOpen: boolean;
  setFormOpen: (open: boolean) => void;
  /** Bring the top of the view into sight when it changes. */
  onEditStarted: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  // "Your services" by category, in the order used everywhere.
  const serviceGroups = groupByCategory(services, (svc) => svc.category);
  const { saving, run } = useSaver();
  const [deleting, setDeleting] = useState<Service | null>(null);
  const change = (patch: Partial<ServiceForm>) => setForm((current) => ({ ...current, ...patch }));
  const editing = editingId ? (services.find((svc) => svc.id === editingId) ?? null) : null;
  const activeCount = services.filter((svc) => svc.isActive).length;
  const withPhotos = services.filter(hasMedia).length;

  const close = useCallback(() => {
    setEditingId(null);
    setForm(emptyServiceForm);
    setFormOpen(false);
    onEditStarted();
  }, [setEditingId, setForm, setFormOpen, onEditStarted]);

  const submit = () =>
    run('service', async () => {
      const payload = servicePayload(form);
      if (editingId) {
        const updated = await updateService(editingId, payload);
        setServices((current) => current.map((svc) => (svc.id === editingId ? updated : svc)));
      } else {
        const created = await createService(payload);
        setServices((current) => [...current, created]);
      }
      close();
    });

  const startAdd = () => {
    setEditingId(null);
    setForm(emptyServiceForm);
    setFormOpen(true);
    onEditStarted();
  };

  const startEdit = (svc: Service) => {
    setEditingId(svc.id);
    setForm(formFromService(svc));
    setFormOpen(true);
    onEditStarted();
  };

  const setActive = (id: string, isActive: boolean) =>
    run(`service-active-${id}`, async () => {
      const updated = await toggleServiceActive(id, isActive);
      setServices((current) => current.map((svc) => (svc.id === id ? updated : svc)));
    });

  const setMedia = (serviceId: string, media: ServiceMedia[]) =>
    setServices((current) => current.map((svc) => (svc.id === serviceId ? withMedia(svc, media) : svc)));

  const remove = (id: string) =>
    run(`service-delete-${id}`, async () => {
      await deleteService(id);
      setServices((current) => current.filter((svc) => svc.id !== id));
      if (editingId === id) close();
    });

  if (formOpen) {
    return (
      <View style={styles.column}>
        <HubBack title={editingId ? t('Edit service') : t('Add a service')} onBack={close} />
        <HubCard style={styles.form}>
          <ScInput label={t('Service name')} value={form.name} onChangeText={(name) => change({ name })} />
          <ScTextarea
            label={t('Description (optional)')}
            rows={2}
            value={form.description}
            onChangeText={(description) => change({ description })}
          />
          <View style={styles.group}>
            <FieldLabel>{t('Category')}</FieldLabel>
            <ChipRow>
              {SERVICE_CATEGORY_OPTIONS.map((cat) => (
                <Chip
                  key={cat.value}
                  label={t(cat.label)}
                  selected={form.category === cat.value}
                  onPress={() => change({ category: cat.value })}
                />
              ))}
            </ChipRow>
          </View>

          <PricingBlock
            form={form}
            onChange={change}
            flatLabel={t('Price (₹)')}
            approx={{ value: form.approxPrice, onChange: (approxPrice) => change({ approxPrice }) }}
          />

          <ScInput
            label={t('Duration (mins)')}
            keyboardType="number-pad"
            numeric
            value={form.durationMins}
            onChangeText={(text) => change({ durationMins: sanitizeDigits(text) })}
          />
          <ScButton
            variant="main"
            size="lg"
            disabled={!canSubmitService(form) || saving === 'service'}
            onPress={() => void submit()}
          >
            {saving === 'service' ? t('Saving...') : editingId ? t('Update service') : t('Add service')}
          </ScButton>
        </HubCard>

        {editing ? (
          <CatalogueTools
            item={editing}
            mediaConfig={mediaConfig}
            onMediaChange={(media) => setMedia(editing.id, media)}
            onToggle={() => void setActive(editing.id, !editing.isActive)}
            onDelete={() => setDeleting(editing)}
            busy={saving !== null}
          />
        ) : null}

        <DeleteSheet target={deleting} noun="service" onClose={() => setDeleting(null)} onConfirm={remove} />
      </View>
    );
  }

  return (
    <View style={styles.column}>
      <TileRow>
        <HubTile label={t('Active')} icon={IconCheck} value={String(activeCount)} line={t('On your listing')} />
        <HubTile
          label={t('Photos & video')}
          icon={IconPhoto}
          value={`${withPhotos} / ${services.length}`}
          line={t('Services with photos')}
        />
      </TileRow>

      <View style={styles.section}>
        {services.length === 0 ? (
          <EmptyState
            icon={<IconTool size={28} stroke={1.5} color={colors.textMuted} />}
            title={t('No services yet')}
            subtitle={t('Add what you offer above. Customers can book a service once it is active.')}
          />
        ) : (
          // Under small category headings when the garage sells two or more kinds of
          // work (16 Nov 2026), as the portal; one run otherwise.
          <View accessibilityLabel={t('Your services')} style={styles.groups}>
            {(showCategoryHeadings(serviceGroups) ? serviceGroups : [{ category: null, items: services }]).map(
              (group) => (
                <View key={group.category ?? 'all'} style={styles.list}>
                  {group.category && <CategoryHeading category={group.category} count={group.items.length} />}
                  {group.items.map((svc) => (
                    <CatalogueCard key={svc.id} item={svc} onOpen={() => startEdit(svc)} />
                  ))}
                </View>
              )
            )}
          </View>
        )}
        <HubPill onPress={startAdd}>
          <IconPlus size={16} stroke={1.6} />
          <T size={14} weight={500}>
            {t('Add a service')}
          </T>
        </HubPill>
      </View>

      <AddOnsSection addRequest={0} />
    </View>
  );
}

const useStyles = createStyles(() => ({
  column: { gap: 16 },
  section: { gap: 12 },
  form: { gap: 12, padding: 20 },
  group: { gap: 8 },
  list: { gap: 12 },
  groups: { gap: 12 },
}));
