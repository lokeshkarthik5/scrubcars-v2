import { describe, expect, test } from 'bun:test'
import {
  bookingModeFlags,
  bookingModeOf,
  bookingReachLine,
  dirtyFields,
  dirtyTabs,
  garageFieldsProblem,
  onboardedByInput,
  onboardedBySelectValue,
  ONBOARDED_BY_NOT_SET,
  ONBOARDED_BY_OTHER,
  parseEditTab,
  parsePageTab,
  PAGE_TABS,
  PAGE_TAB_LABELS,
  isEditTab,
  EDIT_TABS,
  parseRadiusInput,
  customerGarageUrl,
  safeBackHref,
  saveBarLine,
  type TabValues,
} from './garage-edit'

describe('parsePageTab', () => {
  test('Documents opens while documents are on, and falls back to Details while off', () => {
    expect(parsePageTab('documents')).toBe('documents')
    expect(parsePageTab('documents', false)).toBe('details')
    // Certification is always there, documents or not.
    expect(parsePageTab('certification')).toBe('certification')
    expect(parsePageTab('certification', false)).toBe('certification')
    expect(parsePageTab('services', false)).toBe('services')
    // Team & payout, new with the two-column editor.
    expect(parsePageTab('team')).toBe('team')
    expect(parsePageTab('team', false)).toBe('team')
    expect(parsePageTab('Documents')).toBe('details')
    expect(parsePageTab(undefined)).toBe('details')
  })

  test('only the four form tabs are Save changes’ own', () => {
    expect(PAGE_TABS.filter(isEditTab)).toEqual([...EDIT_TABS])
    expect(PAGE_TAB_LABELS.documents).toBe('Documents')
  })

  test('the tabs in order, under their names; old `?tab=` values still open them', () => {
    expect(PAGE_TABS.map((tab) => PAGE_TAB_LABELS[tab])).toEqual([
      'Details',
      'Location',
      'Hours & booking',
      'Services',
      'Team & payout',
      'Documents',
      'Tier',
    ])
    expect(parsePageTab('operations')).toBe('operations')
    expect(parsePageTab('certification')).toBe('certification')
  })
})

describe('parseEditTab', () => {
  test('opens a tab a link names, and only one of the four', () => {
    expect(parseEditTab('services')).toBe('services')
    expect(parseEditTab('operations')).toBe('operations')
    expect(parseEditTab('Services')).toBe('details')
    expect(parseEditTab('team')).toBe('details')
    expect(parseEditTab(['services', 'location'])).toBe('details')
    expect(parseEditTab(undefined)).toBe('details')
  })
})

describe('safeBackHref', () => {
  test('keeps a garage-list path, filters and all', () => {
    expect(safeBackHref('/vendors')).toBe('/vendors')
    expect(safeBackHref('/vendors?status=pending&q=foam')).toBe('/vendors?status=pending&q=foam')
    expect(safeBackHref('/vendors/new')).toBe('/vendors/new')
  })

  test('never leaves the panel', () => {
    for (const value of [
      'https://evil.example/vendors',
      '//evil.example',
      '/\\evil.example',
      '/vendors\\..\\evil',
      '/vendorsx',
      '/bookings',
      'javascript:alert(1)',
      '/vendors?q=a b',
      undefined,
      ['/vendors'],
    ]) {
      expect(safeBackHref(value)).toBe('/vendors')
    }
  })
})

describe('dirtyTabs', () => {
  const loaded: TabValues = {
    details: { businessName: 'Foam Hub', notes: '' },
    location: { address: '1, Main Road', lat: 13.05, lng: 80.25 },
    operations: { bays: '2', vehicleTypes: ['Hatchback', 'SUV'] },
    services: [{ id: 's1', name: 'Foam wash', price: 450 }],
  }

  test('nothing changed, nothing dirty', () => {
    expect(dirtyTabs(loaded, structuredClone(loaded))).toEqual([])
  })

  test('names each changed tab once, in tab order', () => {
    const now = structuredClone(loaded) as typeof loaded & {
      services: Array<{ price: number }>
      details: { businessName: string }
    }
    now.services[0].price = 500
    now.details.businessName = 'Foam Hub Adyar'
    expect(dirtyTabs(loaded, now)).toEqual(['details', 'services'])
  })

  test('key order does not count as a change; a value put back is clean again', () => {
    const now = structuredClone(loaded)
    now.location = { lng: 80.25, lat: 13.05, address: '1, Main Road' }
    expect(dirtyTabs(loaded, now)).toEqual([])
  })

  test('an undefined field reads the same as a missing one', () => {
    const now = structuredClone(loaded)
    now.details = { businessName: 'Foam Hub', notes: '', email: undefined }
    expect(dirtyTabs(loaded, now)).toEqual([])
  })
})

