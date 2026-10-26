import { Suspense } from 'react'
import type { Metadata } from 'next'
import { CouponView } from '@/components/coupons/coupon-view'

/**
 * A printed coupon's QR (0056): /c/<code>, opened by the phone's camera,
 * signed in or not. The code is the coupon, so the page never hands its
 * address on: no Referer to anything it links to, kept out of search
 * engines, and no Meta Pixel (components/meta-pixel.tsx). The title names
 * no offer.
 */
export const metadata: Metadata = {
  title: 'A Detlio coupon',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

export default async function CouponPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  // useSearchParams (?add=1, back from sign-in) needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <CouponView code={code} />
    </Suspense>
  )
}
