import type { MediaConfig } from '@repo/core/api/service-media';
import { SERVICE_CATEGORY_OPTIONS, groupByCategory, showCategoryHeadings } from '@repo/core/categories';
import { withMedia } from '@repo/core/service-media';
import type { Service, ServiceMedia } from '@repo/core/types';
import { type Dispatch, type SetStateAction, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ScButton } from '@repo/native-ui/button';
import { Chip } from '@repo/native-ui/chip';
import { IconPlus, IconTool } from '@repo/native-ui/icons';
import { ScInput, ScTextarea } from '@repo/native-ui/inputs';
import { EmptyState, ScCard } from '@repo/native-ui/primitives';
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
import { CatalogueCard } from './catalogue-card';
import { DeleteSheet } from './delete-sheet';
import { ChipRow, PricingBlock } from './pricing-block';
import { FieldLabel, SectionTitle } from './section-title';
import { useSaver } from './use-saver';
import { useT } from '@repo/core/i18n';

/**
 * The Services tab (apps/vendors/app/services/page.tsx): the add / edit form, then
 * "Your services" with their photos, video and actions. The list and the form live in
 * the screen, as the web's do, so they survive a visit to the Packages tab.
 */
export function ServicesTab({
  services,
  setServices,
  form,
  setForm,
  editingId,
  setEditingId,
  mediaConfig,
  onEditStarted,
}: {
  services: Service[];
  setServices: Dispatch<SetStateAction<Service[]>>;
  form: ServiceForm;
  setForm: Dispatch<SetStateAction<ServiceForm>>;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  mediaConfig: MediaConfig | null;
  /** The form is above the list; bring it into view when Edit fills it. */
  onEditStarted: () => void;
}) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  // "Your services" by category, in the order used everywhere.
  const serviceGroups = groupByCategory(services, (svc) => svc.category);
  const { saving, run } = useSaver();
  const [deleting, setDeleting] = useState<Service | null>(null);
  // Bumped by the heading's "Add add-on": the section opens its sheet.
  const [addOnRequest, setAddOnRequest] = useState(0);
  const change = (patch: Partial<ServiceForm>) => setForm((current) => ({ ...current, ...patch }));

  const reset = () => {
    setEditingId(null);
    setForm(emptyServiceForm);
  };

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
      reset();
    });

  const startEdit = (svc: Service) => {
    setEditingId(svc.id);
    setForm(formFromService(svc));
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
    });

  return (
    <View style={styles.column}>
      <View style={styles.section}>
        <SectionTitle
          title={editingId ? t('Edit service') : t('Add a service')}
          onCancel={editingId ? reset : undefined}
          // The real tab has no "add service" button, only this form, so "Add add-on" sits in the
          // heading's slot. A quiet link: the screen's one red is Add service.
          action={
            <Pressable
              accessibilityRole="button"
              onPress={() => setAddOnRequest((n) => n + 1)}
              hitSlop={6}
              style={styles.addOn}
            >
              <IconPlus size={15} color={colors.textSecondary} />
              <T size={13} weight={500} color={colors.textSecondary}>
                {t('Add add-on')}
              </T>
            </Pressable>
          }
        />
        <ScCard style={styles.form}>
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
        </ScCard>
      </View>

      <View style={styles.section}>
        <SectionTitle title={t('Your services')} count={services.length} />
        {services.length === 0 ? (
          <EmptyState
            icon={<IconTool size={28} stroke={1.5} color={colors.textMuted} />}
            title={t('No services yet')}
            subtitle={t('Add what you offer above. Customers can book a service once it is active.')}
          />
        ) : (
          // Under small category headings when the garage sells two or more kinds of
          // work (16 Nov 2026), as the portal; one run otherwise.
          <View style={styles.groups}>
            {(showCategoryHeadings(serviceGroups) ? serviceGroups : [{ category: null, items: services }]).map(
              (group) => (
                <View key={group.category ?? 'all'} style={styles.list}>
                  {group.category && <CategoryHeading category={group.category} count={group.items.length} />}
                  {group.items.map((svc) => (
                    <CatalogueCard
                      key={svc.id}
                      item={svc}
                      mediaConfig={mediaConfig}
                      onMediaChange={(media) => setMedia(svc.id, media)}
                      onEdit={() => startEdit(svc)}
                      onToggle={() => void setActive(svc.id, !svc.isActive)}
                      onDelete={() => setDeleting(svc)}
                      busy={saving !== null}
                    />
                  ))}
                </View>
              )
            )}
          </View>
        )}
      </View>

      <AddOnsSection addRequest={addOnRequest} />

      <DeleteSheet target={deleting} noun="service" onClose={() => setDeleting(null)} onConfirm={remove} />
    </View>
  );
}

const useStyles = createStyles((colors) => ({
  column: { gap: 20 },
  section: { gap: 12 },
  form: { gap: 12 },
  group: { gap: 8 },
  list: { gap: 8 },
  groups: { gap: 12 },
  addOn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, marginVertical: -10 },
}));
