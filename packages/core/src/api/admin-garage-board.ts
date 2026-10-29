import { apiClient } from '@repo/core/api/client'
import type { ColourNames, ColourTag, GarageTarget } from '@repo/core/garage-target'
import { signedBody } from './admin-signer'

/**
 * The Garages page's target counter and colour tags (0064): team-wide
 * settings and each garage's colour. Super-admin only. New with this
 * release, so the panel reads a 404 as "not there yet" and shows the
 * defaults.
 */

export interface GarageBoardSettings {
  target: GarageTarget & { updatedBy: string | null; updatedAt: string | null }
  colourNames: ColourNames & { updatedBy: string | null; updatedAt: string | null }
}

export interface ColourTagChange {
  id: string
  colourTag: ColourTag | null
  colourTagCallOn: string | null
  colourTagSetBy: string | null
  colourTagSetAt: string | null
}

/** GET /admin/garage-board/settings */
export async function getGarageBoardSettings() {
  return apiClient<GarageBoardSettings>('/admin/garage-board/settings')
}

/** PUT /admin/garage-board/target — for the whole team. */
export async function setGarageTarget(input: GarageTarget) {
  return apiClient<GarageBoardSettings>('/admin/garage-board/target', {
    method: 'PUT',
    body: signedBody(input),
  })
}

/** PUT /admin/garage-board/colour-names — for the whole team. */
export async function setColourNames(input: ColourNames) {
  return apiClient<GarageBoardSettings>('/admin/garage-board/colour-names', {
    method: 'PUT',
    body: signedBody(input),
  })
}

/**
 * POST /admin/garage-board/colour-tags — one colour (null: none) on one
 * garage or several. `callOn` only with blue. 409 VENDOR_IN_BIN when one of
 * them is in the Bin, and then none is changed.
 */
export async function setColourTags(input: { vendorIds: string[]; tag: ColourTag | null; callOn?: string | null }) {
  return apiClient<{ garages: ColourTagChange[] }>('/admin/garage-board/colour-tags', {
    method: 'POST',
    body: signedBody(input),
  })
}
