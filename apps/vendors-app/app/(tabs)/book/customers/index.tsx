import type { BookCustomerRow } from '@repo/core/api/garage-book';
import { useBookCustomers } from '@repo/core/api/hooks/use-garage-book';
import { carName, customerTag, plateText, type BookFilter } from '@repo/core/garage-book';
import { useDebounced } from '@repo/core/hooks/use-debounced';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Edge } from '@repo/native-ui/finish';
import { IconBell, IconSearch } from '@repo/native-ui/icons';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { FILTERS } from '@/components/book/day-list';
import { BookInput, Disc, Empty, Footnote, go, IconWell, Plate, RaisedButton, Seg, Tag } from '@/components/book/parts';

/** Customers (B2; the web's app/book/customers/page.tsx). Detlio customers never show a phone. */
function CustomersScreen() {
  const styles = useStyles();
  const colors = useColors();
  const [filter, setFilter] = useState<BookFilter>('all');
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim(), 250);
  const list = useBookCustomers({ filter, q: search });
  const data = list.data;
  return (
    <BookScreen>
      <View style={styles.title}>
        <T accessibilityRole="header" variant="title">
          Customers
        </T>
        {data ? (
          <T num size={16} weight={600} color={colors.textSecondary}>
            {String(data.counts.all)}
          </T>
        ) : null}
      </View>
      <BookInput
        value={q}
        onChangeText={setQ}
        placeholder="Name, phone or car number"
        accessibilityLabel="Search customers"
        leading={<IconSearch size={20} color="#8E8E98" />}
      />
      <Seg<BookFilter> label="Show customers" value={filter} options={FILTERS(data?.counts)} onChange={setFilter} />
      {data && data.dueCount > 0 ? (
        <Edge radius={22} innerStyle={styles.due}>
          <IconWell>
            <IconBell size={19} color="#F5A524" />
          </IconWell>
          <View style={styles.flex}>
            <T variant="t3" weight={600}>{`${data.dueCount} ${data.dueCount === 1 ? 'customer is' : 'customers are'} due`}</T>
            <T size={12} color={colors.textSecondary}>
              Remind them from your own WhatsApp
            </T>
          </View>
          <RaisedButton label="Remind" height={40} radius={12} onPress={() => go('/book/reminders')} />
        </Edge>
      ) : null}
      {data ? (
        data.customers.length === 0 ? (
          <Empty>{search ? 'No one matches that.' : filter === 'detlio' ? 'No Detlio customers yet.' : 'No customers yet. Add a walk-in with + and they’re here.'}</Empty>
        ) : (
          <View>
            {data.customers.map((row) => (
              <CustomerRow key={row.id} row={row} />
            ))}
          </View>
        )
      ) : list.isError ? (
        <LoadError what="your customers" onRetry={() => void list.refetch()} />
      ) : (
        <SkeletonList count={5} height={64} />
      )}
      <Footnote>
        Customers you bring in are yours, and Detlio never shows them to other garages. Detlio customers show without a phone number; tap Remind and
        Detlio sends it in the Detlio app.
      </Footnote>
    </BookScreen>
  );
}

function CustomerRow({ row }: { row: BookCustomerRow }) {
  const styles = useStyles();
  const colors = useColors();
  const tag = customerTag(row);
  const car = row.cars[0];
  const plate = plateText(car?.plate);
  const sub = row.cars.length > 1 ? `${row.cars.length} cars` : car ? car.model || carName(car) : '';
  return (
    <Pressable accessibilityRole="link" onPress={() => go(`/book/customers/${encodeURIComponent(row.id)}`)} style={styles.row}>
      <Disc name={row.name} />
      <View style={styles.rowText}>
        <View style={styles.rowName}>
          <T variant="t3" weight={600} numberOfLines={1} style={styles.shrink}>
            {row.name}
          </T>
          {row.viaDetlio ? <Tag detlio /> : null}
        </View>
        <View style={styles.rowSub}>
          {plate ? <Plate plate={plate} /> : null}
          <T variant="t4" weight={400} color={colors.textSecondary} numberOfLines={1} style={styles.shrink}>
            {sub}
          </T>
        </View>
      </View>
      <T size={12} weight={600} align="right" color={tag.tone === 'due' ? '#F5A524' : tag.tone === 'owed' ? '#FF8A95' : colors.textMuted} style={styles.tag}>
        {tag.text}
      </T>
    </Pressable>
  );
}

export default garageScreen(CustomersScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  title: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1D1D23' },
  rowText: { flex: 1, minWidth: 0, gap: 4 },
  rowName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowSub: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { maxWidth: 84 },
}));
