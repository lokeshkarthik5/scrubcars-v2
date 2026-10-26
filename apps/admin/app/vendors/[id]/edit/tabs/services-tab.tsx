'use client'

import { IconChevronDown, IconEyeOff } from '@tabler/icons-react'
import { ScButton } from '@repo/ui/sc/button'
import { cn } from '@repo/core/utils'
import { SavedNote } from '@/components/save-bar'
import { ServicesEditor } from '@/components/services-editor'
import { showAgainWarning, storedPriceSummary } from '@/lib/service-rows'
import type { GarageDraft, GarageDraftState } from '../use-garage-draft'

/**
 * Services: the garage's list (ServicesEditor), saved as one list with Save
 * changes, and its hidden services. Hide and Show again save at once.
 */
export function ServicesTab({
  g,
  draft,
}: {
  g: GarageDraftState
  draft: GarageDraft
}) {
  const {
    resetCount,
    setDescribing,
    setServices,
    openRows,
    setOpenRows,
    hiddenServices,
    hiddenLoadFailed,
    showHidden,
    setShowHidden,
    hiddenToggleRef,
    saving,
    setServiceMedia,
    hideService,
    showServiceAgain,
    serviceBusyId,
    serviceSwitching,
    serviceErrors,
    serviceNotice,
    switchNote,
    toLogin,
  } = g

  return (
    <>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <p className="text-[12px] text-text-muted">
          Hide and Show again save at once; everything else waits for Save
          changes.
        </p>
        <SavedNote state={switchNote.state} />
      </div>

      <ServicesEditor
        key={resetCount}
        onAiBusyChange={setDescribing}
        rows={draft.services}
        setRows={setServices}
        openRows={openRows}
        setOpenRows={setOpenRows}
        garageName={draft.form.businessName}
        otherNames={hiddenServices.map((s) => s.name)}
        emptyText={
          hiddenServices.length > 0
            ? 'No services on the garage page. Hidden ones are listed below; show them again or add a new one.'
            : 'No services yet. Add one, or start from a template above.'
        }
        saving={saving}
        media={{ onChange: setServiceMedia }}
        hide={{
          onHide: hideService,
          busyId: serviceBusyId,
          disabled: serviceSwitching,
        }}
        rowErrors={serviceErrors}
        onAuthError={toLogin}
        footnote={
          <>
            Each service needs a name and a price. Leave the duration on
            “Duration” to use one booking slot. Hide takes a service off the
            garage page straight away; past bookings keep it, and you can show
            it again from Hidden services.
          </>
        }
      />

      {/* Always mounted, so the message is announced when it lands. */}
      <p
        role="status"
        className={
          serviceNotice ? 'text-[12px] text-text-secondary' : 'sr-only'
        }
      >
        {serviceNotice}
      </p>

      {hiddenLoadFailed ? (
        <p className="text-[12px] text-error">
          Couldn’t load the hidden services. Reload the page to see them.
        </p>
      ) : (
        hiddenServices.length > 0 && (
          <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
            {/* Collapsed: these are off the garage page, and the services
                that are on it are what this tab is for. */}
            <button
              ref={hiddenToggleRef}
              type="button"
              aria-expanded={showHidden}
              aria-controls="hidden-services"
              onClick={() => setShowHidden((open) => !open)}
              className="flex min-h-11 w-full items-center gap-3 py-3.5 pl-4 pr-3.5 text-left"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-text-secondary"
              >
                <IconEyeOff size={18} stroke={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium tracking-[-0.01em] text-text-primary">
                  Hidden services (
                  <span className="font-numeric">{hiddenServices.length}</span>)
                </span>
                <span className="mt-0.5 block text-[12.5px] text-text-muted">
                  Customers don’t see these. Past bookings keep them.
                </span>
              </span>
              <IconChevronDown
                size={20}
                aria-hidden="true"
                className={cn(
                  'shrink-0 text-text-muted transition-transform',
                  showHidden && 'rotate-180'
                )}
              />
            </button>
            {showHidden && (
              <div id="hidden-services" className="border-t border-border">
                <p className="px-4 pt-3 text-[12px] text-text-muted">
                  Showing one again puts it back on the garage page straight
                  away, with the price it had.
                </p>
                <ul className="divide-y divide-line">
                  {hiddenServices.map((hidden) => {
                    const warning = showAgainWarning(hidden)
                    const warningId = `hidden-${hidden.id}-warning`
                    return (
                      <li
                        key={hidden.id}
                        className="flex flex-wrap items-center gap-2 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] text-text-primary">
                            {hidden.name}
                          </p>
                          <p className="font-numeric text-[12px] text-text-muted">
                            {storedPriceSummary(hidden)}
                          </p>
                          {/* Before the tap, not after a customer finds out:
                              shown again as it is, a size with no price
                              can't be booked. */}
                          {warning && (
                            <p
                              id={warningId}
                              className="text-[12px] text-warning"
                            >
                              {warning}
                            </p>
                          )}
                          {serviceErrors[hidden.id] && (
                            <p role="alert" className="text-[12px] text-error">
                              {serviceErrors[hidden.id]}
                            </p>
                          )}
                        </div>
                        <ScButton
                          fullWidth={false}
                          variant="secondary"
                          disabled={serviceSwitching || saving}
                          aria-label={`Show ${hidden.name} again`}
                          aria-describedby={warning ? warningId : undefined}
                          onClick={() => void showServiceAgain(hidden)}
                          className="min-h-11 rounded-full px-3.5 py-2 text-[12.5px] font-medium"
                        >
                          {serviceBusyId === hidden.id
                            ? 'Working…'
                            : 'Show again'}
                        </ScButton>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )
      )}
    </>
  )
}
