'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@repo/ui/sc/page-header'
import { SkeletonList } from '@repo/ui/sc/skeleton'
import { ApiError } from '@repo/core/api/client'
import {
  extractGarageImport,
  getAdminAiConfig,
  type ImportedGarage,
} from '@repo/core/api/admin'
import { GarageForm } from '@/components/garage-form'
import {
  FillByHandLink,
  ImportSourceCard,
  ImportStartCard,
  TallyPickList,
} from '@/components/garage-import'
import {
  MAX_TALLY_CSV_CHARS,
  formFromImport,
  importSourceLine,
  importSummary,
  importFileKind,
  pickedFilesProblem,
  untimedLine,
} from '@/lib/garage-import'
import { prepareImportFiles } from '@/lib/import-files'
import { listHref } from '@/lib/vendor-list'

type ImportSource =
  | { kind: 'files'; files: File[]; previewUrl: string | null }
  | { kind: 'tally'; fileName: string; row: number; rows: number }

/**
 * Where Add garage is. Every step but "by hand" lives in this page's memory
 * only — the files and what was read from them are never stored, so a
 * reload starts again from the top, by design.
 */
type Step =
  | { kind: 'start' }
  | { kind: 'pick'; fileName: string; garages: ImportedGarage[] }
  | {
      kind: 'review'
      source: ImportSource
      garage: ImportedGarage
      key: number
      /** The Tally file's garages, for Back to the pick list. */
      from?: { fileName: string; garages: ImportedGarage[] }
    }

let reviews = 0

/**
 * Add garage. First, import from a form or poster — a photo or PDF read by
 * the AI, or the Tally responses file — or fill in by hand. An import opens
 * the review: the same form, filled in, with what to check marked. Create
 * is the ordinary POST /admin/vendors either way, and an import is always
 * saved as Pending and not verified.
 */
export default function NewVendorPage() {
  // Read in the browser: this page is prerendered, so the searchParams prop
  // would be the build's empty one and ?by=hand would never show the form.
  // useSearchParams needs a Suspense boundary for the static build.
  return (
    <Suspense fallback={<SkeletonList count={2} itemClassName="h-40" />}>
      <NewVendor />
    </Suspense>
  )
}

