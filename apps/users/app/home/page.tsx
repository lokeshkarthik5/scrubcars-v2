import { GarageListScreen } from '@/components/garages/garage-list-screen'

// Still the garage list, the same component /garages renders, until the new
// Home is built. That one will ship behind NEXT_PUBLIC_HOME_HUB (see
// lib/home-hub.ts); with the flag off, this page stays exactly as it is.
//
// /home keeps the welcome toast (?welcome=1) and stays where the app opens:
// the manifest's start_url, the signed-in hint and sign-in all land here.
export default function HomePage() {
  return <GarageListScreen />
}
