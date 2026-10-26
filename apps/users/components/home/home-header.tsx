import Image from 'next/image'
import Link from 'next/link'
import { IconBell } from '@tabler/icons-react'
import { initialOf } from '@repo/core/home-display'

/** "Good morning" before noon, "Good afternoon" until 5 pm, then "Good evening", in Chennai. */
export function greetingFor(now: Date): string {
  const hour = new Date(now.getTime() + 330 * 60_000).getUTCHours()
  return hour < 12
    ? 'Good morning'
    : hour < 17
      ? 'Good afternoon'
      : 'Good evening'
}

interface HomeHeaderProps {
  /** "Karthik" for "R. Karthik": the server's firstNameOf, or the core twin. */
  firstName: string
  avatarUrl: string | null
  /** Something in Updates is newer than the last time it was opened. */
  hasUnread: boolean
  /** The server's clock, for the greeting. */
  now: Date
}

/**
 * "Good morning / Arjun" (no emoji, first name only), the avatar, and the bell. The bell's dot is the only
 * signal of something new; its accessible name says the same thing, so it is
 * not colour alone.
 */
export function HomeHeader({
  firstName,
  avatarUrl,
  hasUnread,
  now,
}: HomeHeaderProps) {
  return (
    <header className="flex items-center justify-between pt-1.5 pb-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#2E2E34] to-[#1C1C20] text-[15px] font-medium text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
            />
          ) : (
            <span aria-hidden>{initialOf(firstName)}</span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] text-dim">{greetingFor(now)}</span>
          <span className="block truncate text-[17px] tracking-[-0.01em] text-text-primary">
            {firstName}
          </span>
        </span>
      </div>
      <Link
        href="/updates"
        aria-label={hasUnread ? 'Updates, new' : 'Updates'}
        className="relative grid size-11 place-items-center rounded-full border border-line bg-white/[0.02] text-text-primary"
      >
        <IconBell size={21} stroke={1.5} aria-hidden />
        {hasUnread && (
          <span
            aria-hidden
            data-testid="updates-dot"
            className="absolute top-[9px] right-[10px] size-2 rounded-full bg-brand-red shadow-[0_0_0_2px_#0A0A0B]"
          />
        )}
      </Link>
    </header>
  )
}
