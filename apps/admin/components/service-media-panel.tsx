'use client'

import { useEffect, useId, useState } from 'react'
import Image from 'next/image'
import {
  IconCheck,
  IconInfoCircle,
  IconPalette,
  IconRefresh,
  IconSparkles,
  IconX,
} from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { ScSheet } from '@repo/ui/sc/modal'
import { ServiceMediaEditor } from '@repo/ui/features/service-media-editor'
import {
  adminMediaApi,
  generateAiPictures,
  getAiConfig,
  chooseAiPicture,
  type MediaConfig,
} from '@repo/core/api/service-media'
import { categoryLabel } from '@repo/core/categories'
import { defaultAiSubject } from '@repo/core/service-media'
import type { ServiceCategory, ServiceMedia } from '@repo/core/types'
import { cn } from '@repo/core/utils'

/**
 * A service's "Photos and video" block in admin, with "Make a picture with
 * AI". Shown in each saved service's ⋯ in the compact services editor
 * (components/services-editor.tsx), the one place for a service's photos and
 * video. It needs only the service and a way to hand back the changed media.
 */

// Asked once per page load, however many services the page shows.
let configs: Promise<{ media: MediaConfig | null; pictures: boolean }> | null =
  null
function loadConfigs() {
  configs ??= Promise.all([
    adminMediaApi.config().catch(() => null),
    getAiConfig()
      .then((c) => c.pictures)
      .catch(() => false),
  ]).then(([media, pictures]) => ({ media, pictures }))
  return configs
}

export function ServiceMediaPanel({
  serviceId,
  serviceName,
  category,
  media,
  onMediaChange,
}: {
  serviceId: string
  serviceName: string
  category: ServiceCategory
  media: ServiceMedia[]
  onMediaChange: (media: ServiceMedia[]) => void
}) {
  const [config, setConfig] = useState<MediaConfig | null>(null)
  const [aiOn, setAiOn] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  useEffect(() => {
    let live = true
    loadConfigs().then((c) => {
      if (!live) return
      setConfig(c.media)
      setAiOn(c.pictures)
    })
    return () => {
      live = false
    }
  }, [])

  // A sample stands in only until there is a real photo or video, and the
  // server refuses one after that.
  const hasReal = media.some((item) => item.source === 'upload')

  return (
    <>
      <ServiceMediaEditor
        serviceId={serviceId}
        serviceName={serviceName}
        media={media}
        onMediaChange={onMediaChange}
        api={adminMediaApi}
        config={config}
        extra={
          aiOn ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={hasReal}
                onClick={() => setAiOpen(true)}
                className={cn(
                  'flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-elevated',
                  'disabled:cursor-not-allowed disabled:text-text-muted disabled:hover:bg-transparent'
                )}
              >
                <IconSparkles size={16} stroke={1.6} aria-hidden="true" />
                Make a picture with AI
              </button>
              <p className="text-[12px] leading-snug text-text-muted">
                Only when there’s no real photo
              </p>
            </div>
          ) : null
        }
      />

      {aiOn && (
        <AiPictureSheet
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          serviceId={serviceId}
          serviceName={serviceName}
          category={category}
          onUsed={(next) => {
            onMediaChange(next)
            setAiOpen(false)
          }}
        />
      )}
    </>
  )
}

type Options = { urls: string[]; picked: string | null }

/**
 * Two options from one description; the admin picks one or tries again.
 * The style (dark graphite studio, no people, no number plates…) is added on
 * the server, whatever is typed here. Figures are OpenAI's medium-quality
 * landscape price, rounded: about ₹4 a picture, two per press.
 */
