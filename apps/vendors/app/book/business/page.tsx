'use client'

import { useState, type ComponentType } from 'react'
import Link from 'next/link'
import { toast } from 'react-toastify'
import {
  IconBell,
  IconBook,
  IconBuildingBank,
  IconChevronRight,
  IconSettings,
  IconStar,
  IconTool,
  IconUser,
} from '@tabler/icons-react'
import { downloadBook } from '@repo/core/api/garage-book'
import { useBookOwed, useBookReminders, useBookServices, useBookStats } from '@repo/core/api/hooks/use-garage-book'
import { monthName, rupees } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { BookScreen, IconWell, Overline, raised } from '@/components/book/parts'

type Icon = ComponentType<{ size?: number; className?: string; stroke?: string | number }>

/**
 * Business (B3): every tool in one place. A Stats card on top, then Money
 * owed, Reminders, Reviews, Payouts, Services & prices and Settings (the
 * gear), and Download my book. Today's Services, Earnings and Settings tabs
 * live here now; nothing was removed. Stage 2 and 3 tools (Stock, Team,
 * Expenses, Bills, Booking link) stay hidden until they are built. Staff get
 * the tools that carry no money.
 */
export default function BusinessPage() {
  const isOwner = useIsVendorAdmin()
  const garage = useAuthStore((s) => s.vendor?.businessName) ?? 'your garage'
  const now = new Date()
  const stats = useBookStats(undefined, 'all', isOwner)
  const owed = useBookOwed(isOwner)
  const reminders = useBookReminders()
  const services = useBookServices(isOwner)
  const [downloading, setDownloading] = useState(false)
  const dueToday = reminders.data?.due.filter((r) => !r.sentAt).length

  const download = async () => {
    setDownloading(true)
    try {
      const bytes = await downloadBook()
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${garage.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-book.xlsx`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't download your book. Try again.")
    } finally {
      setDownloading(false)
    }
  }

  const tools: Array<{ group: string; items: Array<{ icon: Icon; title: string; line: string; href: string; tone?: string }> }> = [
    {
      group: 'Money and customers',
      items: [
        ...(isOwner
          ? [
              {
                icon: IconBook,
                title: 'Money owed',
                line: owed.data ? (owed.data.totalPaise > 0 ? `${rupees(owed.data.totalPaise)} · ${owed.data.customers.length} ${owed.data.customers.length === 1 ? 'customer' : 'customers'}` : 'No one owes you') : ' ',
                href: '/book/owed',
                tone: owed.data && owed.data.totalPaise > 0 ? 'text-[#FF8A95]' : undefined,
              },
            ]
          : []),
        {
          icon: IconBell,
          title: 'Reminders',
          line: dueToday === undefined ? ' ' : dueToday > 0 ? `${dueToday} due today` : 'No one due today',
          href: '/book/reminders',
          tone: dueToday ? 'text-[#F5A524]' : undefined,
        },
        ...(isOwner ? [{ icon: IconStar, title: 'Reviews', line: 'Your rating and replies', href: '/reviews' }] : []),
      ],
    },
    ...(isOwner
      ? [
          {
            group: 'With Detlio',
            items: [
              { icon: IconBuildingBank, title: 'Payouts', line: 'Earnings and payouts', href: '/earnings' },
              { icon: IconTool, title: 'Services & prices', line: services.data ? `${services.data.filter((s) => !s.isAddon).length} services` : ' ', href: '/services' },
            ],
          },
        ]
      : [{ group: 'You', items: [{ icon: IconUser, title: 'Your account', line: 'Leave, log out', href: '/account' }] }]),
  ]

  return (
    <BookScreen className="gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-text-primary">Business</h1>
          <p className="text-t4 text-[#A8A8B2]">Everything to run {garage}</p>
        </div>
        {isOwner && (
          <Link href="/settings" aria-label="Settings" className={cn(raised, 'hub-tab grid size-10 shrink-0 place-items-center rounded-small')}>
            <IconSettings size={20} aria-hidden />
          </Link>
        )}
      </div>

      {isOwner && (
        <Link href="/book/stats" className="fx-edge fx-press flex items-center gap-3 rounded-surface p-4">
          <span className="min-w-0 flex-1">
            <Overline>Stats · {monthName(stats.data?.month ?? now.toISOString().slice(0, 7), now)}</Overline>
            <span className="mt-0.5 block font-numeric text-[28px] font-semibold leading-9 text-text-primary">{stats.data ? rupees(stats.data.takenPaise) : '–'}</span>
            <span className="block text-[12px] text-[#A8A8B2]">
              {stats.data?.changePercent !== null && stats.data?.changePercent !== undefined
                ? `${stats.data.changePercent >= 0 ? '↑' : '↓'} ${Math.abs(stats.data.changePercent)}% on last month, same days`
                : 'Your own and Detlio, this month'}
            </span>
          </span>
          {stats.data && <Spark counts={stats.data.busiestDays} />}
        </Link>
      )}

      {tools.map((group) => (
        <div key={group.group} className="flex flex-col gap-2">
          <Overline>{group.group}</Overline>
          <div className="grid grid-cols-2 gap-2">
            {group.items.map((tool) => (
              <Link key={tool.title} href={tool.href} className="fx-edge fx-press flex min-w-0 flex-col gap-2.5 rounded-surface p-3">
                <span className="hub-tab">
                  <IconWell>
                    <tool.icon size={19} aria-hidden />
                  </IconWell>
                </span>
                <span className="min-w-0">
                  <span className="block text-t3 font-semibold text-text-primary">{tool.title}</span>
                  <span className={cn('mt-0.5 block truncate text-[12px]', tool.tone ?? 'text-[#A8A8B2]')}>{tool.line}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {isOwner && (
        <button type="button" onClick={download} disabled={downloading} className={cn(raised, 'flex items-center gap-3 rounded-control px-3.5 py-3 text-left')}>
          <span className="flex-1">
            <span className="block text-t3 font-semibold text-text-primary">{downloading ? 'Getting your book…' : 'Download my book'}</span>
            <span className="block text-[12px] text-[#A8A8B2]">Customers, jobs and money as Excel</span>
          </span>
          <IconChevronRight size={20} className="text-[#8E8E98]" aria-hidden />
        </button>
      )}
    </BookScreen>
  )
}

/** The last four weeks' jobs by weekday, as a small red line. */
function Spark({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts)
  const points = counts.map((n, i) => `${2 + i * 19},${36 - (n / max) * 30}`)
  const last = points.at(-1)?.split(',') ?? ['116', '6']
  return (
    <svg width="120" height="40" viewBox="0 0 120 40" aria-hidden>
      <polyline points={points.join(' ')} fill="none" stroke="#ff2d4a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 4px rgb(255 45 74 / .8))' }} />
      <circle cx={last[0]} cy={last[1]} r="3" fill="#fff" />
    </svg>
  )
}
