import { ApiError } from '@repo/core/api/client';
import { redeemGift } from '@repo/core/api/gifts';
import { invalidateGiftData } from '@repo/core/api/hooks/use-gifts';
import { ScButton } from '@repo/native-ui/button';
import { ScInput } from '@repo/native-ui/inputs';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { useColors } from '@repo/native-ui/theme';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { formatGiftDate, giftRupees } from '@/lib/gifts';

/** RedeemCodeBox: a code off a printed card or a message. Refusals are the server's sentences. */
export function RedeemCodeBox() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const redeem = async () => {
    const typed = code.trim();
    if (!typed || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const done = await redeemGift(typed);
      setCode('');
      setResult({ ok: true, text: `${giftRupees(done.amount)} added to your Detlio credit. Balance ${giftRupees(done.balance)}.${done.expiresAt ? ` Use by ${formatGiftDate(done.expiresAt)}.` : ''}` });
      void invalidateGiftData(queryClient);
    } catch (error) {
      setResult({ ok: false, text: error instanceof ApiError ? error.message : "Couldn't redeem that code. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScCard style={{ gap: 12 }}>
      <ScInput label="Have a gift code?" placeholder="ABCD-EFGH-JKMN-PQRS" autoComplete="off" autoCapitalize="characters" autoCorrect={false} spellCheck={false} maxLength={40} value={code} onChangeText={(t) => setCode(t.toUpperCase())} onSubmitEditing={() => void redeem()} />
      <ScButton variant="outline" disabled={!code.trim() || busy} onPress={() => void redeem()}>
        {busy ? 'Redeeming…' : 'Redeem'}
      </ScButton>
      {result ? (
        <T accessibilityRole={result.ok ? undefined : 'alert'} size={12} lh={16} color={result.ok ? colors.success : colors.error}>
          {result.text}
        </T>
      ) : null}
    </ScCard>
  );
}
