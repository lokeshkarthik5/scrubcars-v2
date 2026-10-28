import type { Context } from 'hono'
import type { AuthVariables } from '../../middleware/auth.middleware.js'
import { garageBoardService } from './garage-board.service.js'
import type {
  SetColourNamesInput,
  SetColourTagsInput,
  SetGarageTargetInput,
} from './garage-board.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function settings(c: AdminContext) {
  return c.json({ success: true, data: await garageBoardService.settings() })
}

export async function setTarget(c: AdminContext, input: SetGarageTargetInput) {
  return c.json({ success: true, data: await garageBoardService.setTarget(input) })
}

export async function setColourNames(c: AdminContext, input: SetColourNamesInput) {
  return c.json({ success: true, data: await garageBoardService.setColourNames(input) })
}

export async function setColourTags(c: AdminContext, input: SetColourTagsInput) {
  return c.json({ success: true, data: await garageBoardService.setColourTags(input) })
}
