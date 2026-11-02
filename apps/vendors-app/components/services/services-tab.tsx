import type { MediaConfig } from '@repo/core/api/service-media';
import { SERVICE_CATEGORY_OPTIONS } from '@repo/core/categories';
import { withMedia } from '@repo/core/service-media';
import type { Service, ServiceMedia } from '@repo/core/types';
import { type Dispatch, type SetStateAction, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScButton } from '@/components/button';
import { Chip } from '@/components/chip';
import { IconTool } from '@/components/icons';
import { ScInput, ScTextarea } from '@/components/inputs';
import { EmptyState, ScCard } from '@/components/primitives';
import {
  canSubmitService,
  emptyServiceForm,
  formFromService,
  type ServiceForm,
  sanitizeDigits,
  servicePayload,
} from '@/lib/service-form';
import { createService, deleteService, toggleServiceActive, updateService } from '@/lib/services-api';
import { colors } from '@/lib/theme';

import { CatalogueCard } from './catalogue-card';
import { DeleteSheet } from './delete-sheet';
import { ChipRow, PricingBlock } from './pricing-block';
import { FieldLabel, SectionTitle } from './section-title';
import { useSaver } from './use-saver';

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
  const { saving, run } = useSaver();
  const [deleting, setDeleting] = useState<Service | null>(null);
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
        <SectionTitle title={editingId ? 'Edit service' : 'Add a service'} onCancel={editingId ? reset : undefined} />
        <ScCard style={styles.form}>
          <ScInput label="Service name" value={form.name} onChangeText={(name) => change({ name })} />
          <ScTextarea
            label="Description (optional)"
            rows={2}
            value={form.description}
            onChangeText={(description) => change({ description })}
          />
          <View style={styles.group}>
            <FieldLabel>Category</FieldLabel>
            <ChipRow>
              {SERVICE_CATEGORY_OPTIONS.map((cat) => (
                <Chip
                  key={cat.value}
                  label={cat.label}
                  selected={form.category === cat.value}
                  onPress={() => change({ category: cat.value })}
                />
              ))}
            </ChipRow>
          </View>

          <PricingBlock form={form} onChange={change} flatLabel="Price (₹)" />

          <ScInput
            label="Duration (mins)"
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
            {saving === 'service' ? 'Saving...' : editingId ? 'Update service' : 'Add service'}
          </ScButton>
        </ScCard>
      </View>

      <View style={styles.section}>
        <SectionTitle title="Your services" count={services.length} />
        {services.length === 0 ? (
          <EmptyState
            icon={<IconTool size={28} stroke={1.5} color={colors.textMuted} />}
            title="No services yet"
            subtitle="Add what you offer above. Customers can book a service once it is active."
          />
        ) : (
          <View style={styles.list}>
            {services.map((svc) => (
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
        )}
      </View>

      <DeleteSheet target={deleting} noun="service" onClose={() => setDeleting(null)} onConfirm={remove} />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 20 },
  section: { gap: 12 },
  form: { gap: 12 },
  group: { gap: 8 },
  list: { gap: 8 },
});
