import { GarageListScreen } from '@/components/garages/garage-list-screen'
import { HomeHubScreen } from '@/components/home/home-hub-screen'
import { isHomeHubEnabled } from '@/lib/home-hub'

// The new Home hub, behind NEXT_PUBLIC_HOME_HUB (lib/home-hub.ts). With the
// flag off — production, until the owner signs off a preview on live data —
// this page is exactly what it was: the garage list, the same component
// /garages renders. The flag is read at build time, so each build serves one
// or the other, never both.
//
// /home keeps the welcome toast (?welcome=1) and stays where the app opens:
// the manifest's start_url, the signed-in hint and sign-in all land here. A
// signed-out visitor on the hub is sent on to /garages.
export default function HomePage() {
  return isHomeHubEnabled() ? <HomeHubScreen /> : <GarageListScreen />
}
