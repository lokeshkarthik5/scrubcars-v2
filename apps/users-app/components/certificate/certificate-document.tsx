import type { CertificateJob, ServiceHistoryCertificate } from '@repo/core/api/certificates';
import { bodyTypeLabel, CERTIFICATE_SCOPE_NOTE, certificateDateLabel } from '@repo/core/service-history-certificate';
import { tierMedalName } from '@repo/core/tiers';
import { T } from '@repo/native-ui/text';
import { Image, View, StyleSheet, type ImageSourcePropType } from 'react-native';
import Svg, { Circle, Defs, Path, Text as SvgText, TextPath, TSpan } from 'react-native-svg';
import type { ReactNode } from 'react';

const RED = '#E4002B';
const INK = '#0A0A0B';
const SOFT = '#525252';

/** CertificateSeal: the rosette with the words around it. */
export function CertificateSeal({ size = 92 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 120 120" width={size} height={size} accessibilityLabel="Detlio seal">
      <Defs>
        <Path id="seal-ring" d="M60,60 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0" />
      </Defs>
      {Array.from({ length: 24 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        return <Circle key={i} cx={60 + Math.cos(angle) * 54} cy={60 + Math.sin(angle) * 54} r={5.5} fill={RED} />;
      })}
      <Circle cx="60" cy="60" r="54" fill={RED} />
      <Circle cx="60" cy="60" r="49" fill="none" stroke="#FFFFFF" strokeWidth="1.2" />
      <Circle cx="60" cy="60" r="33" fill="none" stroke="#FFFFFF" strokeWidth="1.2" />
      <SvgText fill="#FFFFFF" fontSize="9" fontWeight="700" letterSpacing="2.6">
        <TextPath href="#seal-ring" startOffset="0">
          <TSpan>DETLIO · SERVICE HISTORY ·</TSpan>
        </TextPath>
      </SvgText>
      <SvgText x="60" y="58" textAnchor="middle" fill="#FFFFFF" fontSize="15" fontWeight="700">
        Detlio
      </SvgText>
      <SvgText x="60" y="72" textAnchor="middle" fill="#FFFFFF" fontSize="6.5" fontWeight="600" letterSpacing="1.2">
        RECORD
      </SvgText>
    </Svg>
  );
}

export function photosLine(photos: CertificateJob['photos']): string {
  if (photos.before && photos.after) return 'Before and after photos taken';
  if (photos.before) return 'Before photos taken';
  if (photos.after) return 'After photos taken';
  return 'No photos on record';
}

