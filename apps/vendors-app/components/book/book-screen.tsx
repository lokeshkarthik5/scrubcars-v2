import { type Href, router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { useGarageBookOn } from '@/lib/garage-book';

/**
 * A Garage Book screen (the web's BookScreen): the app's shell; never shown with the book
 * off (Home instead).
 */
export function BookScreen({ children, gap = 16, footer, hasNav = true }: { children: ReactNode; gap?: number; footer?: ReactNode; hasNav?: boolean }) {
  const on = useGarageBookOn();
  useEffect(() => {
    if (!on) router.replace('/home' as Href);
  }, [on]);
  if (!on) return null;
  return (
    <AppShell gap={gap} footer={footer} hasNav={hasNav}>
      {children}
    </AppShell>
  );
}
