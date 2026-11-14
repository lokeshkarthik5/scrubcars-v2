'use client'

import { useState, type ComponentType } from 'react'
import Link from 'next/link'
import { toast } from 'react-toastify'
import {
  IconBell,
  IconBook,
  IconBox,
  IconBuildingBank,
  IconChevronRight,
  IconFileImport,
  IconLink,
  IconQrcode,
  IconReceipt,
  IconSettings,
  IconStar,
  IconTool,
  IconUser,
  IconUsersGroup,
  IconWallet,
} from '@tabler/icons-react'
import { downloadBook } from '@repo/core/api/garage-book'
import {
  useBookExpenses,
  useBookOwed,
  useBookReminders,
  useBookServices,
  useBookStats,
  useBookStock,
  useBookTeam,
} from '@repo/core/api/hooks/use-garage-book'
import { monthName, rupees, teamTileLine } from '@repo/core/garage-book'
import { useIsVendorAdmin } from '@repo/core/hooks/use-vendor-role'
import { useT, useTn } from '@repo/core/i18n'
import { useAuthStore } from '@repo/core/stores/auth-store'
import { cn } from '@repo/core/utils'
import { MilestoneCard } from '@/components/book/milestone-card'
import { BookScreen, IconWell, Overline, raised } from '@/components/book/parts'

type Icon = ComponentType<{ size?: number; className?: string; stroke?: string | number }>
type Tool = { icon: Icon; title: string; line: string; href: string; tone?: string; fresh?: boolean }

/**
 * Business (B3): every tool in one place. A Stats card on top, then Money
 * owed, Reminders, Reviews, Payouts, Services & prices and Settings (the
 * gear), and Download my book. Today's Services, Earnings and Settings tabs
 * live here now; nothing was removed. Staff get the tools that carry no
 * money.
 *
 * 0074 (OneBusiness): "Run the garage" with Stock, Team, Expenses and
 * Bills, and Booking link, Payment details and Bring in your book beside
 * Money owed; the new ones marked NEW. Staff see Team (no money) and Stock
 * (no prices). A milestone (moment 6) shows on top once.
 */
