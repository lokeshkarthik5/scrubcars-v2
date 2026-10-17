import { describe, expect, test } from 'bun:test'
import {
  EMPTY_GARAGE_TEXT,
  isRequiredField,
  missingForCreate,
  requiredFieldFilled,
  type GarageFormText,
} from './garage-form'
import { emptyServiceRow } from './service-editor'

// What Create waits for, by hand or from an import: the same required
// fields as the API's createVendorSchema and the edit page.

const READY: GarageFormText = {
  ...EMPTY_GARAGE_TEXT,
  ownerName: 'Senthil Kumar',
  ownerPhone: '9876543210',
  businessName: 'Sparkle Auto Spa',
  phone: '9876543211',
  address: '5, Lake Road',
  city: 'Chennai',
  pincode: '600040',
}

describe('required fields', () => {
  test('the seven Create needs; the rest are optional', () => {
    for (const key of ['ownerName', 'ownerPhone', 'businessName', 'phone', 'address', 'city', 'pincode']) {
      expect(isRequiredField(key)).toBe(true)
    }
    for (const key of ['email', 'whatsapp', 'yearsInOperation', 'mapsUrl', 'notes']) {
      expect(isRequiredField(key)).toBe(false)
    }
  })

  test('phones and the pincode count only once they are the right length', () => {
    expect(requiredFieldFilled('ownerPhone', { ...READY, ownerPhone: '98765 4321' })).toBe(false)
    expect(requiredFieldFilled('ownerPhone', { ...READY, ownerPhone: ' 9876543210 ' })).toBe(true)
    expect(requiredFieldFilled('pincode', { ...READY, pincode: '6000' })).toBe(false)
    expect(requiredFieldFilled('ownerName', { ...READY, ownerName: '   ' })).toBe(false)
    // An optional field is never what holds Create.
    expect(requiredFieldFilled('email', READY)).toBe(true)
  })
})

describe('missingForCreate', () => {
  test('each empty required field, and each service row without its price', () => {
    expect(missingForCreate(READY, [])).toBe(0)
    expect(missingForCreate(EMPTY_GARAGE_TEXT, [])).toBe(7)

    const priced = { ...emptyServiceRow(), name: 'Foam wash', pricingType: 'flat' as const, price: '399' }
    const unpriced = { ...emptyServiceRow(), name: 'Interior cleaning', pricingType: 'on_inspection' as const }
    const halfTiered = {
      ...emptyServiceRow(),
      name: 'Full wash',
      pricingType: 'per_vehicle' as const,
      priceHatchback: '499',
      priceSedan: '',
      priceSuv: '649',
    }
    // A row counts once, however many of its prices are missing.
    expect(missingForCreate(READY, [priced, unpriced, halfTiered])).toBe(2)
    // A row nobody has typed into is not waited for.
    expect(missingForCreate(READY, [emptyServiceRow()])).toBe(0)
  })
})
