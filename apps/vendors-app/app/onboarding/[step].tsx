import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { StepServices } from '@/components/onboarding/step-services';
import { StepBusiness } from '@/components/onboarding/step-business';
import { StepLocation } from '@/components/onboarding/step-location';
import { StepSetup } from '@/components/onboarding/step-setup';
import { useAuth } from '@/lib/auth';
import { draftData, openDraft, useOnboardingDraft } from '@/lib/onboarding-draft';
import { draftFor, parseStep, phoneDigits, stepGuard, stepPath } from '@/lib/onboarding-logic';
import { onboardingHold } from '@/lib/route-gate';

/**
 * The first-garage wizard, /onboarding/step-1 to step-4 (apps/vendors/app/onboarding/step-N).
 * The session gate sends a signed-in number with no garage here. The draft is kept on the
 * phone, so a killed app resumes; a draft that belongs to another number is dropped.
 */
export default function OnboardingScreen() {
  const { step: param } = useLocalSearchParams<{ step?: string }>();
  const step = parseStep(param);
  const phone = phoneDigits(useAuth((s) => s.user?.phone));
  const hasGarage = useAuth((s) => s.vendor !== null);
  const businessName = useOnboardingDraft((s) => s.businessName);
  const ownerName = useOnboardingDraft((s) => s.ownerName);
  const city = useOnboardingDraft((s) => s.city);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Signed out (phone gone): the draft stays closed. A step still mounted lower in the stack
    // would otherwise write its stale form back as it unmounts.
    if (phone) openDraft();
    const draft = draftData(useOnboardingDraft.getState());
    if (draftFor(draft, phone) !== draft) useOnboardingDraft.getState().reset();
    setReady(true);
  }, [phone]);

  // The gate's hold only bridges step 2 to step 3.
  useEffect(() => {
    if (step !== null && step >= 3) onboardingHold.set(false);
  }, [step]);

  const elsewhere = ready && step ? stepGuard(step, { draft: { businessName, ownerName, city }, hasGarage }) : null;
  useEffect(() => {
    if (elsewhere) router.replace(stepPath(elsewhere));
  }, [elsewhere]);

  if (step === null) return <Redirect href="/onboarding/step-1" />;
  if (!ready || elsewhere) return null;

  switch (step) {
    case 1:
      return <StepBusiness />;
    case 2:
      return <StepLocation />;
    case 3:
      return <StepSetup />;
    default:
      return <StepServices />;
  }
}