describe('dirtyTabs and Go live', () => {
  test('the stage and Verified are their own section, after the tabs', () => {
    const saved: TabValues = {
      details: { businessName: 'Foam Hub' },
      location: {},
      operations: {},
      services: [],
      golive: { status: 'pending', isVerified: false },
    }
    const now = structuredClone(saved)
    now.golive = { status: 'active', isVerified: false }
    now.details = { businessName: 'Foam Hub Adyar' }
    expect(dirtyTabs(saved, now)).toEqual(['details', 'golive'])
  })
})

describe('dirtyFields and saveBarLine', () => {
  const saved: TabValues = {
    details: { ownerName: 'Ravi', businessName: 'Foam Hub', onboardedByName: null },
    location: { address: '1, Main Road', lat: 13.05, lng: 80.25 },
    operations: { hours: [{ dayOfWeek: 6, closeTime: '13:00' }], bays: '2' },
    services: [{ id: 's1', name: 'Foam wash', price: 450 }],
    golive: { status: 'pending', isVerified: false },
  }

  test('nothing changed: no fields, and the bar says so', () => {
    expect(dirtyFields(saved, structuredClone(saved))).toEqual([])
    expect(saveBarLine([])).toBe('No unsaved changes')
  })

  test('one change names its field', () => {
    const now = structuredClone(saved)
    now.details = { ...(saved.details as object), businessName: 'Foam Hub Adyar' }
    const fields = dirtyFields(saved, now)
    expect(fields).toEqual([{ tab: 'details', label: 'business name' }])
    expect(saveBarLine(fields)).toBe('1 unsaved change · business name')
  })

  test('each field once, in tab order; the pin is one field; services one change', () => {
    const now = structuredClone(saved) as Record<string, unknown>
    now.location = { address: '2, Main Road', lat: 13.06, lng: 80.26 }
    now.operations = { hours: [{ dayOfWeek: 6, closeTime: '14:00' }], bays: '3' }
    now.services = [{ id: 's1', name: 'Foam wash', price: 500 }, { name: 'Body wash' }]
    now.golive = { status: 'active', isVerified: true }
    now.details = { ...(saved.details as object), onboardedByName: 'E2E Admin' }
    const fields = dirtyFields(saved, now as TabValues)
    expect(fields).toEqual([
      { tab: 'details', label: 'onboarded by' },
      { tab: 'location', label: 'address' },
      { tab: 'location', label: 'map pin' },
      { tab: 'operations', label: 'hours' },
      { tab: 'operations', label: 'bays' },
      { tab: 'services', label: 'services' },
      { tab: 'golive', label: 'stage' },
      { tab: 'golive', label: 'verified' },
    ])
    expect(saveBarLine(fields)).toBe(
      '8 unsaved changes · onboarded by, address, map pin, hours, bays, services, stage, verified'
    )
  })

  test('a field put back is clean again; key order and undefined do not count', () => {
    const now = structuredClone(saved)
    now.location = { lng: 80.25, lat: 13.05, address: '1, Main Road', mapsUrl: undefined }
    expect(dirtyFields(saved, now)).toEqual([])
  })
})

describe('Onboarded by', () => {
  const logins = ['E2E Admin', 'E2E Collector']

  test('the select shows the login, Someone else, or Not set', () => {
    expect(onboardedBySelectValue('E2E Admin', logins, false)).toBe('E2E Admin')
    expect(onboardedBySelectValue(' E2E Admin ', logins, false)).toBe('E2E Admin')
    expect(onboardedBySelectValue('Priya from the shop', logins, false)).toBe(ONBOARDED_BY_OTHER)
    expect(onboardedBySelectValue('', logins, false)).toBe(ONBOARDED_BY_NOT_SET)
    // Someone else picked and nothing typed yet: still Someone else.
    expect(onboardedBySelectValue('', logins, true)).toBe(ONBOARDED_BY_OTHER)
    // A login that has gone since reads as free text, not as Not set.
    expect(onboardedBySelectValue('E2E Admin', [], false)).toBe(ONBOARDED_BY_OTHER)
  })

  test('saved trimmed, at most 100 characters, and empty is null', () => {
    expect(onboardedByInput('  Raga ')).toBe('Raga')
    expect(onboardedByInput('   ')).toBeNull()
    expect(onboardedByInput('x'.repeat(120))).toHaveLength(100)
  })
})