function Field({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) {
  return (
    <View style={styles.half}>
      <T size={11} weight={600} lh={15} uppercase tracking={0.025} color={SOFT}>
        {label}
      </T>
      <T num={numeric} size={14} weight={500} lh={20} color={INK}>
        {value}
      </T>
    </View>
  );
}

/** CertificateDocument: white paper in either theme, like the receipt. */
export function CertificateDocument({ certificate, showPhotos, photoSource = (value) => ({ uri: value }), verification, issuedLabel = 'Issued' }: { certificate: ServiceHistoryCertificate; showPhotos: boolean; photoSource?: (value: string) => ImageSourcePropType; verification: ReactNode; issuedLabel?: string }) {
  const { car, jobs, totals } = certificate;
  const carName = `${car.make} ${car.model}`;
  return (
    <View accessibilityLabel={`Service History certificate ${certificate.certificateNumber}`} style={styles.doc}>
      <View style={styles.top}>
        <View style={styles.grow}>
          <T size={26} weight={700} lh={28} tracking={-0.025} color={INK}>
            Detlio<T size={26} weight={700} color={RED}>.</T>
          </T>
          <T size={20} weight={600} lh={26} color={INK} style={styles.mt12}>
            Service History
          </T>
          <T size={12} lh={16} color={SOFT} style={styles.mt4}>
            {'Certificate '}
            <T num size={12} weight={500} color={INK}>
              {certificate.certificateNumber}
            </T>
          </T>
          <T size={12} lh={16} color={SOFT}>
            {`${issuedLabel} `}
            <T num size={12} color={SOFT}>
              {certificateDateLabel(certificate.asOf)}
            </T>
          </T>
        </View>
        <CertificateSeal />
      </View>
      <View accessibilityLabel="The car" style={[styles.rule, styles.fields]}>
        <Field label="Car" value={carName} />
        <Field label="Colour" value={car.color || '—'} />
        <Field label="Body type" value={bodyTypeLabel(car.bodyType)} />
        <Field label="Registration" numeric value={car.registration ?? 'Not shown'} />
      </View>
      <View accessibilityLabel="Summary" style={[styles.rule, styles.totals]}>
        <View style={styles.third}>
          <T size={11} weight={600} lh={15} uppercase tracking={0.025} color={SOFT}>
            Jobs through Detlio
          </T>
          <T num size={20} weight={700} lh={26} color={INK}>
            {String(totals.jobs)}
          </T>
        </View>
        <View style={styles.third}>
          <T size={11} weight={600} lh={15} uppercase tracking={0.025} color={SOFT}>
            First service
          </T>
          <T num size={14} weight={500} lh={20} color={INK}>
            {totals.firstServiceOn ? certificateDateLabel(totals.firstServiceOn) : '—'}
          </T>
        </View>
        <View style={styles.third}>
          <T size={11} weight={600} lh={15} uppercase tracking={0.025} color={SOFT}>
            Latest service
          </T>
          <T num size={14} weight={500} lh={20} color={INK}>
            {totals.lastServiceOn ? certificateDateLabel(totals.lastServiceOn) : '—'}
          </T>
        </View>
      </View>
      <View style={styles.rule}>
        <T size={11} weight={600} lh={15} uppercase tracking={0.025} color={SOFT} style={styles.mb8}>
          Jobs, newest first
        </T>
        {jobs.length === 0 ? (
          <T size={13} lh={18} color={SOFT}>
            No completed jobs through Detlio yet.
          </T>
        ) : (
          jobs.map((job, index) => {
            const pair = showPhotos ? job.photoPair : null;
            const date = certificateDateLabel(job.date);
            return (
              <View key={`${job.date}-${index}`} style={[styles.job, index > 0 && styles.dashed]}>
                <T num size={13} weight={500} lh={18} color={INK} style={styles.date}>
                  {date}
                </T>
                <View style={styles.grow}>
                  <T size={14} weight={600} lh={20} color={INK}>
                    {job.services.join(', ') || 'Service'}
                  </T>
                  <T size={12} lh={16} color="#404040">
                    {job.garage.name}
                    {job.garage.tier ? ` · ${tierMedalName(job.garage.tier)}` : ''}
                  </T>
                  <T size={11} lh={15} color={SOFT}>
                    {photosLine(job.photos)}
                  </T>
                  {pair ? (
                    <View style={styles.pair}>
                      {(['before', 'after'] as const).map((stage) => (
                        <View key={stage} style={styles.figure}>
                          <Image source={photoSource(pair[stage])} accessibilityLabel={`${stage === 'before' ? 'Before' : 'After'}: ${job.services.join(', ')} at ${job.garage.name}, ${date}`} style={styles.photo} />
                          <T size={10} lh={13} uppercase tracking={0.025} color={SOFT}>
                            {stage === 'before' ? 'Before' : 'After'}
                          </T>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
      <View style={[styles.rule, styles.foot]}>
        <T size={11} lh={17} color={SOFT}>
          {CERTIFICATE_SCOPE_NOTE}
        </T>
        <T size={11} lh={17} color={SOFT}>
          This is a record of work booked through Detlio, not an inspection report. It says nothing about the car&apos;s condition, mileage or ownership. Garage marks show each garage&apos;s standing on the date above.
        </T>
        <T size={11} weight={500} lh={17} color={INK}>
          Detlio · detlio.com
        </T>
        {verification}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  doc: { gap: 20, borderRadius: 16, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 24 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  grow: { flex: 1, minWidth: 0 },
  mt12: { marginTop: 12 },
  mt4: { marginTop: 4 },
  mb8: { marginBottom: 8 },
  rule: { borderTopWidth: 1, borderTopColor: '#E5E5E5', paddingTop: 16 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  half: { width: '50%', paddingRight: 8 },
  totals: { flexDirection: 'row', gap: 8 },
  third: { flex: 1 },
  job: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  dashed: { borderTopWidth: 1, borderTopColor: '#E5E5E5', borderStyle: 'dashed' },
  date: { width: 88 },
  pair: { flexDirection: 'row', gap: 8, marginTop: 8 },
  figure: { gap: 2 },
  photo: { width: 88, height: 66, borderRadius: 6, borderWidth: 1, borderColor: '#E5E5E5', backgroundColor: '#F5F5F5' },
  foot: { gap: 8 },
});
