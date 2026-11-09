import { addMember, type ApiMember, getMembers, removeMember, transferOwnership, updateMember } from '@repo/core/api/members';
import type { VendorRole } from '@repo/core/api/types';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { ScButton } from '@repo/native-ui/button';
import { ScBadge, ScSelect } from '@/components/form-controls';
import { IconLock, IconTrash } from '@repo/native-ui/icons';
import { ScInput } from '@repo/native-ui/inputs';
import { ScCard, SkeletonList } from '@repo/native-ui/primitives';
import { SectionHeader, TopBar } from '@/components/rows';
import { ConfirmSheet } from '@repo/native-ui/sheet';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { useAuth, useIsVendorAdmin } from '@/lib/auth';
import { errorText } from '@/lib/error-text';
import {
  ADD_NOTE,
  canMakeOwner,
  isTenDigits,
  OWNER_LOCKED,
  PHONE_PROBLEM,
  removePrompt,
  ROLE_OPTIONS,
  ROLE_SHORT_OPTIONS,
  roleLabel,
  suspendChange,
  transferPrompt,
} from '@/lib/members-view';
import { digitsOnly } from '@/lib/settings-logic';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { msg, useT } from '@repo/core/i18n';

// The web's back arrow goes to /settings; in the tab bar `back` would land on Home instead.
const goBack = () => router.navigate('/settings');

type Asking = { kind: 'remove' | 'owner'; member: ApiMember };

/**
 * Settings > Team (apps/vendors/app/settings/members/page.tsx): add a member by phone with a
 * role, and for each member change the role, suspend or restore, remove, or (the owner seat
 * only) make them the owner. The owner's own row is locked for everyone. The owner seat and
 * admins only; the API refuses an operator.
 */
