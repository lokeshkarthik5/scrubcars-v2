import { describe, expect, test } from 'bun:test'
import {
  commissionRateValue,
  isUntouchedNewRow,
  missingServiceFields,
  rowsToSave,
  serviceRowProblem,
  servicesSaveBlock,
  showAgainWarning,
  storedPriceSummary,
  switchPricingType,
  type ServiceRowFields,
} from './service-rows'

const row = (patch: Partial<ServiceRowFields> = {}): ServiceRowFields => ({
  name: 'Foam wash',
  description: '',
  pricingType: 'flat',
  price: '450',
  priceHatchback: '',
  priceSedan: '',
  priceSuv: '',
  durationValue: '',
  ...patch,
})

const perVehicle = (patch: Partial<ServiceRowFields> = {}) =>
  row({
    pricingType: 'per_vehicle',
    price: '',
    priceHatchback: '600',
    priceSedan: '700',
    priceSuv: '900',
    ...patch,
  })

describe('serviceRowProblem', () => {
  test('a complete row has nothing to say', () => {
    expect(serviceRowProblem(row())).toBeNull()
    expect(serviceRowProblem(perVehicle())).toBeNull()
    expect(serviceRowProblem(row({ pricingType: 'on_inspection', price: '299' }))).toBeNull()
  })

  test('names the one tier a per-vehicle row is missing', () => {
    expect(serviceRowProblem(perVehicle({ priceSuv: '' }))).toBe('Add the SUV price')
    expect(serviceRowProblem(perVehicle({ priceHatchback: '0' }))).toBe(
      'Add the hatchback price'
    )
  })

  test('names several missing tiers together', () => {
    expect(serviceRowProblem(perVehicle({ priceHatchback: '', priceSuv: '' }))).toBe(
      'Add the hatchback and SUV prices'
    )
    expect(
      serviceRowProblem(perVehicle({ priceHatchback: '', priceSedan: '', priceSuv: '' }))
    ).toBe('Add the hatchback, sedan and SUV prices')
  })

  test('a flat row and an inspection row need their one price', () => {
    expect(serviceRowProblem(row({ price: '' }))).toBe('Add the price')
    expect(serviceRowProblem(row({ pricingType: 'on_inspection', price: '' }))).toBe(
      'Add the inspection fee'
    )
  })

  test('a row with a price but no name needs a name', () => {
    expect(serviceRowProblem(row({ name: '   ' }))).toBe('Add a name')
    expect(
      serviceRowProblem(row({ name: '', price: '', description: 'Snow foam, hand dry' }))
    ).toBe('Add a name and the price')
  })

  test('a saved service with its name cleared is flagged, not dropped', () => {
    expect(serviceRowProblem(row({ id: 'svc-1', name: '', price: '' }))).toBe(
      'Add a name and the price'
    )
  })

  test('an empty card just added says nothing', () => {
    const blank = row({ name: '', price: '' })
    expect(isUntouchedNewRow(blank)).toBe(true)
    expect(serviceRowProblem(blank)).toBeNull()
    expect(missingServiceFields(blank)).toEqual([])
  })

  test('a new card with only a duration typed is no longer untouched', () => {
    expect(serviceRowProblem(row({ name: '', price: '', durationValue: '45' }))).toBe(
      'Add a name and the price'
    )
  })
})

describe('servicesSaveBlock', () => {
  test('nothing to block when every row is ready', () => {
    expect(servicesSaveBlock([row(), perVehicle()])).toBeNull()
    expect(servicesSaveBlock([])).toBeNull()
  })

  test('counts the rows that need a price', () => {
    expect(servicesSaveBlock([perVehicle({ priceSuv: '' })])).toBe(
      '1 service needs a price'
    )
    expect(
      servicesSaveBlock([perVehicle({ priceSuv: '' }), row({ price: '' }), row()])
    ).toBe('2 services need a price')
  })

  test('says a name, or a name or price, when that is what is missing', () => {
    expect(servicesSaveBlock([row({ name: '' })])).toBe('1 service needs a name')
    expect(servicesSaveBlock([row({ name: '' }), row({ price: '' })])).toBe(
      '2 services need a name or price'
    )
  })

  test('an empty card just added never blocks a save', () => {
    expect(servicesSaveBlock([row(), row({ name: '', price: '' })])).toBeNull()
  })
})

describe('rowsToSave', () => {
  test('keeps every row that was typed into and leaves out empty new cards', () => {
    const saved = row({ id: 'svc-1' })
    const added = row({ name: 'Interior clean' })
    const blank = row({ name: '', price: '' })
    expect(rowsToSave([saved, blank, added])).toEqual([saved, added])
  })
})

