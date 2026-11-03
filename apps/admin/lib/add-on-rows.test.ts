import { describe, expect, test } from 'bun:test'
import { addOnInputFrom, addOnRowFrom, type AddOnRow } from './add-on-rows'
import { lineName } from './bookings'

const row: AddOnRow = {
  key: 'k',
  id: null,
  name: ' Helmet wash ',
  extraMins: '10',
  hatch: '99',
  sedan: '99',
  suv: '99',
  isActive: true,
}

describe('an add-on row in the garage editor', () => {
  test('three equal prices are one flat price', () => {
    expect(addOnInputFrom(row)).toEqual({
      name: 'Helmet wash',
      pricingType: 'flat',
      price: 99,
      extraMins: 10,
      isActive: true,
    })
  })

  test('different prices are per vehicle', () => {
    expect(addOnInputFrom({ ...row, sedan: '120', suv: '150' })).toMatchObject({
      pricingType: 'per_vehicle',
      priceHatchback: 99,
      priceSedan: 120,
      priceSuv: 150,
    })
  })

  test('blank minutes is none, and a row missing a price or name is not ready', () => {
    expect(addOnInputFrom({ ...row, extraMins: '' })?.extraMins).toBeNull()
    expect(addOnInputFrom({ ...row, suv: '' })).toBeNull()
    expect(addOnInputFrom({ ...row, name: '  ' })).toBeNull()
    expect(addOnInputFrom({ ...row, extraMins: '481' })).toBeNull()
  })

  test('a flat add-on reads back as the same price in each column, and no minutes as blank', () => {
    const read = addOnRowFrom({
      id: 'a',
      name: 'Air freshener',
      pricingType: 'flat',
      price: 49,
      priceHatchback: null,
      priceSedan: null,
      priceSuv: null,
      extraMins: 0,
      isActive: true,
    })
    expect([read.hatch, read.sedan, read.suv, read.extraMins]).toEqual([
      '49',
      '49',
      '49',
      '',
    ])
  })
})

describe('a line in the bookings CSV', () => {
  test('an add-on is marked in words', () => {
    expect(lineName({ name: 'Foam wash' })).toBe('Foam wash')
    expect(lineName({ name: 'Helmet wash', isAddon: true })).toBe(
      'Helmet wash (add-on)'
    )
  })
})
