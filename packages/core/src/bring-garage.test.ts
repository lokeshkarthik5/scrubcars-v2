import { describe, expect, test } from 'bun:test'
import {
  bringGarageCardText,
  bringGarageCardWords,
  bringGarageMessage,
  bringGarageRowLabel,
  bringGarageWhatsAppHref,
  GARAGE_JOIN_URL,
  recommendCreditLine,
  recommendDoneRule,
  recommendDoneRuleText,
  referralAmountLabel,
  signOffName,
  whatsAppNumber,
  whatsAppReady,
} from './bring-garage'

describe('bring your garage: the WhatsApp message', () => {
  test('the approved words, the garage app’s sign-up link, signed with the first name', () => {
    expect(bringGarageMessage('Sri Krishna Car Spa', 'Priya Raman')).toBe(
      [
        'Hi! I’ve recommended Sri Krishna Car Spa on Detlio, the car-care app I use. Customers near you can find your garage there and book a wash or a service.',
        '',
        'Have a look and join here:',
        'https://vendor.detlio.com/login',
        '',
        '– Priya',
      ].join('\n')
    )
    expect(GARAGE_JOIN_URL).toBe('https://vendor.detlio.com/login')
  })

  test('no name to sign with: no sign-off', () => {
    expect(bringGarageMessage('Glossy', null).endsWith(GARAGE_JOIN_URL)).toBe(true)
    expect(signOffName('  ')).toBeNull()
    expect(signOffName('A')).toBeNull()
    expect(signOffName(' Arun  Kumar ')).toBe('Arun')
  })

  test('their number: ten digits of an Indian mobile, however typed', () => {
    expect(whatsAppNumber('98401 23456')).toBe('9840123456')
    expect(whatsAppNumber('+91 98401 23456')).toBe('9840123456')
    expect(whatsAppNumber('09840123456')).toBe('9840123456')
    expect(whatsAppNumber('044 2490 1234')).toBeNull()
    expect(whatsAppNumber('12345')).toBeNull()
  })

  test('wa.me with +91 and the message filled in; nothing for a number WhatsApp can’t open', () => {
    const message = bringGarageMessage('Glossy', 'Priya')
    expect(bringGarageWhatsAppHref('98401 23456', message)).toBe(`https://wa.me/919840123456?text=${encodeURIComponent(message)}`)
    expect(bringGarageWhatsAppHref('044 2490 1234', message)).toBeNull()
  })

  test('ready with a name and a mobile', () => {
    expect(whatsAppReady('Glossy', '9840123456')).toBe(true)
    expect(whatsAppReady('G', '9840123456')).toBe(false)
    expect(whatsAppReady('Glossy', '98401')).toBe(false)
  })
})

describe('bring your garage: the words', () => {
  test('₹500, no “up to” (no cap per customer)', () => {
    expect(referralAmountLabel()).toBe('₹500')
    expect(bringGarageCardWords()).toEqual({
      title: 'Know a good garage? Bring it to Detlio',
      body: 'Get {amount} when they join and you book them',
      action: 'Recommend a garage',
    })
    expect(bringGarageCardText()).toBe('Get ₹500 when they join and you book them')
    expect(recommendCreditLine()).toBe('₹500 Detlio credit if they join and you book them.')
    expect(bringGarageRowLabel()).toBe('Bring your garage · Get ₹500')
    expect(recommendDoneRule()).toContain('{amount}')
    expect(recommendDoneRuleText()).toBe('You get ₹500 Detlio credit once they join and you finish a paid booking with them.')
    for (const words of [recommendCreditLine(), recommendDoneRuleText(), bringGarageCardText()]) {
      expect(words).not.toContain('up to')
    }
  })
})
