import { describe, expect, test } from 'bun:test'
import { atGarageAddressMissing, atGarageAddressRefused, garageAddressLine, isPincode } from './garage-address.js'

describe('the address only at-garage needs', () => {
  test('a doorstep-only garage needs no address or pincode', () => {
    expect(atGarageAddressMissing({ dropinEnabled: false, address: '', pincode: '' })).toBe(false)
  })

  test('an at-garage garage needs an address and a 6-digit pincode', () => {
    expect(atGarageAddressMissing({ dropinEnabled: true, address: '  ', pincode: '600020' })).toBe(true)
    expect(atGarageAddressMissing({ dropinEnabled: true, address: '1, Main Rd', pincode: '' })).toBe(true)
    expect(atGarageAddressMissing({ dropinEnabled: true, address: '1, Main Rd', pincode: '60002' })).toBe(true)
    expect(atGarageAddressMissing({ dropinEnabled: true, address: '1, Main Rd', pincode: ' 600020 ' })).toBe(false)
    expect(isPincode('6000201')).toBe(false)
    expect(isPincode(null)).toBe(false)
  })

  test('a change is refused only when it touches at-garage or the address and leaves one missing', () => {
    const doorstep = { dropinEnabled: false, address: '', pincode: '' }
    const old = { dropinEnabled: true, address: '1, Main Rd', pincode: '' }
    // Turning at-garage on with no address.
    expect(atGarageAddressRefused(doorstep, { dropinEnabled: true })).toBe(true)
    // Clearing the address of an at-garage one.
    expect(atGarageAddressRefused({ ...old, pincode: '600020' }, { address: '' })).toBe(true)
    // A change to something else: never refused here (its checklist says it).
    expect(atGarageAddressRefused(old, {})).toBe(false)
    // Filling both in, or switching to doorstep only.
    expect(atGarageAddressRefused(old, { pincode: '600020' })).toBe(false)
    expect(atGarageAddressRefused(old, { dropinEnabled: false, address: '', pincode: '' })).toBe(false)
  })
})

describe('the address as one line', () => {
  test('street and city, the city once, and the city alone with no street', () => {
    expect(garageAddressLine({ address: '12, Main Road', city: 'Chennai' })).toBe('12, Main Road, Chennai')
    expect(garageAddressLine({ address: '12, Main Road, Chennai 600020', city: 'Chennai' })).toBe(
      '12, Main Road, Chennai 600020'
    )
    expect(garageAddressLine({ address: '', city: 'Chennai' })).toBe('Chennai')
    expect(garageAddressLine({ address: '  ', city: ' ' })).toBe('')
    expect(garageAddressLine({ address: '12, Main Road', city: null })).toBe('12, Main Road')
  })
})
