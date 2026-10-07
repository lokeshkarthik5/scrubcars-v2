import { ProgressBar } from '@repo/ui/sc/progress-bar'
import { TopBar } from '@repo/ui/sc/top-bar'

/**
 * The top of each sign-up step: back to the step before, how far along, and
 * what this step is about as the screen's title. The four steps each built
 * their own, and only the first had no back arrow — which is right, since
 * there is nothing before it to go back to.
 */
export function OnboardingHeader({
  step,
  title,
  subtitle,
  backHref,
}: {
  step: 1 | 2 | 3 | 4
  title: string
  subtitle?: string
  /** The step before. Absent on step 1. */
  backHref?: string
}) {
  return (
    <div className="flex flex-col gap-4">
      {backHref ? <TopBar showBack backHref={backHref} /> : <div className="h-2" />}
      <ProgressBar progress={step * 25} />
      <div>
        <p className="text-[11px] font-medium text-text-secondary">
          Step <span className="font-numeric">{step}</span> of{' '}
          <span className="font-numeric">4</span>
        </p>
        <h1 className="mt-1 text-[20px] font-semibold leading-7 tracking-tight text-text-primary">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-text-secondary">{subtitle}</p>}
      </div>
    </div>
  )
}