describe('switchPricingType', () => {
  test('Flat to Per vehicle fills every tier with the flat price', () => {
    expect(switchPricingType(row({ price: '450' }), 'per_vehicle')).toEqual({
      pricingType: 'per_vehicle',
      priceHatchback: '450',
      priceSedan: '450',
      priceSuv: '450',
    })
  })

  test('tiers the row already has are kept', () => {
    expect(
      switchPricingType(row({ price: '450', priceSuv: '800' }), 'per_vehicle')
    ).toEqual({
      pricingType: 'per_vehicle',
      priceHatchback: '450',
      priceSedan: '450',
      priceSuv: '800',
    })
  })

  test('with no flat price there is nothing to copy', () => {
    expect(switchPricingType(row({ price: '' }), 'per_vehicle')).toEqual({
      pricingType: 'per_vehicle',
    })
  })

  test('Per vehicle to Flat uses the cheapest tier', () => {
    expect(switchPricingType(perVehicle(), 'flat')).toEqual({
      pricingType: 'flat',
      price: '600',
    })
    expect(switchPricingType(perVehicle({ priceHatchback: '' }), 'flat')).toEqual({
      pricingType: 'flat',
      price: '700',
    })
  })

  test('an inspection fee is never copied into the tiers, nor the tiers into a fee', () => {
    expect(
      switchPricingType(row({ pricingType: 'on_inspection', price: '299' }), 'per_vehicle')
    ).toEqual({ pricingType: 'per_vehicle' })
    expect(switchPricingType(perVehicle(), 'on_inspection')).toEqual({
      pricingType: 'on_inspection',
    })
  })

  test('picking the same type changes nothing', () => {
    expect(switchPricingType(row(), 'flat')).toEqual({})
  })
})

describe('storedPriceSummary', () => {
  const stored = {
    pricingType: 'per_vehicle' as const,
    price: '600.00',
    priceHatchback: '600.00',
    priceSedan: '700.00',
    priceSuv: '900.00',
  }

  test('one line per pricing type', () => {
    expect(storedPriceSummary({ ...stored, pricingType: 'flat', price: '450.00' })).toBe('₹450')
    expect(
      storedPriceSummary({ ...stored, pricingType: 'on_inspection', price: '299.00' })
    ).toBe('₹299 inspection fee')
    expect(storedPriceSummary(stored)).toBe('₹600–₹900 by car size')
    expect(
      storedPriceSummary({ ...stored, priceSedan: '600.00', priceSuv: '600.00' })
    ).toBe('₹600 by car size')
  })

  test('names the sizes with no price', () => {
    expect(storedPriceSummary({ ...stored, priceSuv: null })).toBe(
      '₹600–₹700 by car size · no SUV price'
    )
    expect(storedPriceSummary({ ...stored, priceSedan: null, priceSuv: null })).toBe(
      '₹600 by car size · no sedan and SUV prices'
    )
    expect(
      storedPriceSummary({
        ...stored,
        priceHatchback: null,
        priceSedan: null,
        priceSuv: null,
      })
    ).toBe('No prices set')
  })
})

describe('showAgainWarning', () => {
  const stored = {
    pricingType: 'per_vehicle' as const,
    price: '600.00',
    priceHatchback: '600.00',
    priceSedan: '700.00',
    priceSuv: '900.00',
  }

  test('nothing to say when every size can book it', () => {
    expect(showAgainWarning(stored)).toBeNull()
    expect(showAgainWarning({ ...stored, pricingType: 'flat', price: '450.00' })).toBeNull()
    expect(
      showAgainWarning({ ...stored, pricingType: 'on_inspection', price: '299.00' })
    ).toBeNull()
  })

  test('names who could not book it', () => {
    expect(showAgainWarning({ ...stored, priceSuv: null })).toBe(
      "SUV customers can't book this until it has an SUV price."
    )
    expect(showAgainWarning({ ...stored, priceHatchback: '0.00' })).toBe(
      "Hatchback customers can't book this until it has a hatchback price."
    )
    expect(showAgainWarning({ ...stored, priceSedan: null, priceSuv: null })).toBe(
      "Sedan and SUV customers can't book this until it has those prices."
    )
    expect(
      showAgainWarning({ ...stored, priceHatchback: null, priceSedan: null, priceSuv: null })
    ).toBe('No one can book this until it has a price for each car size.')
  })
})

describe('a service’s own commission (0064)', () => {
  test('empty is the category rate; 0 to 50 with two decimals is taken; % is forgiven', () => {
    expect(commissionRateValue('')).toBeNull()
    expect(commissionRateValue('  ')).toBeNull()
    expect(commissionRateValue('6')).toBe(6)
    expect(commissionRateValue('6.5%')).toBe(6.5)
    expect(commissionRateValue('0')).toBe(0)
    expect(commissionRateValue('50')).toBe(50)
    expect(commissionRateValue('50.5')).toBeUndefined()
    expect(commissionRateValue('6.555')).toBeUndefined()
    expect(commissionRateValue('-1')).toBeUndefined()
    expect(commissionRateValue('abc')).toBeUndefined()
  })

  test('a row with a bad percent cannot be saved, and says why', () => {
    const bad = row({ commissionRate: '60' })
    expect(missingServiceFields(bad)).toEqual(['commissionRate'])
    expect(serviceRowProblem(bad)).toBe('Commission must be a percent from 0 to 50, or empty')
    expect(servicesSaveBlock([bad])).toBe('1 service needs its commission fixed')
    expect(serviceRowProblem(row({ name: '', commissionRate: '60' }))).toBe(
      'Add a name, and fix the commission (0 to 50%)'
    )
    expect(missingServiceFields(row({ commissionRate: '8' }))).toEqual([])
  })

  test('an empty new row with only a percent typed is not untouched', () => {
    expect(
      missingServiceFields(
        row({ id: undefined, name: '', price: '', commissionRate: '5' })
      )
    ).toContain('name')
  })
})
