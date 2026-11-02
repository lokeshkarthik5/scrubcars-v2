import { BOOKING_TYPE_LABELS, bookingReference } from '@repo/core/booking-types';
import { directionsHref } from '@repo/core/contact-links';
import { contactWindowState, customerNumberHiddenLine, garageSupportMessage } from '@repo/core/contact-window';
import { supportWhatsAppHref } from '@repo/core/support';
import type { Booking } from '@repo/core/types';
import { Pressable, StyleSheet, View } from 'react-native';

import { openLink } from '@/lib/open-link';
import { colors } from '@/lib/theme';

import { IconBrandWhatsapp, IconCar, IconHome, IconMapPin, IconNavigation, IconPhoneOff } from './icons';
import { T } from './text';

const OPEN_STATUSES: ReadonlySet<Booking['status']> = new Set(['pending', 'confirmed', 'in_progress']);
const ENDED_STATUSES: ReadonlySet<Booking['status']> = new Set(['cancelled', 'rescheduled']);

/**
 * JobContact on the job page, whose header has its own Call and WhatsApp (the web's
 * callButtons={false}): where the job is, with Maps, and Detlio support outside the
 * contact window. The window is the server's: the number comes only while it is open.
 */
export function JobContact({ booking, now }: { booking: Booking; now: number }) {
  const doorstep = booking.bookingType === 'doorstep';
  const pickup = booking.bookingType === 'pickup';
  const open = OPEN_STATUSES.has(booking.status);
  const windowState = contactWindowState(booking.contactWindow, now);
  const ended = ENDED_STATUSES.has(booking.status);
  const who = booking.customerName || 'the customer';
  const location = (doorstep || pickup) && open ? booking.jobLocation : undefined;
  const city = booking.garage?.city;
  const mapsHref = location
    ? directionsHref({
        ...location,
        address:
          city && !location.address.toLowerCase().includes(city.toLowerCase())
            ? `${location.address}, ${city}`
            : location.address,
      })
    : null;

  return (
    <View style={styles.column}>
      {pickup ? (
        <View style={styles.badge}>
          <IconCar size={16} />
          <T size={15} weight={500}>
            {BOOKING_TYPE_LABELS.pickup}
          </T>
        </View>
      ) : (
        <View style={styles.type}>
          {doorstep ? <IconHome size={16} /> : <IconMapPin size={16} />}
          <T size={15} weight={500}>
            {BOOKING_TYPE_LABELS[booking.bookingType]}
          </T>
        </View>
      )}

      {location ? (
        <View style={styles.address}>
          <View>
            {pickup ? (
              <T size={13} color={colors.textSecondary}>
                Collect from and return to
              </T>
            ) : null}
            <T size={15}>{location.address}</T>
            {location.lat === null || location.lng === null ? (
              <T size={13} color={colors.textSecondary} style={styles.mt}>
                No map pin on this address. Call to confirm the spot.
              </T>
            ) : null}
          </View>
          {mapsHref ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open in Maps for ${who}`}
              onPress={() => openLink(mapsHref)}
              style={styles.maps}
            >
              <IconNavigation size={16} />
              <T size={15} weight={500}>
                Open in Maps
              </T>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!ended && windowState !== 'open' ? (
        <View style={styles.hidden}>
          <View style={styles.hiddenLine}>
            <IconPhoneOff size={16} color={colors.textSecondary} />
            <T size={15} color={colors.textSecondary} style={styles.flex}>
              {customerNumberHiddenLine(windowState)}
            </T>
          </View>
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              openLink(
                supportWhatsAppHref(garageSupportMessage(booking.vendorName, `#${bookingReference(booking.id)}`))
              )
            }
            style={styles.support}
          >
            <IconBrandWhatsapp size={16} color="#25D366" />
            <T size={15} color={colors.textSecondary} style={styles.flex}>
              {'Need to reach the customer? '}
              <T size={15} weight={500} style={styles.underline}>
                Contact Detlio support
              </T>
            </T>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  column: { gap: 8 },
  type: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  address: { gap: 8, borderRadius: 10, backgroundColor: colors.surfaceElevated, paddingHorizontal: 12, paddingVertical: 10 },
  mt: { marginTop: 2 },
  maps: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
  },
  hidden: { borderRadius: 10, backgroundColor: colors.surfaceElevated, paddingHorizontal: 12, paddingTop: 10 },
  hiddenLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  support: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 },
  underline: { textDecorationLine: 'underline' },
});