function NewVendor() {
  const router = useRouter()
  // Which view shows is the page's own state, seeded from ?by=hand and kept
  // in step with it. A link from ?by=hand back to the bare /vendors/new on
  // this prerendered page changed nothing in the production build (CI E2E,
  // 29 Oct): the form stayed up. So Back sets the state itself and rewrites
  // the address, and the browser's own back and forward re-read it.
  const byHandParam = useSearchParams().get('by') === 'hand'
  const [byHand, setByHand] = useState(byHandParam)
  // Follows the address whenever it does change (adjusted during render,
  // React's pattern for state derived from an input, not in an effect).
  const [seenParam, setSeenParam] = useState(byHandParam)
  if (seenParam !== byHandParam) {
    setSeenParam(byHandParam)
    setByHand(byHandParam)
  }
  useEffect(() => {
    const sync = () =>
      setByHand(new URLSearchParams(window.location.search).get('by') === 'hand')
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  // The browser's own history call, not the router: on this prerendered
  // page router.replace('/vendors/new') from ?by=hand left the address as it
  // was (CI E2E). Next.js keeps useSearchParams in step with replaceState.
  const leaveByHand = () => {
    setByHand(false)
    window.history.replaceState(null, '', '/vendors/new')
  }
  // Into the form the same way, as its own history entry, so the browser's
  // Back returns to the import.
  const openByHand = () => {
    setByHand(true)
    window.history.pushState(null, '', '/vendors/new?by=hand')
  }
  const [step, setStep] = useState<Step>({ kind: 'start' })
  const [reading, setReading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Off unless the API says on: with no OpenAI key, the photo button is not
  // offered at all rather than one that can only fail. Shared with the
  // services editor's query.
  const { data: aiConfig } = useQuery({
    queryKey: ['admin', 'ai-config'],
    queryFn: getAdminAiConfig,
    staleTime: Infinity,
    retry: false,
  })
  const photosOn = aiConfig?.import === true

  const review = step.kind === 'review' ? step : null
  const imported = useMemo(
    () => (review ? formFromImport(review.garage) : null),
    [review]
  )

  // The photo's thumbnail is held in memory only while its review is open.
  const previewUrl =
    review?.source.kind === 'files' ? review.source.previewUrl : null
  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  if (byHand) {
    return (
      <div className="mx-auto w-full max-w-[640px] space-y-5">
        <PageHeader
          title="Add garage"
          subtitle="Fill in by hand"
          onBack={leaveByHand}
        />
        {/* To every garage, not the Live default: a new garage is usually
            not live yet, and it is the first card there, newest first. */}
        <GarageForm layout="tabs" afterCreate={listHref('all')} />
      </div>
    )
  }

  const fail = (err: unknown) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      router.replace('/login')
      return
    }
    setError(
      err instanceof Error
        ? err.message
        : 'Couldn’t read the file. Try again, or fill in by hand.'
    )
  }

  const readFiles = async (files: File[]) => {
    setError(null)
    const problem = pickedFilesProblem(files)
    if (problem) return setError(problem)
    setReading(files.length === 1 ? files[0].name : `${files.length} files`)
    try {
      const prepared = await prepareImportFiles(files)
      const { garages } = await extractGarageImport({
        source: 'files',
        files: prepared,
      })
      const previewUrl =
        importFileKind(files[0]) === 'image'
          ? URL.createObjectURL(files[0])
          : null
      setStep({
        kind: 'review',
        source: { kind: 'files', files, previewUrl },
        garage: garages[0],
        key: ++reviews,
      })
    } catch (err) {
      fail(err)
    } finally {
      setReading(null)
    }
  }

  const readCsv = async (file: File) => {
    setError(null)
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      return setError(
        `“${file.name}” isn't a CSV file. In Tally, open the form's Responses and download them as CSV.`
      )
    }
    setReading(file.name)
    try {
      const csv = await file.text()
      if (csv.length > MAX_TALLY_CSV_CHARS) {
        throw new Error(
          'This file is too big to read. Download only the newest responses from Tally.'
        )
      }
      const { garages } = await extractGarageImport({
        source: 'tally_csv',
        csv,
      })
      if (garages.length === 1) {
        setStep({
          kind: 'review',
          source: { kind: 'tally', fileName: file.name, row: 1, rows: 1 },
          garage: garages[0],
          key: ++reviews,
        })
      } else {
        setStep({ kind: 'pick', fileName: file.name, garages })
      }
    } catch (err) {
      fail(err)
    } finally {
      setReading(null)
    }
  }

  const backToStart = () => {
    setError(null)
    setStep({ kind: 'start' })
  }

  if (step.kind === 'pick') {
    return (
      <div className="mx-auto w-full max-w-[640px] space-y-5">
        <PageHeader
          title="Add garage"
          subtitle="From Tally"
          onBack={backToStart}
        />
        <TallyPickList
          fileName={step.fileName}
          garages={step.garages}
          onPick={(index) =>
            setStep({
              kind: 'review',
              source: {
                kind: 'tally',
                fileName: step.fileName,
                row: index + 1,
                rows: step.garages.length,
              },
              garage: step.garages[index],
              key: ++reviews,
              from: { fileName: step.fileName, garages: step.garages },
            })
          }
        />
      </div>
    )
  }

  if (review && imported) {
    // Back from a Tally garage returns to the pick list it came from.
    const back = () =>
      review.from ? setStep({ kind: 'pick', ...review.from }) : backToStart()
    return (
      <div className="mx-auto w-full max-w-[640px] space-y-4">
        <PageHeader
          title="Check the details"
          subtitle={importSourceLine(
            review.source.kind === 'tally'
              ? { kind: 'tally' }
              : { kind: 'files', files: review.source.files }
          )}
          onBack={back}
        />
        <ImportSourceCard
          source={review.source}
          summary={importSummary(review.garage)}
          onChangeFile={backToStart}
        />
        {/* Keyed by the import, so a second one starts the form afresh. */}
        <GarageForm
          key={review.key}
          layout="stacked"
          initial={imported.initial}
          marks={imported.marks}
          rowNotes={imported.rowNotes}
          servicesHelp={untimedLine(
            imported.untimedServices,
            review.garage.draft.services.length
          )}
          pendingOnly
          afterCreate={listHref('notlive')}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-5">
      <PageHeader title="Add garage" subtitle="Vendors" backHref="/vendors" />
      <ImportStartCard
        photosOn={photosOn}
        reading={reading}
        error={error}
        onPickFiles={(files) => void readFiles(files)}
        onPickCsv={(file) => void readCsv(file)}
      />
      <FillByHandLink onOpen={openByHand} />
    </div>
  )
}
