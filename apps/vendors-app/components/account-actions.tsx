import { ACCOUNT_DELETION_CONFIRM } from '@repo/core/account-deletion';
import { type AccountDeletionPreview, deleteMyAccount, getAccountDeletionPreview } from '@repo/core/api/account';
import {
  cancelGarageClosure,
  type ClosureRequest,
  getMyClosureRequest,
  requestGarageClosure,
} from '@repo/core/api/garage-closure';
import { leaveGarage } from '@repo/core/api/members';
import { typedConfirmMatches } from '@repo/core/confirm';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { forgetPushForGarage, restorePushForGarage } from '@/lib/push-device';
import { colors } from '@/lib/theme';

import { ScButton } from '@repo/native-ui/button';
import { ScInput, ScTextarea } from '@repo/native-ui/inputs';
import { ScCard } from '@repo/native-ui/primitives';
import { SectionHeader } from './rows';
import { ConfirmSheet, ScSheet } from '@repo/native-ui/sheet';
import { useSupportSession } from './support-session-banner';
import { T } from '@repo/native-ui/text';
import { toast } from '@repo/native-ui/toast';
import { errorText } from '@/lib/error-text';

const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** AccountActions: the owner closes the garage; any other seat leaves it or deletes the login. */
export function AccountActions() {
  const isOwner = useAuth((s) => s.isOwner);
  const vendor = useAuth((s) => s.vendor);
  const support = useSupportSession();
  if (support || !vendor) return null;
  return isOwner ? (
    <CloseGarage key={vendor.id} garageName={vendor.businessName} />
  ) : (
    <>
      <LeaveGarage garageName={vendor.businessName} />
      <DeleteMyAccount />
    </>
  );
}

