import { rewriteSystemPath } from '@/lib/deep-link';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return rewriteSystemPath(path);
}
