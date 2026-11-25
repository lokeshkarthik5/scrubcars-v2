import { useCreateBookCustomer } from '@repo/core/api/hooks/use-garage-book';
import { GARAGE_BOOK_LIMITS } from '@repo/core/garage-book';
import { useT } from '@repo/core/i18n';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { RedButton } from '@repo/native-ui/finish';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { BackHeader, BookInput } from '@/components/book/parts';

/** A field's name with "· optional" after it in the quieter grey. */
function Label({ children, optional }: { children: string; optional?: boolean }) {
  const t = useT();
  const colors = useColors();
  return (
    <T variant="t4" weight={600} color="#D4D4DA">
      {children}
      {optional ? (
        <T variant="t4" weight={500} color={colors.textMuted}>
          {` · ${t('optional')}`}
        </T>
      ) : null}
    </T>
  );
}

/**
 * New customer (the Customers tab's "+ Add"; the web's app/book/customers/new/page.tsx; owner,
 * 25 Nov 2026): a customer of the garage's own with no job yet. Only the name is needed. A number
 * already saved is refused by the server ("You already have a customer with that number."). Saving
 * opens their page, where "New job" is one tap away.
 */
function NewCustomerScreen() {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [plate, setPlate] = useState('');
  const [car, setCar] = useState('');
  const [note, setNote] = useState('');
  const create = useCreateBookCustomer();
  const ready = name.trim().length > 0 && !create.isPending;

  const save = () => {
    if (!ready) return;
    // "Hyundai Creta" → make Hyundai, model Creta, as New walk-in job splits it.
    const [make, ...model] = car.trim().split(/\s+/);
    const hasCar = plate.trim() || car.trim();
    create.mutate(
      {
        name: name.trim(),
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
        cars: hasCar ? [{ plate: plate.trim() || undefined, make: make || undefined, model: model.join(' ') || undefined }] : undefined,
      },
      {
        onSuccess: (customer) => router.replace(`/book/customers/${encodeURIComponent(customer.id)}` as Href),
        onError: (error) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again.")),
      }
    );
  };

  return (
    <BookScreen
      gap={18}
      hasNav={false}
      footer={
        <RedButton onPress={save} disabled={!ready} height={52} radius={18}>
          {create.isPending ? t('Saving…') : t('Save customer')}
        </RedButton>
      }
    >
      <BackHeader title={t('New customer')} close />

      <View style={styles.group}>
        <Label>{t('Name')}</Label>
        <BookInput
          height={52}
          value={name}
          onChangeText={setName}
          maxLength={GARAGE_BOOK_LIMITS.nameMax}
          accessibilityLabel={t('Name')}
          autoCapitalize="words"
          autoFocus
          returnKeyType="next"
        />
      </View>

      <View style={styles.group}>
        <Label optional>{t('Phone')}</Label>
        <BookInput
          height={52}
          value={phone}
          onChangeText={setPhone}
          maxLength={20}
          placeholder="98400 12345"
          accessibilityLabel={t('Phone')}
          keyboardType="phone-pad"
        />
        <T size={12} color={colors.textMuted}>
          {t('For reminders on WhatsApp. Only you see it.')}
        </T>
      </View>

      <View style={styles.group}>
        <Label optional>{t('Car')}</Label>
        <View style={styles.pair}>
          <BookInput
            height={52}
            value={plate}
            onChangeText={(text) => setPlate(text.toUpperCase())}
            maxLength={20}
            placeholder="TN 09 AB 4521"
            accessibilityLabel={t('Number plate')}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.flex}
          />
          <BookInput
            height={52}
            value={car}
            onChangeText={setCar}
            maxLength={100}
            placeholder={t('Hyundai Creta')}
            accessibilityLabel={t('Car')}
            autoCapitalize="words"
            style={styles.flex}
          />
        </View>
      </View>

      <View style={styles.group}>
        <Label optional>{t('Note')}</Label>
        <BookInput
          height={88}
          value={note}
          onChangeText={setNote}
          maxLength={GARAGE_BOOK_LIMITS.noteMax}
          placeholder={t('Likes tyre shine. Pays on UPI.')}
          accessibilityLabel={t('Note')}
          multiline
          textAlignVertical="top"
          style={styles.note}
        />
      </View>
    </BookScreen>
  );
}

/** A tab screen stays mounted between visits, so each visit gets an empty form (as New walk-in job does). */
function FreshNewCustomer() {
  const [visit, setVisit] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setVisit((n) => n + 1);
    }, [])
  );
  return <NewCustomerScreen key={visit} />;
}

export default garageScreen(FreshNewCustomer);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  group: { gap: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  note: { paddingVertical: 12 },
}));
