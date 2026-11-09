import { t } from '@repo/core/i18n/translate';
/**
 * The one way to Razorpay's window. Razorpay's SDK is native code, so it's required only when
 * paying: Expo Go hasn't got it, and importing it there at launch would take the whole app down.
 *
 * In a local test, and only then, a fake-payments order (`order_e2e_*`, which only a server
 * with E2E_FAKE_PAYMENTS mints and only that server accepts) is completed without the SDK. It
 * sits behind __DEV__, so a production build has no such path: Metro removes the branch.
 */
export type CheckoutResult =
  | { kind: 'paid'; orderId: string; paymentId: string; signature: string }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

export interface CheckoutOrder {
  orderId: string;
  /** In paise. */
  amount: number;
  currency: string;
  keyId: string;
}

export interface CheckoutInfo {
  description: string;
  name?: string;
  phone?: string;
}

const FAKE_ORDER = 'order_e2e_';

/** Pure, so it can be tested with production's answer: false, whatever the order says. */
export function fakeCheckoutAllowed(orderId: string, isDev: boolean): boolean {
  return isDev === true && orderId.startsWith(FAKE_ORDER);
}

export function fakeResult(orderId: string, now = Date.now()): CheckoutResult {
  return { kind: 'paid', orderId, paymentId: `pay_e2e_${now}`, signature: 'e2e-signature-not-checked' };
}

/**
 * What the SDK's rejection means. Cancelled is never an error to the customer, and it comes in
 * different shapes on Android and iOS: code 0 on Android, a description with the reason on iOS.
 */
export function classifySdkError(error: unknown): CheckoutResult {
  const e = (error ?? {}) as { code?: unknown; description?: unknown; error?: { description?: unknown; reason?: unknown } };
  const raw = typeof e.description === 'string' ? e.description : '';
  let description = raw;
  let reason = typeof e.error?.reason === 'string' ? e.error.reason : '';
  try {
    const parsed = JSON.parse(raw) as { error?: { description?: string; reason?: string } };
    description = parsed.error?.description ?? description;
    reason = parsed.error?.reason ?? reason;
  } catch {
    // A plain sentence.
  }
  if (e.code === 0 || /cancel/i.test(`${reason} ${description}`)) return { kind: 'cancelled' };
  return { kind: 'failed', message: description || t('Payment failed. If money left your account it will be refunded.') };
}

/**
 * A local test's stand-in for Razorpay's window: Pay, Cancel, Fail, or leave it open so the
 * app can be killed mid-payment. Inside __DEV__ only, like the one call to it.
 */
function askFakeCheckout(order: CheckoutOrder): Promise<CheckoutResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Alert } = require('react-native') as typeof import('react-native');
  return new Promise((resolve) => {
    Alert.alert(t('Test payment'), `Local fake-payments order, ${order.amount / 100} rupees. Nothing real happens.`, [
      { text: t('Pay'), onPress: () => resolve(fakeResult(order.orderId)) },
      { text: t('Cancel'), onPress: () => resolve({ kind: 'cancelled' }) },
      { text: t('Fail'), onPress: () => resolve({ kind: 'failed', message: t('Your bank declined this payment. Nothing was charged.') }) },
      { text: t('Leave open') },
    ]);
  });
}

export async function openCheckout(order: CheckoutOrder, info: CheckoutInfo): Promise<CheckoutResult> {
  if (__DEV__ && fakeCheckoutAllowed(order.orderId, __DEV__)) return askFakeCheckout(order);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RazorpayCheckout = require('react-native-razorpay').default as {
      open: (options: Record<string, unknown>) => Promise<{
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }>;
    };
    const paid = await RazorpayCheckout.open({
      key: order.keyId,
      order_id: order.orderId,
      amount: String(order.amount),
      currency: order.currency,
      name: 'Detlio',
      description: info.description,
      prefill: { name: info.name ?? '', contact: info.phone ?? '' },
      theme: { color: '#E11D2E' },
    });
    return {
      kind: 'paid',
      orderId: paid.razorpay_order_id,
      paymentId: paid.razorpay_payment_id,
      signature: paid.razorpay_signature,
    };
  } catch (error) {
    return classifySdkError(error);
  }
}
