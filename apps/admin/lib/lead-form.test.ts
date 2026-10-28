import { expect, test } from 'bun:test'
import { garageInitialFromLead } from './garage-form'
import { duplicateLine, mapsLinkProblem, phoneProblem } from './lead-form'
import { zoneChanges, zoneDraftFrom, zoneDraftProblem } from './zone-editor'

test('a lead’s phone and Maps link', () => {
  expect(phoneProblem('')).toBeNull()
  expect(phoneProblem('+91 98400 12345')).toBeNull()
  expect(phoneProblem('044-2345 6789')).toBeNull()
  expect(phoneProblem('call')).toBe('Enter a phone number, like 98400 12345.')
  expect(mapsLinkProblem('')).toBeNull()
  expect(mapsLinkProblem('https://maps.app.goo.gl/abc')).toBeNull()
  expect(mapsLinkProblem('maps.app.goo.gl/abc')).toBe(
    'Paste a Google Maps link.'
  )
  expect(mapsLinkProblem('ftp://x')).toBe('Paste a Google Maps link.')
})

test('a duplicate in words', () => {
  expect(
    duplicateLine({ kind: 'garage', name: 'SJA Car Care', status: 'live' })
  ).toBe('SJA Car Care — garage, live')
  expect(
    duplicateLine({ kind: 'garage', name: 'Glossy', status: 'not_live' })
  ).toBe('Glossy — garage, not live yet')
  expect(
    duplicateLine({
      kind: 'lead',
      name: 'Speed Wash',
      status: 'not_interested',
    })
  ).toBe('Speed Wash — lead, Not interested')
})

test('Onboard fills Add garage from the lead: name, a 10-digit phone, link, pin, Chennai', () => {
  expect(
    garageInitialFromLead({
      name: 'Car Spa Studio',
      phone: '9790010288',
      mapsUrl: 'https://maps.app.goo.gl/x',
      lat: 13.08,
      lng: 80.21,
    })
  ).toEqual({
    text: {
      businessName: 'Car Spa Studio',
      phone: '9790010288',
      mapsUrl: 'https://maps.app.goo.gl/x',
      city: 'Chennai',
    },
    pin: { lat: 13.08, lng: 80.21 },
  })
  // A number the form can't take (not ten digits) is left for the team; no pin, no pin.
  expect(
    garageInitialFromLead({
      name: 'X',
      phone: '442345678',
      mapsUrl: null,
      lat: null,
      lng: null,
    })
  ).toEqual({
    text: { businessName: 'X', phone: '', mapsUrl: '', city: 'Chennai' },
  })
})

test('Edit zones: problems and only what changed', () => {
  const zone = {
    name: 'Anna Nagar',
    priority: true,
    target: 6,
    lat: 13.085,
    lng: 80.2101,
  }
  const draft = zoneDraftFrom(zone)
  expect(zoneDraftProblem(draft)).toBeNull()
  expect(zoneChanges(zone, draft)).toEqual({})
  expect(zoneDraftProblem({ ...draft, name: 'A' })).toBe(
    'A name of 2 to 60 characters.'
  )
  expect(zoneDraftProblem({ ...draft, name: '--' })).toBe(
    'A name needs letters or numbers.'
  )
  expect(zoneDraftProblem({ ...draft, target: '0' })).toBe(
    'The target is a whole number from 1 to 1000.'
  )
  expect(zoneDraftProblem({ ...draft, target: '2.5' })).toBe(
    'The target is a whole number from 1 to 1000.'
  )
  expect(zoneDraftProblem({ ...draft, lat: '' })).toBe(
    'Type the centre, or pick it on the map.'
  )
  expect(zoneDraftProblem({ ...draft, lng: '200' })).toBe(
    'Type the centre, or pick it on the map.'
  )
  expect(
    zoneChanges(zone, {
      ...draft,
      name: ' Anna  Nagar West ',
      target: '8',
      priority: false,
    })
  ).toEqual({
    name: 'Anna Nagar West',
    target: 8,
    priority: false,
  })
  // The centre moves as a pair.
  expect(zoneChanges(zone, { ...draft, lat: '13.09' })).toEqual({
    lat: 13.09,
    lng: 80.2101,
  })
})
