'use client'

import { decodeImage, encodeImage, fitWithin } from '@repo/core/image-upload'
import { frameTimes, wipeVideoLocation } from '@repo/core/repair-quotes'

/**
 * The customer's video and pictures for a repair request (0076), on the
 * phone: the video's length, still frames taken from it for Detlio's brief
 * (the AI reads pictures, not video), the video wiped of the place it was
 * recorded before it is uploaded, and small copies of every picture for the
 * brief. Nothing here leaves the phone; the page uploads what it returns.
 */

/** The longest edge of a frame kept as a picture garages see. */
const FRAME_EDGE = 1280
/** The longest edge of a picture sent for the brief: enough to see a dent, small to send. */
const BRIEF_EDGE = 1024

function loadVideo(file: Blob): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url
    const fail = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This video can’t be played. Try recording again.'))
    }
    video.onloadeddata = () => resolve({ video, url })
    video.onerror = fail
    // Some phones never fire loadeddata for a file they can't decode.
    setTimeout(() => {
      if (video.readyState < 2) fail()
    }, 15_000)
  })
}

/** A video's length in seconds (NaN when the browser can't tell). */
export async function videoDuration(file: Blob): Promise<number> {
  const { video, url } = await loadVideo(file)
  const duration = video.duration
  URL.revokeObjectURL(url)
  return duration
}

/** How long one seek may take before the frame is drawn anyway. */
const SEEK_LIMIT_MS = 4_000

/**
 * Moves the video to `at`. Some phone browsers never fire `seeked`; after
 * SEEK_LIMIT_MS this resolves anyway, so "Detlio is looking at your video…"
 * can never hang and block Send (the frame may then be an earlier one).
 */
function seek(video: HTMLVideoElement, at: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', done)
      resolve()
    }
    const timer = setTimeout(done, SEEK_LIMIT_MS)
    video.addEventListener('seeked', done)
    video.currentTime = at
  })
}

/**
 * `count` JPEG frames spread through the video, each a canvas drawing of
 * the picture only (no metadata can come with it).
 */
export async function extractFrames(file: Blob, count: number): Promise<Blob[]> {
  const { video, url } = await loadVideo(file)
  try {
    const size = fitWithin(video.videoWidth || 1280, video.videoHeight || 720, FRAME_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) return []
    const frames: Blob[] = []
    for (const at of frameTimes(video.duration, count)) {
      await seek(video, at)
      context.drawImage(video, 0, 0, size.width, size.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (blob && blob.size > 0) frames.push(blob)
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** The video with any recorded place zeroed (wipeVideoLocation), same type and size. */
export async function wipeVideo(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  wipeVideoLocation(bytes)
  return new Blob([bytes], { type: file.type })
}

/** A small JPEG copy for the brief, as base64. */
export async function briefImage(blob: Blob): Promise<{ mimeType: 'image/jpeg'; dataBase64: string }> {
  const decoded = await decodeImage(blob)
  try {
    const small = await encodeImage(decoded, fitWithin(decoded.width, decoded.height, BRIEF_EDGE), 'image/jpeg', 0.8)
    const jpeg = small && small.type === 'image/jpeg' ? small : blob
    return { mimeType: 'image/jpeg', dataBase64: await toBase64(jpeg) }
  } finally {
    decoded.close()
  }
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
