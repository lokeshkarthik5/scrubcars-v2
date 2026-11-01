import type { ApiVendorProfile } from '@repo/core/api/types';

import { T } from '@/components/text';

/** Settings > Location. Built by the location/onboarding task; props are the contract. */
export function LocationTab(_props: { vendor: ApiVendorProfile; onSaved: (vendor: ApiVendorProfile) => void }) {
  return <T size={13}>Location</T>;
}
