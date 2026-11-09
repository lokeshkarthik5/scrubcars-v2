import { useBypassStatus } from '@repo/core/api/hooks/use-bypass-reports';
import { bookingReference } from '@repo/core/booking-types';
import { BYPASS_QUESTION } from '@repo/core/bypass-reports';
import { COMPLAINT_ACKNOWLEDGE_HOURS } from '@repo/core/complaints';
import { telHref, whatsAppHref } from '@repo/core/contact-links';
import { contactWindowState, garageNumberHiddenLine } from '@repo/core/contact-window';
import { useNow } from '@repo/core/hooks/use-now';
import { useT } from '@repo/core/i18n';
import { SUPPORT_TEL_HREF, supportWhatsAppHref } from '@repo/core/support';
import type { Booking } from '@repo/core/types';
import { Label, ScButton } from '@repo/native-ui/button';
import { IconBrandWhatsapp, IconChevronRight, IconCircleX, IconFlag, IconMessageReport, IconPhone, IconPhoneOff } from '@repo/native-ui/icons';
import { AFTER_SHEET_MS, ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { RaiseComplaintSheet } from '@/components/complaints/raise-complaint-sheet';
import { openLink } from '@/lib/open-link';
import { track } from '@/lib/shims/analytics';

import { mayBeReportable, ReportBypassSheet } from './report-bypass';

const ENDED: ReadonlySet<Booking['status']> = new Set(['cancelled', 'rescheduled']);

/** ContactButtons (packages/ui/src/sc/contact-buttons.tsx): Call and WhatsApp, each only with a number. */
export function ContactButtons({ who, callHref, whatsApp }: { who: string; callHref: string | null; whatsApp: string | null }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  if (!callHref && !whatsApp) return null;
  return (
    <View style={styles.contact}>
      {callHref ? (
        <Pressable accessibilityRole="link" accessibilityLabel={t('Call {name}', { name: who })} onPress={() => openLink(callHref)} style={styles.contactLink}>
          <IconPhone size={16} color={colors.textPrimary} />
          <T size={13} weight={500} lh={18}>
            {t('Call')}
          </T>
        </Pressable>
      ) : null}
      {whatsApp ? (
        <Pressable accessibilityRole="link" accessibilityLabel={t('WhatsApp {name}', { name: who })} onPress={() => openLink(whatsApp)} style={styles.contactLink}>
          <IconBrandWhatsapp size={16} color="#25D366" />
          <T size={13} weight={500} lh={18}>
            WhatsApp
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** BookingHelpSheet (apps/users/components/booking-help-sheet.tsx). */
export function BookingHelpSheet({ open, onClose, booking }: { open: boolean; onClose: () => void; booking: Booking }) {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const [reporting, setReporting] = useState(false);
  const [raising, setRaising] = useState(false);
  const bypass = useBypassStatus(booking.id, open && mayBeReportable(booking)).data;
  const now = useNow(30_000);
  useEffect(() => {
    if (open) track('help_view', { step: 'booking' });
  }, [open]);
  const reference = `#${bookingReference(booking.id)}`;
  const garage = booking.garage;
  const windowState = contactWindowState(booking.contactWindow, now);
  const showGarage = !ENDED.has(booking.status) && !!garage && windowState === 'open';
  const garageHidden = !ENDED.has(booking.status) && windowState !== 'open' ? windowState : null;
  const garageCall = showGarage ? telHref(garage?.phone) : null;
  const garageMessage = `Hi, this is about my Detlio booking ${reference} with you for ${booking.scheduledAt}.`;
  const garageWhatsApp = showGarage ? (whatsAppHref(garage?.whatsapp, garageMessage) ?? whatsAppHref(garage?.phone, garageMessage)) : null;
  return (
    <ScSheet horizontalPadding={16} open={open} onClose={onClose} accessibilityLabel={t('Help with this booking')}>
      <View style={styles.column}>
        <View style={styles.head}>
          <View style={styles.grow}>
            <T size={16} weight={600} lh={22}>
              {t('Help with this booking')}
            </T>
            <T size={12} lh={16} color={colors.textSecondary} style={styles.mt4}>
              {t('Booking {reference} · {name} · {when}', { reference, name: booking.vendorName, when: booking.scheduledAt })}
            </T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Close')} onPress={onClose} style={styles.close}>
            <IconCircleX size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        {garageCall || garageWhatsApp ? (
          <View style={styles.section}>
            <View>
              <T size={13} weight={600} lh={18}>
                {booking.vendorName}
              </T>
              <T size={12} lh={16} color={colors.textSecondary}>
                {booking.bookingType === 'doorstep'
                  ? t('For timings, finding your place, or questions about the work.')
                  : booking.bookingType === 'pickup'
                    ? t('For the pickup and return times, where your car is, or questions about the work.')
                    : t('For timings, finding the garage, or questions about the work.')}
              </T>
            </View>
            <ContactButtons who={booking.vendorName} callHref={garageCall} whatsApp={garageWhatsApp} />
          </View>
        ) : null}
        {garageHidden ? (
          <View style={styles.sectionTight}>
            <T size={13} weight={600} lh={18}>
              {booking.vendorName}
            </T>
            <View style={styles.hidden}>
              <IconPhoneOff size={14} color={colors.textSecondary} />
              <T size={12} lh={16} color={colors.textSecondary} style={styles.grow}>
                {`${garageNumberHiddenLine(garageHidden)} ${garageHidden === 'before' ? t('Until then, the Detlio team can pass a message on.') : t('The Detlio team can reach them for you.')}`}
              </T>
            </View>
          </View>
        ) : null}
        <View style={styles.section}>
          <View>
            <T size={13} weight={600} lh={18}>
              {t('Detlio team')}
            </T>
            <T size={12} lh={16} color={colors.textSecondary}>
              {t("For payments and refunds, or if something isn't right. We'll take it up with the garage for you.")}
            </T>
          </View>
          <ContactButtons
            who={t('Detlio support')}
            callHref={SUPPORT_TEL_HREF}
            whatsApp={supportWhatsAppHref(`Hi Detlio, I need help with booking ${reference} at ${booking.vendorName} (${booking.scheduledAt}).`)}
          />
        </View>
        <View style={styles.section}>
          <View>
            <T size={13} weight={600} lh={18}>
              {t('Make a complaint')}
            </T>
            <T size={12} lh={16} color={colors.textSecondary}>
              {t('In writing, with a complaint number to quote. We reply within {hours} hours.', { hours: COMPLAINT_ACKNOWLEDGE_HOURS })}
            </T>
          </View>
          <ScButton
            variant="outline"
            height={44}
            onPress={() => setRaising(true)}
          >
            <IconMessageReport size={18} color={colors.textPrimary} />
            <Label>{t('Raise a complaint')}</Label>
          </ScButton>
        </View>
        {bypass?.canReport ? (
          <View style={styles.section}>
            <View>
              <T size={13} weight={600} lh={18}>
                {t(BYPASS_QUESTION)}
              </T>
              <T size={12} lh={16} color={colors.textSecondary}>
                {t('Tell us in confidence. The garage is never told who reported it.')}
              </T>
            </View>
            <ScButton variant="outline" height={44} onPress={() => setReporting(true)}>
              <IconFlag size={18} color={colors.textPrimary} />
              <Label>{t('Tell us what happened')}</Label>
            </ScButton>
          </View>
        ) : null}
        <Pressable accessibilityRole="link" onPress={() => {
            onClose();
            setTimeout(() => router.push('/help' as Href), AFTER_SHEET_MS);
          }} style={styles.faq}>
          <T size={13} lh={18} color={colors.textSecondary}>
            {`${t('Common questions:')} `}
            <T size={13} weight={500} lh={18}>
              {t('Help centre')}
            </T>
          </T>
          <IconChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      </View>
      <RaiseComplaintSheet
        open={raising}
        onClose={() => {
          setRaising(false);
          onClose();
        }}
        booking={{ id: booking.id, reference, vendorName: booking.vendorName }}
      />
      {bypass?.canReport ? (
        <ReportBypassSheet
          open={reporting}
          onClose={() => {
            setReporting(false);
            onClose();
          }}
          booking={{ id: booking.id, reference, vendorName: booking.vendorName }}
          rewardOffered={bypass.rewardOffered}
          rewardAmount={bypass.rewardAmount}
        />
      ) : null}
    </ScSheet>
  );
}

const useStyles = createStyles((c) => ({
  column: { gap: 20 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  mt4: { marginTop: 4 },
  close: { marginRight: -8, marginTop: -4, height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 8 },
  sectionTight: { gap: 4 },
  hidden: { flexDirection: 'row', gap: 6 },
  faq: { marginHorizontal: -4, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4 },
  contact: { flexDirection: 'row', gap: 8 },
  contactLink: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 12 },
}));
