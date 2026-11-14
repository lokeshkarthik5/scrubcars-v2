import type { TeamMember } from '@repo/core/api/garage-book';
import { useAddTeamMember, useBookTeam, useRemoveTeamMember, useUpdateTeamMember } from '@repo/core/api/hooks/use-garage-book';
import { GARAGE_BOOK_2_LIMITS, GARAGE_BOOK_LIMITS, rupees } from '@repo/core/garage-book';
import { msg, useT } from '@repo/core/i18n';
import { normaliseIndianMobile } from '@repo/core/phone';
import { useState } from 'react';
import { View } from 'react-native';

import { Edge, Raised, RedLight } from '@repo/native-ui/finish';
import { PressScale } from '@repo/native-ui/motion';
import { LoadError, SkeletonList } from '@repo/native-ui/primitives';
import { ScSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { toast } from '@repo/native-ui/toast';

import { garageScreen } from '@/components/app-shell';
import { BookScreen } from '@/components/book/book-screen';
import { AddButton, AMBER, BackHeader, BookInput, Disc, Empty, FieldLabel, Footnote, Overline, RaisedButton, Seg, Switch } from '@/components/book/parts';
import { useIsVendorAdmin } from '@/lib/auth';
import { onNowLine } from '@/lib/garage-book-2';

type Show = 'today' | 'month';

/** Team (T1; the web's app/book/team/page.tsx). Staff see the list without money. */
function TeamScreen() {
  const t = useT();
  const styles = useStyles();
  const isOwner = useIsVendorAdmin();
  const [show, setShow] = useState<Show>('month');
  const [editing, setEditing] = useState<TeamMember | 'new' | null>(null);
  const team = useBookTeam(undefined);
  const data = team.data;
  return (
    <BookScreen>
      <BackHeader title={t('Team')} right={isOwner ? <AddButton label={t('Add')} accessibilityLabel={t('Add a person')} onPress={() => setEditing('new')} /> : null} />
      <Seg<Show>
        label={msg('Show')}
        value={show}
        onChange={setShow}
        options={[
          { value: 'today', label: msg('Today') },
          { value: 'month', label: msg('This month') },
        ]}
      />
      {!data ? (
        team.isError ? <LoadError what={t('your team')} onRetry={() => void team.refetch()} /> : <SkeletonList count={3} height={84} />
      ) : data.members.length === 0 ? (
        <Empty>{isOwner ? t('Add the people who work with you. Pick who did each job when you finish it.') : t('No one in your team yet')}</Empty>
      ) : (
        <>
          <View style={styles.list}>
            {data.members.map((member) => (
              <MemberCard key={member.id} member={member} show={show} isOwner={isOwner} onPress={isOwner ? () => setEditing(member) : undefined} />
            ))}
          </View>
          <Edge radius={20} innerStyle={styles.doneBy}>
            <Overline>{t('When you finish a job · who did it?')}</Overline>
            <View accessible accessibilityLabel={t('Done by')} style={styles.chips}>
              {data.members.slice(0, 3).map((member, index) => (
                <Raised key={member.id} radius={14} style={styles.chip} innerStyle={styles.chipInner}>
                  <T size={13} weight={index === 0 ? 600 : 500} numberOfLines={1}>
                    {member.name.split(' ')[0] ?? member.name}
                  </T>
                  <RedLight state={index === 0 ? 'on' : 'dim'} width={18} />
                </Raised>
              ))}
            </View>
          </Edge>
        </>
      )}
      <Footnote>{t('Your team needs no login. Only you see the money; staff logins see jobs only.')}</Footnote>
      {isOwner && editing ? <MemberSheet member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </BookScreen>
  );
}

function MemberCard({ member, show, isOwner, onPress }: { member: TeamMember; show: Show; isOwner: boolean; onPress?: () => void }) {
  const t = useT();
  const styles = useStyles();
  const colors = useColors();
  const count = show === 'today' ? member.jobsToday : member.jobs;
  const work = isOwner && show === 'month' && member.valuePaise !== undefined ? t('jobs · {amount} of work', { amount: rupees(member.valuePaise) ?? '₹0' }) : t('jobs');
  const body = (
    <Edge radius={20} innerStyle={styles.card}>
      <Disc name={member.name} />
      <View style={styles.flex}>
        <View style={styles.line}>
          <T size={15} weight={600} numberOfLines={1} style={styles.shrink}>
            {member.name}
          </T>
          <T num size={18} weight={600}>
            {String(count)}
          </T>
        </View>
        <View style={[styles.line, styles.sub]}>
          <T size={12} color={colors.textSecondary} numberOfLines={1} style={styles.shrink}>
            {member.role ?? ''}
          </T>
          <T size={12} color={colors.textSecondary} numberOfLines={1}>
            {work}
          </T>
        </View>
        {member.onNow ? (
          <View style={styles.onNow}>
            <View style={styles.dot} />
            <T size={12} color="#8DB8FF" numberOfLines={1} style={styles.shrink}>
              {onNowLine(member.onNow)}
            </T>
          </View>
        ) : null}
        {isOwner && member.advancePaise ? (
          <T size={12} color={AMBER} style={styles.extra}>
            {t('Advance {amount} this month', { amount: rupees(member.advancePaise) ?? '' })}
          </T>
        ) : null}
        {member.offToday ? (
          <T size={12} color={colors.textSecondary} style={styles.extra}>
            {t('Day off today')}
          </T>
        ) : null}
      </View>
    </Edge>
  );
  if (!onPress) return body;
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={t('Change {name}', { name: member.name })} onPress={onPress}>
      {body}
    </PressScale>
  );
}

/** Add a person, or change one: name, what they do, a phone if wanted, a day off, or take them off the team. */
function MemberSheet({ member, onClose }: { member: TeamMember | null; onClose: () => void }) {
  const t = useT();
  const styles = useStyles();
  const add = useAddTeamMember();
  const update = useUpdateTeamMember();
  const remove = useRemoveTeamMember();
  const [name, setName] = useState(member?.name ?? '');
  const [role, setRole] = useState(member?.role ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [off, setOff] = useState(member?.offToday ?? false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const digits = normaliseIndianMobile(phone);
  const phoneOk = phone.trim() === '' || /^[6-9]\d{9}$/.test(digits);
  const ready = name.trim().length > 0 && phoneOk;
  const busy = add.isPending || update.isPending || remove.isPending;
  const failed = (error: unknown) => toast.error(error instanceof Error ? error.message : t("Couldn't save. Try again."));
  const save = () => {
    if (!ready) return;
    if (member) {
      update.mutate(
        { id: member.id, patch: { name: name.trim(), role: role.trim() || null, phone: phone.trim() ? digits : null, offToday: off } },
        { onSuccess: onClose, onError: failed }
      );
    } else {
      add.mutate(
        { name: name.trim(), ...(role.trim() ? { role: role.trim() } : {}), ...(phone.trim() ? { phone: digits } : {}) },
        {
          onSuccess: () => {
            toast.success(t('{name} is in your team', { name: name.trim() }));
            onClose();
          },
          onError: failed,
        }
      );
    }
  };
  return (
    <ScSheet open onClose={onClose} accessibilityLabel={member ? member.name : t('Add a person')} horizontalPadding={16}>
      <View style={styles.sheet}>
        <T variant="t2">{member ? member.name : t('Add a person')}</T>
        <FieldLabel>{t('Name')}</FieldLabel>
        <BookInput value={name} onChangeText={setName} maxLength={GARAGE_BOOK_LIMITS.nameMax} placeholder={t('Arun')} accessibilityLabel={t('Name')} />
        <FieldLabel>{t('What they do')}</FieldLabel>
        <BookInput value={role} onChangeText={setRole} maxLength={GARAGE_BOOK_2_LIMITS.roleMax} placeholder={t('Washer')} accessibilityLabel={t('What they do')} />
        <FieldLabel>{t('Phone (if you want)')}</FieldLabel>
        <BookInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={16} placeholder="98400 12345" accessibilityLabel={t('Phone')} />
        {!phoneOk ? (
          <T size={12} weight={600} color="#FF8A95">
            {t('Enter a 10-digit mobile number')}
          </T>
        ) : null}
        {member ? (
          <View style={styles.offRow}>
            <T variant="t3" weight={500} style={styles.flex}>
              {t('Day off today')}
            </T>
            <Switch checked={off} onChange={setOff} label={t('Day off today')} />
          </View>
        ) : null}
        <RaisedButton label={busy ? t('Saving…') : member ? t('Save') : t('Add to team')} disabled={!ready || busy} onPress={save} />
        {member ? (
          <T
            variant="t4"
            color="#FF8A95"
            align="center"
            style={styles.remove}
            onPress={() =>
              confirmRemove
                ? remove.mutate(member.id, {
                    onSuccess: () => {
                      toast.success(t('{name} is off the team', { name: member.name }));
                      onClose();
                    },
                    onError: failed,
                  })
                : setConfirmRemove(true)
            }
          >
            {confirmRemove ? t('Tap again to take {name} off', { name: member.name }) : t('Take off the team')}
          </T>
        ) : null}
      </View>
    </ScSheet>
  );
}

export default garageScreen(TeamScreen);

const useStyles = createStyles(() => ({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  list: { gap: 8 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sub: { marginTop: 2 },
  onNow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#8DB8FF' },
  extra: { marginTop: 4 },
  doneBy: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1 },
  chipInner: { minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6 },
  sheet: { gap: 12, paddingBottom: 8 },
  offRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  remove: { minHeight: 44, paddingTop: 12 },
}));
