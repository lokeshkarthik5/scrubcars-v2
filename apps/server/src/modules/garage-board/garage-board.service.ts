import { AppError } from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { parseColourNames, parseGarageTarget } from '../../lib/admin-settings.js'
import { garageBoardRepository } from './garage-board.repository.js'
import type {
  SetColourNamesInput,
  SetColourTagsInput,
  SetGarageTargetInput,
} from './garage-board.validation.js'

const log = logger.child({ module: 'garage-board' })

/**
 * The Garages page's own settings and colours (0061, mockup garages-list):
 * the onboarding target and the colour tags' names, kept team-wide in
 * `admin_settings`, and the colour the team gives each garage.
 */
export const garageBoardService = {
  /** The target and the colour names, each with who set it last (null: never set). */
  async settings() {
    const rows = await garageBoardRepository.listSettings(['garage_target', 'colour_names'])
    const byKey = new Map(rows.map((row) => [row.key, row]))
    const target = byKey.get('garage_target')
    const names = byKey.get('colour_names')
    return {
      target: {
        ...parseGarageTarget(target?.value),
        updatedBy: target?.updatedByName ?? null,
        updatedAt: target?.updatedAt.toISOString() ?? null,
      },
      colourNames: {
        ...parseColourNames(names?.value),
        updatedBy: names?.updatedByName ?? null,
        updatedAt: names?.updatedAt.toISOString() ?? null,
      },
    }
  },

  async setTarget(input: SetGarageTargetInput, now = new Date()) {
    await garageBoardRepository.saveSetting(
      'garage_target',
      { target: input.target, endsOn: input.endsOn, counts: input.counts },
      input.actorName,
      now
    )
    log.info({ target: input.target, endsOn: input.endsOn, counts: input.counts }, 'garage_board:target_set')
    return this.settings()
  },

  async setColourNames(input: SetColourNamesInput, now = new Date()) {
    await garageBoardRepository.saveSetting(
      'colour_names',
      { green: input.green, amber: input.amber, red: input.red, blue: input.blue },
      input.actorName,
      now
    )
    log.info('garage_board:colour_names_set')
    return this.settings()
  },

  /**
   * One colour (or none) on every garage named, signed with who and when.
   * Every garage must exist and be out of the Bin, or none is changed.
   */
  async setColourTags(input: SetColourTagsInput, now = new Date()) {
    const ids = [...new Set(input.vendorIds)]
    const garages = await garageBoardRepository.findGarages(ids)
    const found = new Map(garages.map((garage) => [garage.id, garage]))
    for (const id of ids) {
      const garage = found.get(id)
      if (!garage || garage.purgedAt) {
        throw new AppError(404, 'Vendor not found', 'VENDOR_NOT_FOUND')
      }
      if (garage.deletedAt) {
        throw new AppError(
          409,
          'A garage you picked is in the Bin. Restore it to change it, or leave it out.',
          'VENDOR_IN_BIN'
        )
      }
    }
    const rows = await garageBoardRepository.setColourTags(ids, {
      colourTag: input.tag,
      colourTagCallOn: input.tag === 'blue' ? (input.callOn ?? null) : null,
      // Cleared with the colour: "who set it" is about a colour that is there.
      colourTagSetBy: input.tag ? input.actorName : null,
      colourTagSetAt: input.tag ? now : null,
    })
    log.info({ garages: rows.length, tag: input.tag }, 'garage_board:colour_set')
    return {
      garages: rows.map((row) => ({
        id: row.id,
        colourTag: row.colourTag,
        colourTagCallOn: row.colourTagCallOn,
        colourTagSetBy: row.colourTagSetBy,
        colourTagSetAt: row.colourTagSetAt?.toISOString() ?? null,
      })),
    }
  },
}
