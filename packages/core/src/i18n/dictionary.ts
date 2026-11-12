import { common } from './ta/common'
import { customer } from './ta/customer'
import { customerApp } from './ta/customer-app'
import { customerWeb } from './ta/customer-web'
import { garage } from './ta/garage'
import { garageApp } from './ta/garage-app'
import { garageWeb } from './ta/garage-web'

/**
 * The Tamil, one file per surface so the people translating each app never
 * edit the same file: common (shared words, packages/ui, packages/native-ui
 * and core's helpers), customer (both customer apps), customer-web,
 * customer-app, garage (both garage apps), garage-web, garage-app.
 *
 * Every app reads the one merged lookup, so a string already translated for
 * another surface is translated here too. The same English in two files must
 * have the same Tamil (i18n.test.ts), so the order below never decides
 * anything.
 */
export const TA_FILES = {
  common,
  customer,
  'customer-web': customerWeb,
  'customer-app': customerApp,
  garage,
  'garage-web': garageWeb,
  'garage-app': garageApp,
} as const satisfies Record<string, Readonly<Record<string, string>>>

export type TaFile = keyof typeof TA_FILES

export const TA: Readonly<Record<string, string>> = Object.assign(
  {},
  ...Object.values(TA_FILES)
)
