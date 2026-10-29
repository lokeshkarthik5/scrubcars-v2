import type { Context } from 'hono'
import {
  signedInAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import { collectionListsService } from './collection-lists.service.js'
import type {
  CreateCollectionListsInput,
  ListCollectionListsQuery,
  UpdateCollectionItemInput,
} from './collection-lists.validation.js'

type AdminContext = Context<{ Variables: AuthVariables }>

export async function create(
  c: AdminContext,
  input: CreateCollectionListsInput
) {
  const data = await collectionListsService.create(input)
  return c.json({ success: true, data }, 201)
}

export async function list(c: AdminContext, query: ListCollectionListsQuery) {
  const data = await collectionListsService.list(signedInAdmin(c), query)
  return c.json({ success: true, data })
}

export async function updateItem(
  c: AdminContext,
  id: string,
  input: UpdateCollectionItemInput
) {
  const data = await collectionListsService.updateItem(id, input)
  return c.json({ success: true, data })
}

export async function close(c: AdminContext, id: string) {
  const data = await collectionListsService.close(id)
  return c.json({ success: true, data })
}

export async function reopen(c: AdminContext, id: string) {
  const actor = signedInAdmin(c)
  const data = await collectionListsService.reopen(id, { sub: c.get('auth').sub, name: actor.name })
  return c.json({ success: true, data })
}

export async function remove(c: AdminContext, id: string) {
  const actor = signedInAdmin(c)
  const data = await collectionListsService.remove(id, { sub: c.get('auth').sub, name: actor.name })
  return c.json({ success: true, data })
}
