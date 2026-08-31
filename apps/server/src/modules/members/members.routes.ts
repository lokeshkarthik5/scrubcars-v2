import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import {
  requireVendorRole,
  resolveTenant,
  type TenantVariables,
} from '../../middleware/tenant.middleware.js'
import * as membersController from './members.controller.js'
import {
  addMemberSchema,
  memberIdParamSchema,
  transferOwnershipSchema,
  updateMemberSchema,
} from './members.validation.js'

export const membersRoutes = new Hono<{ Variables: TenantVariables }>()

// Only vendor_admin reaches member management at all. That is what makes "an
// operator cannot remove an admin" total: an operator gets 403 on every route
// here, so they cannot remove an admin, another operator, or add anyone.
const adminMiddleware = [
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin'),
] as const

// Leaving is the one thing an operator may do here — and the owner may not,
// same rule as removal.
const anyMemberMiddleware = [
  authMiddleware,
  resolveTenant,
  requireVendorRole('vendor_admin', 'vendor_operator'),
] as const

membersRoutes.get('/', ...adminMiddleware, membersController.listMembers)

membersRoutes.post(
  '/',
  ...adminMiddleware,
  zValidator('json', addMemberSchema),
  (c) => membersController.addMember(c, c.req.valid('json'))
)

// Registered before /:id so the literal path wins the match.
membersRoutes.delete('/me', ...anyMemberMiddleware, membersController.leaveCompany)

membersRoutes.post(
  '/transfer-ownership',
  ...adminMiddleware,
  zValidator('json', transferOwnershipSchema),
  (c) => membersController.transferOwnership(c, c.req.valid('json'))
)

membersRoutes.patch(
  '/:id',
  ...adminMiddleware,
  zValidator('param', memberIdParamSchema),
  zValidator('json', updateMemberSchema),
  (c) =>
    membersController.updateMember(
      c,
      c.req.valid('param').id,
      c.req.valid('json')
    )
)

membersRoutes.delete(
  '/:id',
  ...adminMiddleware,
  zValidator('param', memberIdParamSchema),
  (c) => membersController.removeMember(c, c.req.valid('param').id)
)
