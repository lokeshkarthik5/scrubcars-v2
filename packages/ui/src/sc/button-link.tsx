import Link from 'next/link'
import type { ComponentProps } from 'react'
import { cn } from '@repo/core/utils'
import { scButtonClass, type ButtonVariant } from './button'

interface ScButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant
  /** Off by default: a link button usually sits in a header or a row. */
  fullWidth?: boolean
}

/**
 * A link drawn as an ScButton — "Add vendor", "Edit", "See all". The admin
 * panel used to wrap an ScButton in a <Link>, which is a button inside a link:
 * one target that announces as two, and that a keyboard tabs onto twice.
 */
export function ScButtonLink({
  variant = 'primary',
  fullWidth = false,
  className,
  ...props
}: ScButtonLinkProps) {
  return (
    <Link
      className={scButtonClass({
        variant,
        fullWidth,
        className: cn('inline-flex min-h-11 items-center justify-center gap-1.5 px-4', className),
      })}
      {...props}
    />
  )
}