export default function BusinessPage() {
  const t = useT()
  const tn = useTn()
  const isOwner = useIsVendorAdmin()
  const businessName = useAuthStore((s) => s.vendor?.businessName)
  const garage = businessName ?? t('your garage')
  const now = new Date()
  const stats = useBookStats(undefined, 'all', isOwner)
  const owed = useBookOwed(isOwner)
  const reminders = useBookReminders()
  const services = useBookServices(isOwner)
  const stock = useBookStock()
  const team = useBookTeam(undefined)
  const expenses = useBookExpenses(undefined, isOwner)
  const [downloading, setDownloading] = useState(false)
  const dueToday = reminders.data?.due.filter((r) => !r.sentAt).length

  const download = async () => {
    setDownloading(true)
    try {
      const bytes = await downloadBook()
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${(businessName ?? 'your garage').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-book.xlsx`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Couldn't download your book. Try again."))
    } finally {
      setDownloading(false)
    }
  }

  const amber = 'text-[#F5A524]'
  const run: Tool[] = [
    {
      icon: IconBox,
      title: t('Stock'),
      line: stock.data
        ? stock.data.lowCount > 0
          ? tn(stock.data.lowCount, '{count} running low', '{count} running low')
          : stock.data.items.length > 0
            ? t('All stocked')
            : t('What you use, counted')
        : ' ',
      href: '/book/stock',
      tone: stock.data && stock.data.lowCount > 0 ? amber : undefined,
      fresh: true,
    },
    {
      icon: IconUsersGroup,
      title: t('Team'),
      line: team.data ? (team.data.members.length > 0 ? teamTileLine(team.data) : t('Who did each job')) : ' ',
      href: '/book/team',
      fresh: true,
    },
    ...(isOwner
      ? [
          {
            icon: IconWallet,
            title: t('Expenses'),
            line: expenses.data ? t('{amount} this month', { amount: rupees(expenses.data.spentPaise) ?? '' }) : ' ',
            href: '/book/expenses',
            fresh: true,
          },
          // A bill is made from its job: Jobs, then the job, then Bill.
          { icon: IconReceipt, title: t('Bills'), line: t('Send a bill on WhatsApp'), href: '/book/jobs', fresh: true },
        ]
      : []),
  ]

  const tools: Array<{ group: string; items: Tool[] }> = [
    { group: t('Run the garage'), items: run },
    {
      group: t('Money and customers'),
      items: [
        ...(isOwner
          ? [
              {
                icon: IconBook,
                title: t('Money owed'),
                line: owed.data
                  ? owed.data.totalPaise > 0
                    ? `${rupees(owed.data.totalPaise)} · ${tn(owed.data.customers.length, '{count} customer', '{count} customers')}`
                    : t('No one owes you')
                  : ' ',
                href: '/book/owed',
                tone: owed.data && owed.data.totalPaise > 0 ? 'text-[#FF8A95]' : undefined,
              },
            ]
          : []),
        {
          icon: IconBell,
          title: t('Reminders'),
          line: dueToday === undefined ? ' ' : dueToday > 0 ? t('{count} due today', { count: dueToday }) : t('No one due today'),
          href: '/book/reminders',
          tone: dueToday ? amber : undefined,
        },
        ...(isOwner
          ? [
              { icon: IconLink, title: t('Booking link'), line: t('Your own page and QR'), href: '/book/link', fresh: true },
              { icon: IconQrcode, title: t('Payment details'), line: t('Your UPI QR on bills'), href: '/book/payments', fresh: true },
              { icon: IconFileImport, title: t('Bring in your book'), line: t('From paper or Excel'), href: '/book/import', fresh: true },
              { icon: IconStar, title: t('Reviews'), line: t('Your rating and replies'), href: '/reviews' },
            ]
          : []),
      ],
    },
    ...(isOwner
      ? [
          {
            group: t('With Detlio'),
            items: [
              { icon: IconBuildingBank, title: t('Payouts'), line: t('Earnings and payouts'), href: '/earnings' },
              { icon: IconTool, title: t('Services & prices'), line: services.data ? t('{count} services', { count: services.data.filter((s) => !s.isAddon).length }) : ' ', href: '/services' },
            ],
          },
        ]
      : [{ group: t('You'), items: [{ icon: IconUser, title: t('Your account'), line: t('Leave, log out'), href: '/account' }] }]),
  ]

  return (
    <BookScreen className="gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-text-primary">{t('Business')}</h1>
          <p className="text-t4 text-[#A8A8B2]">{t('Everything to run {garage}', { garage })}</p>
        </div>
        {isOwner && (
          <Link href="/settings" aria-label={t('Settings')} className={cn(raised, 'hub-tab grid size-10 shrink-0 place-items-center rounded-small')}>
            <IconSettings size={20} aria-hidden />
          </Link>
        )}
      </div>

      {isOwner && <MilestoneCard garage={garage} />}

      {isOwner && (
        <Link href="/book/stats" className="fx-edge fx-press flex items-center gap-3 rounded-surface p-4">
          <span className="min-w-0 flex-1">
            <Overline>{t('Stats · {month}', { month: monthName(stats.data?.month ?? now.toISOString().slice(0, 7), now) })}</Overline>
            <span className="mt-0.5 block font-numeric text-[28px] font-semibold leading-9 text-text-primary">{stats.data ? rupees(stats.data.takenPaise) : '–'}</span>
            <span className="block text-[12px] text-[#A8A8B2]">
              {stats.data?.profitPaise !== null && stats.data?.profitPaise !== undefined && `${t('Profit {amount}', { amount: rupees(stats.data.profitPaise) ?? '' })} · `}
              {stats.data?.changePercent !== null && stats.data?.changePercent !== undefined
                ? t('{arrow} {percent}% on last month, same days', {
                    arrow: stats.data.changePercent >= 0 ? '↑' : '↓',
                    percent: Math.abs(stats.data.changePercent),
                  })
                : t('Your own and Detlio, this month')}
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
                <span className="hub-tab flex items-start justify-between gap-2">
                  <IconWell>
                    <tool.icon size={19} aria-hidden />
                  </IconWell>
                  {tool.fresh && <span className="fx-silver rounded-[6px] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.08em]">{t('NEW')}</span>}
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
            <span className="block text-t3 font-semibold text-text-primary">{downloading ? t('Getting your book…') : t('Download my book')}</span>
            <span className="block text-[12px] text-[#A8A8B2]">{t('Customers, jobs and money as Excel')}</span>
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
