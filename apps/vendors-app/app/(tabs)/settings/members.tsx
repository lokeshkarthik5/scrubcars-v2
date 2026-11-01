import { addMember, type ApiMember, getMembers, removeMember, transferOwnership, updateMember } from '@repo/core/api/members';
import type { VendorRole } from '@repo/core/api/types';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppShell, garageScreen } from '@/components/app-shell';
import { ScButton } from '@/components/button';
import { ScBadge, ScSelect } from '@/components/form-controls';
import { IconLock, IconTrash } from '@/components/icons';
import { ScInput } from '@/components/inputs';
import { ScCard, SkeletonList } from '@/components/primitives';
import { SectionHeader, TopBar } from '@/components/rows';
import { ConfirmSheet } from '@/components/sheet';
import { T } from '@/components/text';
import { toast } from '@/components/toast';
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
import { colors } from '@/lib/theme';

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

type Asking = { kind: 'remove' | 'owner'; member: ApiMember };

/**
 * Settings > Team (apps/vendors/app/settings/members/page.tsx): add a member by phone with a
 * role, and for each member change the role, suspend or restore, remove, or (the owner seat
 * only) make them the owner. The owner's own row is locked for everyone. The owner seat and
 * admins only; the API refuses an operator.
 */
function MembersScreen() {
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
      toast.error(errorText(err, 'Failed to load members'));
    } finally {
      setLoading(false);
    }
  }, []);

  // The screen is keyed by garage (garageScreen), so a company switch loads afresh.
  useEffect(() => {
    if (isVendorAdmin) void load();
  }, [isVendorAdmin, load]);

  const handleAdd = async () => {
    if (!isTenDigits(phone)) {
      toast.error(PHONE_PROBLEM);
      return;
    }
    setAdding(true);
    try {
      await addMember({ phone, name: name.trim() || undefined, role });
      setPhone('');
      setName('');
      setRole('vendor_operator');
      await load();
      toast.success('Member added');
    } catch (err) {
      toast.error(errorText(err, 'Failed to add member'));
    } finally {
      setAdding(false);
    }
  };

  const run = async (id: string, action: () => Promise<void>, done: string) => {
    setBusyId(id);
    try {
      await action();
      await load();
      toast.success(done);
    } catch (err) {
      toast.error(errorText(err, 'Something went wrong'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmAsked = async () => {
    if (!asking) return;
    const { kind, member } = asking;
    if (kind === 'remove') {
      await run(member.id, () => removeMember(member.id), 'Member removed');
    } else {
      await run(
        member.id,
        async () => {
          await transferOwnership(member.userId);
          // The seats changed: read them again so this screen knows who is the owner now.
          await useAuth.getState().reloadSession();
        },
        'Ownership transferred'
      );
    }
    // run() has said what happened; the sheet shows its spinner until then.
    setAsking(null);
  };

  return (
    <AppShell>
      <TopBar title="Team" onBack={goBack} />

      <View style={styles.section}>
        <SectionHeader title="Add a team member" />
        <ScCard style={styles.card}>
          <ScInput
            label="Phone"
            numeric
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            maxLength={10}
            value={phone}
            onChangeText={(text) => setPhone(digitsOnly(text, 10))}
          />
          <ScInput label="Name (optional)" value={name} onChangeText={setName} />
          <ScSelect label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} />
          {/* No invite step: being added grants access on their next login. */}
          <T size={11} color={colors.textSecondary}>
            {ADD_NOTE}
          </T>
          <ScButton variant="main" size="lg" onPress={() => void handleAdd()} disabled={adding}>
            {adding ? 'Adding...' : 'Add member'}
          </ScButton>
        </ScCard>
      </View>

      <View style={styles.section}>
        <View style={styles.header}>
          <SectionHeader title="Members" />
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
                      {member.status === 'suspended' ? <ScBadge variant="danger">Suspended</ScBadge> : null}
                      {member.isOwner ? (
                        <ScBadge variant="success">Owner</ScBadge>
                      ) : (
                        <ScBadge variant="pending">{roleLabel(member.role)}</ScBadge>
                      )}
                    </View>
                  </View>

                  {member.isOwner ? (
                    // The owner's row is locked for everyone, including the owner: it is what
                    // guarantees the company always has an admin.
                    <View style={styles.locked}>
                      <IconLock size={13} stroke={1.5} color={colors.textSecondary} />
                      <T size={11} color={colors.textSecondary} style={styles.flex}>
                        {OWNER_LOCKED}
                      </T>
                    </View>
                  ) : (
                    <View style={styles.actions}>
                      <View style={styles.roleSelect}>
                        <ScSelect
                          value={member.role}
                          options={ROLE_SHORT_OPTIONS}
                          disabled={busy}
                          onChange={(next) => {
                            if (next === member.role) return;
                            void run(member.id, () => updateMember(member.id, { role: next }), 'Role updated');
                          }}
                        />
                      </View>
                      <ScButton
                        variant="outline"
                        fullWidth={false}
                        disabled={busy}
                        style={styles.action}
                        onPress={() =>
                          void run(member.id, () => updateMember(member.id, { status: suspend.next }), suspend.done)
                        }
                      >
                        {suspend.label}
                      </ScButton>
                      <ScButton
                        variant="outline"
                        fullWidth={false}
                        disabled={busy}
                        style={styles.action}
                        accessibilityLabel={`Remove ${member.name}`}
                        onPress={() => setAsking({ kind: 'remove', member })}
                      >
                        <IconTrash size={14} stroke={1.5} />
                        <T size={15} weight={600} lh={20} color={busy ? colors.textMuted : colors.textPrimary}>
                          Remove
                        </T>
                      </ScButton>
                      {canMakeOwner(isOwner, member) ? (
                        <ScButton
                          variant="outline"
                          fullWidth={false}
                          disabled={busy}
                          style={styles.action}
                          onPress={() => setAsking({ kind: 'owner', member })}
                        >
                          Make owner
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
        title={asking?.kind === 'owner' ? 'Make owner' : 'Remove member'}
        body={
          <T size={14} lh={19} color={colors.textSecondary}>
            {asking ? (asking.kind === 'owner' ? transferPrompt(asking.member.name) : removePrompt(asking.member.name)) : ''}
          </T>
        }
        confirmLabel={asking?.kind === 'owner' ? 'Make owner' : 'Remove'}
        cancelLabel="Cancel"
      />
    </AppShell>
  );
}

export default garageScreen(MembersScreen);

const styles = StyleSheet.create({
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
  action: { paddingHorizontal: 14 },
});