function MembersScreen() {
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const isVendorAdmin = useIsVendorAdmin();
  const isOwner = useAuth((s) => s.isOwner);

  const [members, setMembers] = useState<ApiMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<VendorRole>('vendor_operator');
  const [adding, setAdding] = useState(false);
  const [asking, setAsking] = useState<Asking | null>(null);

  // The gate sends an operator home already; this is the web's own redirect.
  useEffect(() => {
    if (!isVendorAdmin) router.replace('/home');
  }, [isVendorAdmin]);

  const load = useCallback(async () => {
    try {
      setMembers(await getMembers());
    } catch (err) {
      toast.error(errorText(err, t('Failed to load members')));
    } finally {
      setLoading(false);
    }
  }, []);

  // The screen is keyed by garage (garageScreen), so a company switch loads afresh.
  useEffect(() => {
    if (isVendorAdmin) void load();
  }, [isVendorAdmin, load]);

  // The tab stays mounted: read again when it is opened again, where the web's page is new each time.
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (seen.current && isVendorAdmin) void load();
      seen.current = true;
    }, [isVendorAdmin, load])
  );

  const handleAdd = async () => {
    if (!isTenDigits(phone)) {
      toast.error(t(PHONE_PROBLEM));
      return;
    }
    setAdding(true);
    try {
      await addMember({ phone, name: name.trim() || undefined, role });
      setPhone('');
      setName('');
      setRole('vendor_operator');
      await load();
      toast.success(t('Member added'));
    } catch (err) {
      toast.error(errorText(err, t('Failed to add member')));
    } finally {
      setAdding(false);
    }
  };

  const run = async (id: string, action: () => Promise<void>, done: string) => {
    setBusyId(id);
    try {
      await action();
      await load();
      toast.success(t(done));
    } catch (err) {
      toast.error(errorText(err, t('Something went wrong')));
    } finally {
      setBusyId(null);
    }
  };

  const confirmAsked = async () => {
    if (!asking) return;
    const { kind, member } = asking;
    if (kind === 'remove') {
      await run(member.id, () => removeMember(member.id), msg('Member removed'));
    } else {
      await run(
        member.id,
        async () => {
          await transferOwnership(member.userId);
          // The seats changed: read them again so this screen knows who is the owner now.
          await useAuth.getState().reloadSession();
        },
        msg('Ownership transferred')
      );
    }
    // run() has said what happened; the sheet shows its spinner until then.
    setAsking(null);
  };

  return (
    <AppShell>
      <TopBar title={t('Team')} onBack={goBack} />

      <View style={styles.section}>
        <SectionHeader title={t('Add a team member')} />
        <ScCard style={styles.card}>
          <ScInput
            label={t('Phone')}
            numeric
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            maxLength={10}
            value={phone}
            onChangeText={(text) => setPhone(digitsOnly(text, 10))}
          />
          <ScInput label={t('Name (optional)')} value={name} onChangeText={setName} />
          <ScSelect
            label={t('Role')}
            value={role}
            options={ROLE_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))} onChange={setRole} />
          {/* No invite step: being added grants access on their next login. */}
          <T size={11} color={colors.textSecondary}>
            {t(ADD_NOTE)}
          </T>
          <ScButton variant="main" size="lg" onPress={() => void handleAdd()} disabled={adding}>
            {adding ? t('Adding...') : t('Add member')}
          </ScButton>
        </ScCard>
      </View>

      <View style={styles.section}>
        <View style={styles.header}>
          <SectionHeader title={t('Members')} />
          {!loading && members.length > 0 ? (
            <T num size={12} color={colors.textMuted}>
              {members.length}
            </T>
          ) : null}
        </View>
        {loading ? (
          <SkeletonList count={2} height={112} />
        ) : (
          <View style={styles.list}>
            {members.map((member) => {
              const busy = busyId === member.id;
              const suspend = suspendChange(member.status);
              return (
                <ScCard key={member.id} style={styles.card}>
                  <View style={styles.head}>
                    <View style={styles.flex}>
                      <T size={13} weight={600} numberOfLines={1}>
                        {member.name}
                      </T>
                      <T num size={12} color={colors.textSecondary}>
                        {member.phone}
                      </T>
                    </View>
                    <View style={styles.badges}>
                      {member.status === 'suspended' ? <ScBadge variant="danger">{t('Suspended')}</ScBadge> : null}
                      {member.isOwner ? (
                        <ScBadge variant="success">{t('Owner')}</ScBadge>
                      ) : (
                        <ScBadge variant="pending">{t(roleLabel(member.role))}</ScBadge>
                      )}
                    </View>
                  </View>

                  {member.isOwner ? (
                    // The owner's row is locked for everyone, including the owner: it is what
                    // guarantees the company always has an admin.
                    <View style={styles.locked}>
                      <IconLock size={13} stroke={1.5} color={colors.textSecondary} />
                      <T size={11} color={colors.textSecondary} style={styles.flex}>
                        {t(OWNER_LOCKED)}
                      </T>
                    </View>
                  ) : (
                    <View style={styles.actions}>
                      <View style={styles.roleSelect}>
                        <ScSelect
                          value={member.role}
                          options={ROLE_SHORT_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
                          disabled={busy}
                          onChange={(next) => {
                            if (next === member.role) return;
                            void run(member.id, () => updateMember(member.id, { role: next }), msg('Role updated'));
                          }}
                        />
                      </View>
                      <ScButton
                        variant="outline"
                        fullWidth={false}
                        disabled={busy}
                        paddingX={14}
                        onPress={() =>
                          void run(member.id, () => updateMember(member.id, { status: suspend.next }), suspend.done)
                        }
                      >
                        {t(suspend.label)}
                      </ScButton>
                      <ScButton
                        variant="outline"
                        fullWidth={false}
                        disabled={busy}
                        paddingX={14}
                        accessibilityLabel={t('Remove {name}', { name: member.name })}
                        onPress={() => setAsking({ kind: 'remove', member })}
                      >
                        <IconTrash size={14} stroke={1.5} />
                        <T size={15} weight={600} lh={20} color={busy ? colors.textMuted : colors.textPrimary}>
                          {t('Remove')}
                        </T>
                      </ScButton>
                      {canMakeOwner(isOwner, member) ? (
                        <ScButton
                          variant="outline"
                          fullWidth={false}
                          disabled={busy}
                          paddingX={14}
                          onPress={() => setAsking({ kind: 'owner', member })}
                        >
                          {t('Make owner')}
                        </ScButton>
                      ) : null}
                    </View>
                  )}
                </ScCard>
              );
            })}
          </View>
        )}
      </View>

      {/* The web removes at once and asks window.confirm only for Make owner; a phone is easier to mis-tap. */}
      <ConfirmSheet
        open={asking !== null}
        onClose={() => setAsking(null)}
        onConfirm={confirmAsked}
        level="firm"
        title={asking?.kind === 'owner' ? t('Make owner') : t('Remove member')}
        body={
          <T size={14} lh={19} color={colors.textSecondary}>
            {asking ? (asking.kind === 'owner' ? transferPrompt(asking.member.name) : removePrompt(asking.member.name)) : ''}
          </T>
        }
        confirmLabel={asking?.kind === 'owner' ? t('Make owner') : t('Remove')}
        cancelLabel={t('Cancel')}
      />
    </AppShell>
  );
}

export default garageScreen(MembersScreen);

const useStyles = createStyles((colors) => ({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: 12 },
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  roleSelect: { minWidth: 130 },
}));