describe('garageFieldsProblem', () => {
  const ok = {
    ownerName: 'Ravi',
    ownerPhone: '9000000001',
    businessName: 'Foam Hub',
    phone: '9000000002',
    address: '1, Main Road',
    city: 'Chennai',
    pincode: '600001',
  }

  test('null when every field is fine', () => {
    expect(garageFieldsProblem(ok)).toBeNull()
  })

  test('names the first problem and the tab it is on', () => {
    expect(garageFieldsProblem({ ...ok, ownerPhone: '90000' })).toBe(
      'Owner phone must be 10 digits (Details)'
    )
    expect(garageFieldsProblem({ ...ok, pincode: '6000' })).toBe('Pincode must be 6 digits (Location)')
    expect(garageFieldsProblem({ ...ok, businessName: ' ', city: '' })).toBe(
      'Add the business name (Details)'
    )
  })
})

describe('booking mode', () => {
  test('the two switches as one choice, and back', () => {
    expect(bookingModeOf(true, false)).toBe('garage')
    expect(bookingModeOf(false, true)).toBe('doorstep')
    expect(bookingModeOf(true, true)).toBe('both')
    expect(bookingModeOf(false, false)).toBeNull()
    expect(bookingModeFlags('garage')).toEqual({ dropinEnabled: true, doorstepEnabled: false })
    expect(bookingModeFlags('doorstep')).toEqual({ dropinEnabled: false, doorstepEnabled: true })
    expect(bookingModeFlags('both')).toEqual({ dropinEnabled: true, doorstepEnabled: true })
  })

  test('the status line', () => {
    expect(bookingReachLine('both', 8)).toBe('At the garage · Doorstep within 8 km')
    expect(bookingReachLine('doorstep', null)).toBe('Doorstep within 10 km (default)')
    expect(bookingReachLine('garage', 8)).toBe('At the garage')
    expect(bookingReachLine(null, 8)).toBeNull()
  })

  test('a drawn doorstep area is what covers customers, not the radius', () => {
    expect(bookingReachLine('both', 8, { drawnArea: true })).toBe(
      'At the garage · Doorstep within the area the garage drew'
    )
    expect(bookingReachLine('doorstep', null, { drawnArea: true })).toBe(
      'Doorstep within the area the garage drew'
    )
    expect(bookingReachLine('garage', null, { drawnArea: true })).toBe('At the garage')
  })

  test('the travel radius: empty is the default, else 1 to 30 km as the garage app takes it', () => {
    expect(parseRadiusInput('')).toEqual({ ok: true, km: null })
    expect(parseRadiusInput(' 8 ')).toEqual({ ok: true, km: 8 })
    expect(parseRadiusInput('30')).toEqual({ ok: true, km: 30 })
    // The garage app's onboarding takes decimals, so a 7.5 it saved is fine.
    expect(parseRadiusInput('7.5')).toEqual({ ok: true, km: 7.5 })
    expect(parseRadiusInput('31')).toEqual({
      ok: false,
      message: 'Enter a distance from 1 to 30 km, or leave it empty.',
    })
    for (const bad of ['0', '0.5', '31', '30.1', 'ten', '-3', 'Infinity']) {
      expect(parseRadiusInput(bad).ok).toBe(false)
    }
  })
})

describe('customerGarageUrl', () => {
  test("the garage's page on the customer site", () => {
    expect(customerGarageUrl('v-1', 'https://detlio.com/')).toBe(
      'https://detlio.com/garage/v-1'
    )
    expect(customerGarageUrl('v-1', 'http://localhost:3000')).toBe(
      'http://localhost:3000/garage/v-1'
    )
  })
})
