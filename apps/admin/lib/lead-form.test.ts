import { expect, test } from 'bun:test'
import { garageInitialFromLead } from './garage-form'
import {
  duplicateLine,
  leadOwnFieldsToSave,
  mapsLinkProblem,
  phoneProblem,
  showsGoogleDetails,
} from './lead-form'
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

// A lead found on Google: its name and phone are Google's, none the team's.
const googleLead = {
  name: 'Aqua Foam Car Spa',
  ownName: null,
  phone: '9790060193',
  ownPhone: null,
}
// A lead whose name the team confirmed; its phone is still Google's.
const halfOwn = { ...googleLead, ownName: 'Aqua Foam Car Spa' }
const teamLead = {
  name: 'Speed Wash',
  ownName: 'Speed Wash',
  phone: '9000004401',
  ownPhone: '9000004401',
}

test('Edit lead offers “Confirmed by phone” only while something shown is Google’s', () => {
  expect(showsGoogleDetails(googleLead)).toBe(true)
  expect(showsGoogleDetails(halfOwn)).toBe(true)
  expect(showsGoogleDetails(teamLead)).toBe(false)
  // No phone at all: nothing of Google's to confirm there.
  expect(showsGoogleDetails({ ...halfOwn, phone: null, ownPhone: null })).toBe(
    false
  )
})

test('saving a Google lead unchanged and unticked keeps Google’s name and phone apart', () => {
  expect(
    leadOwnFieldsToSave(googleLead, {
      name: googleLead.name,
      phone: googleLead.phone,
      confirmed: false,
    })
  ).toEqual({})
  // Spaces around the name are not a change.
  expect(
    leadOwnFieldsToSave(googleLead, {
      name: `  ${googleLead.name} `,
      phone: googleLead.phone,
      confirmed: false,
    })
  ).toEqual({})
})

test('“Confirmed by phone” makes what is shown the team’s own', () => {
  expect(
    leadOwnFieldsToSave(googleLead, {
      name: googleLead.name,
      phone: googleLead.phone,
      confirmed: true,
    })
  ).toEqual({ name: 'Aqua Foam Car Spa', phone: '9790060193' })
  // Only what is still Google's: the confirmed name is not sent again.
  expect(
    leadOwnFieldsToSave(halfOwn, {
      name: halfOwn.name,
      phone: halfOwn.phone,
      confirmed: true,
    })
  ).toEqual({ phone: '9790060193' })
})

test('an edit is the team’s own, the field edited only', () => {
  expect(
    leadOwnFieldsToSave(googleLead, {
      name: 'Aqua Foam',
      phone: googleLead.phone,
      confirmed: false,
    })
  ).toEqual({ name: 'Aqua Foam' })
  expect(
    leadOwnFieldsToSave(googleLead, {
      name: googleLead.name,
      phone: '9000005070',
      confirmed: false,
    })
  ).toEqual({ phone: '9000005070' })
  // Clearing Google's phone keeps no phone of ours.
  expect(
    leadOwnFieldsToSave(googleLead, {
      name: googleLead.name,
      phone: null,
      confirmed: false,
    })
  ).toEqual({ phone: null })
})

test('a team lead: only what changed', () => {
  expect(
    leadOwnFieldsToSave(teamLead, {
      name: 'Speed Wash',
      phone: '9000004401',
      confirmed: false,
    })
  ).toEqual({})
  expect(
    leadOwnFieldsToSave(teamLead, {
      name: 'Speed Wash Studio',
      phone: '9000004401',
      confirmed: true,
    })
  ).toEqual({ name: 'Speed Wash Studio' })
})
