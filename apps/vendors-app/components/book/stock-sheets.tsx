import type { StockItem, Supplier } from '@repo/core/api/garage-book';
import { useAddStockItem, useAddSupplier, useCountStock, useRemoveStockItem, useSuppliers, useUpdateStockItem } from '@repo/core/api/hooks/use-garage-book';
import { GARAGE_BOOK_LIMITS, STOCK_UNITS, type StockUnit } from '@repo/core/garage-book';
import { useT } from '@repo/core/i18n';
import { normaliseIndianMobile } from '@repo/core/phone';
import { useState } from 'react';
import { View } from 'react-native';

import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { countTyping, moneyTyping, rupeesToPaise, unitWord } from '@/lib/garage-book-2';

import { BookInput, Chip, FieldLabel, Footnote, RaisedButton } from './parts';

const failedWith = (t: (english: string) => string) => (error: unknown) =>
  toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again."));

/** "Count it" (any seat): what is on the shelf now, which becomes the level. */
export function CountSheet({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const t = useT();
  const styles = useStyles();
  const count = useCountStock();
  const [text, setText] = useState('');
  const level = countTyping(text);
  return (
    <ScSheet open onClose={onClose} accessibilityLabel={t('Count {name}', { name: item.name })} horizontalPadding={16}>
      <View style={styles.sheet}>
        <T variant="t2">{t('Count {name}', { name: item.name })}</T>
        <FieldLabel>{t('How much is left ({unit})', { unit: unitWord(item.unit) })}</FieldLabel>
        <BookInput value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder={String(item.level)} autoFocus accessibilityLabel={t('How much is left')} />
        <Footnote>{t('What you count becomes the level. Jobs take from it by themselves after that.')}</Footnote>
        <RaisedButton
          label={count.isPending ? t('Saving…') : t('Save count')}
          disabled={level === null || count.isPending}
          onPress={() =>
            level !== null &&
            count.mutate(
              { id: item.id, level },
              {
                onSuccess: () => {
                  toast.success(t('Counted'));
                  onClose();
                },
                onError: failedWith(t),
              }
            )
          }
        />
      </View>
    </ScSheet>
  );
}

/** Add an item to Stock, or change one (the owner's): what it is, its unit, when it is low, its pack and supplier. */
export function StockItemSheet({ item, onClose, onRemoved }: { item: StockItem | null; onClose: () => void; onRemoved?: () => void }) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const suppliers = useSuppliers();
  const add = useAddStockItem();
  const update = useUpdateStockItem();
  const remove = useRemoveStockItem();
  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState<StockUnit>(item?.unit ?? 'ml');
  const [level, setLevel] = useState(item ? String(item.level) : '');
  const [lowAt, setLowAt] = useState(item ? String(item.lowAt) : '');
  const [packSize, setPackSize] = useState(item?.packSize ? String(item.packSize) : '');
  const [price, setPrice] = useState(item?.packPricePaise ? String(item.packPricePaise / 100) : '');
  const [supplierId, setSupplierId] = useState<string | null>(item?.supplier?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const levelValue = level.trim() === '' ? 0 : countTyping(level);
  const lowValue = lowAt.trim() === '' ? 0 : countTyping(lowAt);
  const packValue = packSize.trim() === '' ? null : countTyping(packSize);
  const pricePaise = price.trim() === '' ? null : rupeesToPaise(price, 100_000);
  const ready =
    name.trim().length > 0 && levelValue !== null && lowValue !== null && (packSize.trim() === '' || (packValue !== null && packValue > 0)) && (price.trim() === '' || pricePaise !== null);
  const busy = add.isPending || update.isPending || remove.isPending;
  const save = () => {
    if (!ready || levelValue === null || lowValue === null) return;
    const fields = { name: name.trim(), unit, lowAt: lowValue, packSize: packValue, packPricePaise: pricePaise, supplierId };
    if (item) update.mutate({ id: item.id, patch: fields }, { onSuccess: onClose, onError: failedWith(t) });
    else add.mutate({ ...fields, level: levelValue }, { onSuccess: onClose, onError: failedWith(t) });
  };
  return (
    <ScSheet open onClose={onClose} accessibilityLabel={item ? t('Change {name}', { name: item.name }) : t('Add to stock')} horizontalPadding={16}>
      <View style={styles.sheet}>
        <T variant="t2">{item ? item.name : t('Add to stock')}</T>
        <FieldLabel>{t('Name')}</FieldLabel>
        <BookInput value={name} onChangeText={setName} maxLength={GARAGE_BOOK_LIMITS.nameMax} placeholder={t('Foam shampoo')} accessibilityLabel={t('Name')} />
        <FieldLabel>{t('Measured in')}</FieldLabel>
        <View style={styles.wrap}>
          {STOCK_UNITS.map((key) => (
            <Chip key={key} label={unitWord(key)} on={unit === key} onPress={() => setUnit(key)} />
          ))}
        </View>
        <View style={styles.pair}>
          {!item ? (
            <View style={styles.flex}>
              <FieldLabel>{t('Have now')}</FieldLabel>
              <BookInput value={level} onChangeText={setLevel} keyboardType="decimal-pad" placeholder="0" accessibilityLabel={t('Have now')} />
            </View>
          ) : null}
          <View style={styles.flex}>
            <FieldLabel>{t('Low at')}</FieldLabel>
            <BookInput value={lowAt} onChangeText={setLowAt} keyboardType="decimal-pad" placeholder="0" accessibilityLabel={t('Low at')} />
          </View>
        </View>
        <View style={styles.pair}>
          <View style={styles.flex}>
            <FieldLabel>{t('One pack ({unit})', { unit: unitWord(unit) })}</FieldLabel>
            <BookInput value={packSize} onChangeText={setPackSize} keyboardType="decimal-pad" placeholder="5000" accessibilityLabel={t('One pack')} />
          </View>
          <View style={styles.flex}>
            <FieldLabel>{t('Pack price (₹)')}</FieldLabel>
            <BookInput value={price} onChangeText={(text) => setPrice(moneyTyping(text))} keyboardType="decimal-pad" placeholder="1150" accessibilityLabel={t('Pack price')} />
          </View>
        </View>
        <FieldLabel>{t('Supplier')}</FieldLabel>
        <View style={styles.wrap}>
          {(suppliers.data ?? []).map((supplier) => (
            <Chip key={supplier.id} label={supplier.name} on={supplierId === supplier.id} onPress={() => setSupplierId(supplierId === supplier.id ? null : supplier.id)} />
          ))}
          <Chip label={t('+ New supplier')} on={false} onPress={() => setAdding(true)} />
        </View>
        {adding ? (
          <NewSupplier
            onAdded={(supplier) => {
              setSupplierId(supplier.id);
              setAdding(false);
            }}
          />
        ) : null}
        <RaisedButton label={busy ? t('Saving…') : item ? t('Save') : t('Add to stock')} disabled={!ready || busy} onPress={save} />
        {item ? (
          <T
            variant="t4"
            color="#FF8A95"
            align="center"
            style={styles.remove}
            onPress={() =>
              confirmRemove
                ? remove.mutate(item.id, {
                    onSuccess: () => {
                      onClose();
                      onRemoved?.();
                    },
                    onError: failedWith(t),
                  })
                : setConfirmRemove(true)
            }
          >
            {confirmRemove ? t('Tap again to take it off Stock') : t('Take off Stock')}
          </T>
        ) : (
          <T size={12} color={colors.textSecondary}>
            {t('After you add it, open it to say how much each service uses.')}
          </T>
        )}
      </View>
    </ScSheet>
  );
}

/** A supplier's name and WhatsApp number, added in place. */
export function NewSupplier({ onAdded }: { onAdded: (supplier: Supplier) => void }) {
  const t = useT();
  const styles = useStyles();
  const add = useAddSupplier();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const digits = normaliseIndianMobile(phone);
  const phoneOk = phone.trim() === '' || /^[6-9]\d{9}$/.test(digits);
  return (
    <View style={styles.supplier}>
      <BookInput value={name} onChangeText={setName} maxLength={GARAGE_BOOK_LIMITS.nameMax} placeholder={t('Supplier’s name')} accessibilityLabel={t('Supplier’s name')} />
      <BookInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={16} placeholder={t('WhatsApp number')} accessibilityLabel={t('WhatsApp number')} />
      <RaisedButton
        label={add.isPending ? t('Saving…') : t('Add supplier')}
        height={40}
        disabled={!name.trim() || !phoneOk || add.isPending}
        onPress={() => add.mutate({ name: name.trim(), ...(phone.trim() ? { phone: digits } : {}) }, { onSuccess: onAdded, onError: failedWith(t) })}
      />
    </View>
  );
}

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0, gap: 8 },
  sheet: { gap: 12, paddingBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 6 },
  pair: { flexDirection: 'row', gap: 8 },
  supplier: { gap: 8 },
  remove: { minHeight: 44, paddingTop: 12 },
}));
