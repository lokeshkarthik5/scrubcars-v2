'use client'

import dynamic from 'next/dynamic'
import { isHomeHubEnabled } from '@/lib/home-hub'

// Each build serves one of the two screens (lib/home-hub.ts), so each is its
// own chunk and only the one this build shows is loaded. Imported statically,
// both were in /home's first load whichever was on.
const loadHub = () => import('@/components/home/home-hub-screen')
const loadList = () => import('@/components/garages/garage-list-screen')

const HomeHubScreen = dynamic(() => loadHub().then((m) => m.HomeHubScreen))
const GarageListScreen = dynamic(() => loadList().then((m) => m.GarageListScreen))

// Fetched as soon as this module runs, beside the session check, rather than
// once the session is known and the screen first renders (AppProvider shows
// nothing until then), so splitting it out costs no wait.
if (typeof window !== 'undefined') {
  void (isHomeHubEnabled() ? loadHub() : loadList()).catch(() => undefined)
}

/** /home: the Home hub, or (flag off) the garage list /garages renders. */
export function HomeScreen() {
  return isHomeHubEnabled() ? <HomeHubScreen /> : <GarageListScreen />
}
