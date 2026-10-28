import { describe, expect, test } from 'bun:test'
import { AGREEMENT_MAX_BYTES, agreementBannerLine, agreementTitle, pickedAgreementProblem } from './agreements'

describe('the garage agreement in the apps', () => {
  test('its title carries the version', () => {
    expect(agreementTitle(3)).toBe('Detlio garage agreement v3')
  })

  test('only a PDF up to 10 MB can be picked', () => {
    expect(pickedAgreementProblem({ type: 'application/pdf', size: 1000 })).toBeNull()
    expect(pickedAgreementProblem({ type: 'image/png', size: 1000 })).toBe('Pick a PDF.')
    expect(pickedAgreementProblem({ type: 'application/pdf', size: 0 })).toBe('That file is empty.')
    expect(pickedAgreementProblem({ type: 'application/pdf', size: AGREEMENT_MAX_BYTES + 1 })).toBe(
      'The PDF can be up to 10 MB.'
    )
  })

  test("Home's banner: a new version with its day, never accepted, or nothing", () => {
    expect(agreementBannerLine({ status: 'grace', latestVersion: 2, acceptBy: '2026-12-01' })).toBe(
      'Detlio has updated the garage agreement (v2). Accept it by 1 Dec 2026 to keep your tier.'
    )
    expect(agreementBannerLine({ status: 'not_accepted', latestVersion: 1, acceptBy: null })).toBe(
      'Accept the Detlio garage agreement v1 to earn Bronze and show customers you are with Detlio.'
    )
    expect(agreementBannerLine({ status: 'accepted', latestVersion: 1, acceptBy: null })).toBeNull()
    expect(agreementBannerLine({ status: 'not_published', latestVersion: null, acceptBy: null })).toBeNull()
  })
})