function CloseGarage({ garageName }: { garageName: string }) {
  const [request, setRequest] = useState<ClosureRequest | null | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyClosureRequest()
      .then((open) => {
        if (!cancelled) setRequest(open);
      })
      .catch(() => {
        if (!cancelled) setRequest(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (request === undefined) return null;

  const send = async () => {
    if (reason.trim().length < 3) {
      setError('Say why you want to close the garage.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setRequest(await requestGarageClosure(reason.trim()));
      setAsking(false);
      setReason('');
      toast.success('Request sent. Detlio will call you.');
    } catch (err) {
      setError(errorText(err, 'Could not send the request'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader title="Close my garage" />
      <ScCard style={styles.section}>
        {request ? (
          <>
            <T size={14}>
              {`You asked to close ${garageName} on ${DATE.format(new Date(request.createdAt))}. Detlio will call you before anything changes.`}
            </T>
            <T size={13} color={colors.textSecondary}>{`“${request.reason}”`}</T>
            <ScButton variant="outline" onPress={() => setCancelling(true)}>
              Cancel the request
            </ScButton>
          </>
        ) : (
          <>
            <T size={13} color={colors.textSecondary}>
              {`Stopping for good? Ask Detlio to close ${garageName}. We call you first; your bookings still to come are cancelled and refunded, and the garage leaves Detlio. You can cancel the request until we act.`}
            </T>
            <ScButton variant="danger-outline" onPress={() => setAsking(true)}>
              Close my garage
            </ScButton>
          </>
        )}
      </ScCard>

      <ScSheet open={asking} onClose={() => setAsking(false)} dismissible={!busy} accessibilityLabel="Close my garage">
        <View style={styles.sheet}>
          <T accessibilityRole="header" size={17} weight={600}>{`Close ${garageName}?`}</T>
          <T size={14} color={colors.textSecondary}>
            This asks Detlio to close the garage. Nothing changes until we call you.
          </T>
          <ScTextarea label="Why are you closing?" rows={3} maxLength={500} value={reason} onChangeText={setReason} />
          {error ? (
            <T accessibilityRole="alert" size={14} color={colors.error}>
              {error}
            </T>
          ) : null}
          <View style={styles.actions}>
            <ScButton variant="danger-outline" onPress={() => void send()} disabled={busy}>
              {busy ? 'Sending…' : 'Send request'}
            </ScButton>
            <ScButton variant="outline" onPress={() => setAsking(false)} disabled={busy}>
              Keep the garage open
            </ScButton>
          </View>
        </View>
      </ScSheet>

      <ConfirmSheet
        open={cancelling}
        onClose={() => setCancelling(false)}
        onConfirm={async () => {
          try {
            await cancelGarageClosure();
            setRequest(null);
            setCancelling(false);
            toast.success('Request cancelled. Your garage stays open.');
          } catch (err) {
            toast.error(errorText(err, 'Could not cancel the request'));
            setCancelling(false);
            setRequest(await getMyClosureRequest().catch(() => null));
          }
        }}
        level="light"
        title="Keep your garage open?"
        body={
          <T size={14} color={colors.textSecondary}>
            This cancels your request to close the garage.
          </T>
        }
        confirmLabel="Cancel the request"
        cancelLabel="Back"
      />
    </View>
  );
}

function LeaveGarage({ garageName }: { garageName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <View style={styles.section}>
      <SectionHeader title="Leave this garage" />
      <ScCard style={styles.section}>
        <T size={13} color={colors.textSecondary}>
          {`Stop working with ${garageName} on Detlio. You lose access to its bookings; the owner can add you again.`}
        </T>
        <ScButton variant="outline" onPress={() => setConfirming(true)}>
          {`Leave ${garageName}`}
        </ScButton>
      </ScCard>
      <ConfirmSheet
        open={confirming}
        onClose={() => {
          setConfirming(false);
          setError(undefined);
        }}
        onConfirm={async () => {
          const leaving = useAuth.getState().activeVendorId;
          const alertsWereOn = leaving ? await forgetPushForGarage(leaving) : false;
          try {
            await leaveGarage();
            toast.success(`You left ${garageName}`);
            const store = useAuth.getState();
            const others = store.vendors.filter((v) => v.id !== store.activeVendorId);
            setConfirming(false);
            if (others.length === 0) {
              await store.signOut();
              return;
            }
            await store.reloadSession();
            router.navigate('/home' as Href);
          } catch (err) {
            if (leaving && alertsWereOn) void restorePushForGarage(leaving);
            setError(errorText(err, 'Could not leave the garage'));
          }
        }}
        level="firm"
        title={`Leave ${garageName}?`}
        body={
          <T size={14} color={colors.textSecondary}>
            {"You'll no longer see its bookings or act for it."}
          </T>
        }
        confirmLabel="Leave garage"
        cancelLabel="Stay"
        error={error}
      />
    </View>
  );
}

function DeleteMyAccount() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setOpen(true);
    setPreview(null);
    setTyped('');
    setError(null);
    try {
      setPreview(await getAccountDeletionPreview());
    } catch (err) {
      setError(errorText(err, 'Could not check your account'));
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount();
      toast.success('Your account is deleted');
      setOpen(false);
      await useAuth.getState().signOut({ sessionGone: true });
    } catch (err) {
      setError(errorText(err, 'Could not delete your account'));
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader title="Delete my account" />
      <ScCard style={styles.section}>
        <T size={13} color={colors.textSecondary}>
          {"Deletes your login on Detlio: your name, number and every garage you can open here. Jobs you did stay on the garages' records, without your name."}
        </T>
        <ScButton variant="danger-outline" onPress={() => void start()}>
          Delete my account
        </ScButton>
      </ScCard>
      <ScSheet open={open} onClose={() => setOpen(false)} dismissible={!busy} accessibilityLabel="Delete my account">
        <View style={styles.sheet}>
          <T accessibilityRole="header" size={17} weight={600}>
            Delete your account?
          </T>
          {!preview && !error ? (
            <T size={14} color={colors.textSecondary}>
              Checking your account…
            </T>
          ) : null}
          {preview && !preview.canDelete ? (
            <View accessibilityLabel="Before you can delete" style={styles.blockers}>
              {preview.blockers.map((blocker) => (
                <View key={blocker.code} style={styles.blocker}>
                  <T size={14}>{blocker.message}</T>
                </View>
              ))}
            </View>
          ) : null}
          {preview?.canDelete ? (
            <>
              <T size={14} color={colors.textSecondary}>
                {"You leave every garage, and you're signed out on every device. This can't be undone."}
              </T>
              <View style={styles.typed}>
                <T size={13} color={colors.textSecondary}>
                  {'Type '}
                  <T size={13} weight={600}>
                    {ACCOUNT_DELETION_CONFIRM}
                  </T>
                  {' to confirm'}
                </T>
                <ScInput
                  accessibilityLabel={`Type ${ACCOUNT_DELETION_CONFIRM} to confirm`}
                  value={typed}
                  onChangeText={setTyped}
                  editable={!busy}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.typedInput}
                />
              </View>
            </>
          ) : null}
          {error ? (
            <T accessibilityRole="alert" size={14} color={colors.error}>
              {error}
            </T>
          ) : null}
          <View style={styles.actions}>
            {preview?.canDelete ? (
              <ScButton
                variant="danger-outline"
                onPress={() => void remove()}
                disabled={busy || !typedConfirmMatches(typed, ACCOUNT_DELETION_CONFIRM)}
              >
                {busy ? 'Deleting…' : 'Delete my account'}
              </ScButton>
            ) : null}
            <ScButton variant="outline" onPress={() => setOpen(false)} disabled={busy}>
              {preview?.canDelete ? 'Keep my account' : 'Close'}
            </ScButton>
          </View>
        </View>
      </ScSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sheet: { gap: 12, paddingHorizontal: 20, paddingTop: 4 },
  actions: { marginTop: 8, gap: 10 },
  blockers: { gap: 8 },
  blocker: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typed: { gap: 6 },
  typedInput: { height: 48, borderRadius: 14, fontSize: 16, paddingHorizontal: 14 },
});
