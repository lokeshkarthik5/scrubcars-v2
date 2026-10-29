'use client'

import Link from 'next/link'
import {
  IconBell,
  IconChevronRight,
  IconFileText,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react'
import { useDataResetConfig } from '@repo/core/api/hooks/use-admin-data-reset'
import { cn } from '@repo/core/utils'
import { PageHeader } from '@repo/ui/sc/page-header'
import { TierSwitchesCard } from '@/components/tier-switches-card'

function SettingsLink({
  href,
  icon: Icon,
  title,
  body,
  danger = false,
}: {
  href: string
  icon: typeof IconBell
  title: string
  body: string
  danger?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-16 items-center gap-3 rounded-[12px] border bg-surface px-4 py-3 transition-colors hover:bg-surface-elevated',
        danger ? 'border-tone-late-text/40' : 'border-border'
      )}
    >
      <Icon
        size={20}
        stroke={1.6}
        aria-hidden="true"
        className={danger ? 'text-tone-late-text' : 'text-text-secondary'}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-medium text-text-primary">
          {title}
        </span>
        <span className="text-[13px] text-text-secondary">{body}</span>
      </span>
      <IconChevronRight
        size={18}
        aria-hidden="true"
        className="shrink-0 text-text-muted"
      />
    </Link>
  )
}

/**
 * Settings: the panel's setup and one-off tools, out of the daily menu (UX
 * audit, admin mockup 01). Alerts moved here from the Statistics header, and
 * Start pilot clean from the main menu and the Bookings title, into a danger
 * zone of its own.
 */
export default function SettingsPage() {
  // Only while the API has it switched on (ADMIN_DATA_RESET); a 404 otherwise.
  const { data: resetConfig } = useDataResetConfig()
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="The team, garages' tiers and agreement, and the one-off tools."
      />
      <section aria-labelledby="settings-team" className="flex flex-col gap-2">
        <h2
          id="settings-team"
          className="text-[13px] font-medium text-text-secondary"
        >
          Team
        </h2>
        <SettingsLink
          href="/settings/team"
          icon={IconUsers}
          title="Team logins"
          body="A login for each person, so every action is signed."
        />
        <SettingsLink
          href="/alerts"
          icon={IconBell}
          title="Telegram alerts"
          body="Whether the team's alerts are set up, and Send test alert."
        />
      </section>
      {/* Bronze / Silver / Gold and the garage agreement (0063). */}
      <section aria-labelledby="settings-garages" className="flex flex-col gap-2">
        <h2
          id="settings-garages"
          className="text-[13px] font-medium text-text-secondary"
        >
          Garages
        </h2>
        <TierSwitchesCard />
        <SettingsLink
          href="/settings/agreement"
          icon={IconFileText}
          title="Garage agreement"
          body="Upload each version as a PDF. Garages accept the newest in their app, for Bronze."
        />
      </section>
      {resetConfig?.enabled && (
        <section
          aria-labelledby="settings-danger"
          className="flex flex-col gap-2"
        >
          <h2
            id="settings-danger"
            className="text-[13px] font-medium text-tone-late-text"
          >
            Danger zone
          </h2>
          <SettingsLink
            href="/data-reset"
            icon={IconTrash}
            title="Start pilot clean"
            body="Delete test bookings before the pilot starts. Real payments are always kept."
            danger
          />
        </section>
      )}
    </>
  )
}
