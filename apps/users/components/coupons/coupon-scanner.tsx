'use client'

import { useEffect, useRef, useState } from 'react'
import { ScButton } from '@repo/ui/sc/button'
import { ScModal } from '@repo/ui/sc/modal'
import { codeFromScan } from '@repo/core/coupons'

/** The parts of the Barcode Detection API used here (not in TypeScript's DOM types yet). */
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

function detectorClass(): BarcodeDetectorClass | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector ?? null
}

/**
 * Whether this browser can read a QR from the camera on its own (Chrome on
 * Android, among others). Where it can't (Safari today), Profile shows only
 * the code box: no scanner library is shipped for it.
 */
export async function canScanCoupons(): Promise<boolean> {
  const Detector = detectorClass()
  if (!Detector || !navigator.mediaDevices?.getUserMedia) return false
  try {
    const formats = (await Detector.getSupportedFormats?.()) ?? ['qr_code']
    return formats.includes('qr_code')
  } catch {
    return false
  }
}

/**
 * The phone's back camera in a sheet, read a few times a second until a
 * Detlio coupon's QR (its /c/<code> link) is in view. Another QR (a menu, a
 * payment) is never sent to the server. The camera stops the moment the
 * sheet closes or a code is read; nothing is recorded or uploaded.
 */
export function CouponScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const done = useRef(onCode)
  useEffect(() => {
    done.current = onCode
  }, [onCode])

  useEffect(() => {
    const Detector = detectorClass()
    let stream: MediaStream | null = null
    let timer: number | undefined
    let stopped = false

    const stop = () => {
      stopped = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }

    void (async () => {
      if (!Detector) {
        setProblem("This browser can't scan. Type the code instead.")
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        const detector = new Detector({ formats: ['qr_code'] })
        const tick = async () => {
          if (stopped) return
          try {
            const found = await detector.detect(video)
            for (const barcode of found) {
              const code = codeFromScan(barcode.rawValue)
              if (code) {
                stop()
                done.current(code)
                return
              }
            }
            if (found.length > 0) setHint("That QR isn't a Detlio coupon.")
          } catch {
            // A frame that could not be read; the next one may.
          }
          timer = window.setTimeout(() => void tick(), 250)
        }
        void tick()
      } catch (error) {
        const name = error instanceof DOMException ? error.name : ''
        setProblem(
          name === 'NotAllowedError'
            ? 'Camera access is off for Detlio. Allow it in your browser, or type the code instead.'
            : "Couldn't open the camera. Type the code instead."
        )
      }
    })()

    return stop
  }, [])

  return (
    <ScModal open onClose={onClose} aria-label="Scan a coupon" className="flex max-w-[420px] flex-col gap-3">
      <h2 className="text-[15px] font-semibold text-text-primary">Scan a coupon</h2>
      {problem ? (
        <p role="alert" className="text-[13px] text-error">
          {problem}
        </p>
      ) : (
        <>
          <div className="relative aspect-square w-full overflow-hidden rounded-[12px] bg-black">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" aria-label="Camera" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-[12px] border-2 border-white/80" />
          </div>
          <p role="status" className="text-[12px] text-text-secondary">
            {hint ?? "Point the camera at the QR on the coupon."}
          </p>
        </>
      )}
      <ScButton variant="secondary" onClick={onClose} className="min-h-11">
        Close
      </ScButton>
    </ScModal>
  )
}