function AiPictureSheet({
  open,
  onClose,
  serviceId,
  serviceName,
  category,
  onUsed,
}: {
  open: boolean
  onClose: () => void
  serviceId: string
  serviceName: string
  category: ServiceCategory
  onUsed: (media: ServiceMedia[]) => void
}) {
  const promptId = useId()
  const [prompt, setPrompt] = useState(() =>
    defaultAiSubject(serviceName, category, categoryLabel(category))
  )
  const [options, setOptions] = useState<Options | null>(null)
  const [working, setWorking] = useState<'generating' | 'saving' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    setError(null)
    setWorking('generating')
    try {
      const { pictures } = await generateAiPictures(serviceId, prompt.trim())
      const urls = pictures.map((p) => p.url)
      setOptions({ urls, picked: urls[0] ?? null })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Pictures could not be made. Try again.'
      )
    } finally {
      setWorking(null)
    }
  }

  const use = async () => {
    if (!options?.picked) return
    setError(null)
    setWorking('saving')
    try {
      const others = options.urls.filter((url) => url !== options.picked)
      onUsed(await chooseAiPicture(serviceId, options.picked, others))
      setOptions(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'That did not save. Try again.'
      )
    } finally {
      setWorking(null)
    }
  }

  return (
    <ScSheet
      open={open}
      onClose={() => working === null && onClose()}
      aria-label="Make a picture with AI"
      className="px-5 pt-1"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold text-text-primary">
            Make a picture with AI
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            For {serviceName}, which has no real photo yet
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={working !== null}
          aria-label="Close"
          className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center text-text-secondary hover:text-text-primary disabled:opacity-40"
        >
          <IconX size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-5 flex items-baseline justify-between">
        <label
          htmlFor={promptId}
          className="text-[13px] font-medium text-text-secondary"
        >
          Describe the picture
        </label>
        <span className="text-[12px] text-text-muted">You can edit this</span>
      </div>
      <textarea
        id={promptId}
        rows={3}
        maxLength={400}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="mt-2 w-full resize-none rounded-[14px] border border-border bg-surface px-4 py-3 text-[15px] leading-snug text-text-primary outline-none transition-colors focus:border-text-secondary"
      />
      <p className="mt-2 flex items-center gap-2 text-[13px] text-text-secondary">
        <IconPalette size={16} stroke={1.6} aria-hidden="true" />
        Matches Detlio’s dark look
      </p>

      {options || working === 'generating' ? (
        <>
          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-text-secondary">
              Pick one
            </p>
            <button
              type="button"
              onClick={generate}
              disabled={working !== null || prompt.trim().length < 3}
              className="flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-elevated disabled:opacity-40"
            >
              <IconRefresh size={16} stroke={1.6} aria-hidden="true" />
              Generate again · <span className="font-numeric">₹8</span>
            </button>
          </div>

          <div
            role="radiogroup"
            aria-label="Pictures to choose from"
            className="mt-3 grid grid-cols-2 gap-3"
          >
            {working === 'generating'
              ? [0, 1].map((i) => (
                  <div
                    key={i}
                    className="aspect-[3/2] animate-pulse rounded-[14px] bg-surface-elevated motion-reduce:animate-none"
                  />
                ))
              : options?.urls.map((url, i) => {
                  const picked = options.picked === url
                  return (
                    <button
                      key={url}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      aria-label={`AI picture ${i + 1}`}
                      onClick={() => setOptions({ ...options, picked: url })}
                      className={cn(
                        'relative aspect-[3/2] overflow-hidden rounded-[14px] border-2 transition-colors',
                        picked ? 'border-brand-white' : 'border-border'
                      )}
                    >
                      <Image
                        src={url}
                        alt=""
                        fill
                        sizes="200px"
                        className="object-cover"
                      />
                      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
                        <IconSparkles size={12} aria-hidden="true" />
                        AI picture
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute right-2 top-2 flex size-7 items-center justify-center rounded-full border-2',
                          picked
                            ? 'border-brand-white bg-brand-white text-brand-black'
                            : 'border-white/70'
                        )}
                      >
                        {picked && <IconCheck size={16} stroke={3} />}
                      </span>
                    </button>
                  )
                })}
          </div>
          {working === 'generating' && (
            <p role="status" className="mt-2 text-[12px] text-text-muted">
              Making two pictures. This can take up to a minute.
            </p>
          )}

          <p className="mt-4 flex items-start gap-2 text-[13px] leading-snug text-text-secondary">
            <IconInfoCircle
              size={16}
              stroke={1.6}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            Shown to customers with a ‘Sample image’ tag. It is removed by
            itself when a real photo is added.
          </p>
        </>
      ) : (
        <p className="mt-5 text-[13px] text-text-secondary">
          Makes two pictures to choose from. About{' '}
          <span className="font-numeric">₹4</span> per picture.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-error">
          {error}
        </p>
      )}

      {/* The sheet's one red action: make the pictures, then use one. */}
      <ScButton
        className="mt-5 rounded-full py-4 text-[15px]"
        disabled={
          working !== null ||
          (options ? !options.picked : prompt.trim().length < 3)
        }
        onClick={options ? use : generate}
      >
        {working === 'saving'
          ? 'Saving…'
          : options
            ? 'Use this picture'
            : working === 'generating'
              ? 'Making pictures…'
              : 'Make 2 pictures'}
      </ScButton>
    </ScSheet>
  )
}
