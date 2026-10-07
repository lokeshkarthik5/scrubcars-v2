// Runs in the browser before the app hydrates. Starts crash reporting when
// this build has a Sentry DSN, and does nothing otherwise (see lib/monitoring).
import { startMonitoring } from './lib/monitoring'

void startMonitoring()
