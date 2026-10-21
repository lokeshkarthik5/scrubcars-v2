import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  authMiddleware,
  requireSuperAdmin,
  type AuthVariables,
} from '../../middleware/auth.middleware.js'
import * as complaintsController from './complaints.controller.js'
import {
  closeComplaintSchema,
  complaintAdminNoteSchema,
  complaintIdParamSchema,
  complaintLookupQuerySchema,
  createComplaintSchema,
  listComplaintsQuerySchema,
  logComplaintSchema,
  resolveComplaintSchema,
} from './complaints.validation.js'

// ─── The customer's ──────────────────────────────────────────────────────────

// A customer's own complaints: POST and GET /users/me/complaints. Mounted at
// /users/me inside the users routes (users.routes.ts), which already require
// a signed-in customer for everything under them; no auth is added a second
// time here. The user is always the session's, never a parameter.
export const customerComplaintRoutes = new Hono<{ Variables: AuthVariables }>()

customerComplaintRoutes.get('/complaints', complaintsController.listMyComplaints)

customerComplaintRoutes.post('/complaints', zValidator('json', createComplaintSchema), (c) =>
  complaintsController.createComplaint(c, c.req.valid('json'))
)

// ─── Admin ───────────────────────────────────────────────────────────────────

// The Complaints tab. Mounted under /api/v1/admin/complaints (see
// admin.routes.ts), like notices: the admin session cookie is scoped to
// path=/api/v1/admin. There is no delete; a complaint is closed, and kept.
export const adminComplaintRoutes = new Hono<{ Variables: AuthVariables }>()

const adminMiddleware = [authMiddleware, requireSuperAdmin] as const

adminComplaintRoutes.get(
  '/',
  ...adminMiddleware,
  zValidator('query', listComplaintsQuerySchema),
  (c) => complaintsController.listComplaints(c, c.req.valid('query'))
)

// Log a complaint that came by phone, WhatsApp, email or in person. Admin
// only: a customer raises theirs at POST /users/me/complaints.
adminComplaintRoutes.post(
  '/',
  ...adminMiddleware,
  zValidator('json', logComplaintSchema),
  (c) => complaintsController.logComplaint(c, c.req.valid('json'))
)

// The log form's look-ups (who has this phone, which booking is this).
// Before '/:id', which would otherwise take 'lookup' for an id.
adminComplaintRoutes.get(
  '/lookup',
  ...adminMiddleware,
  zValidator('query', complaintLookupQuerySchema),
  (c) => complaintsController.lookupForLog(c, c.req.valid('query'))
)

adminComplaintRoutes.get(
  '/:id',
  ...adminMiddleware,
  zValidator('param', complaintIdParamSchema),
  (c) => complaintsController.getComplaint(c, c.req.valid('param').id)
)

adminComplaintRoutes.post(
  '/:id/acknowledge',
  ...adminMiddleware,
  zValidator('param', complaintIdParamSchema),
  (c) => complaintsController.acknowledgeComplaint(c, c.req.valid('param').id)
)

adminComplaintRoutes.post(
  '/:id/resolve',
  ...adminMiddleware,
  zValidator('param', complaintIdParamSchema),
  zValidator('json', resolveComplaintSchema),
  (c) => complaintsController.resolveComplaint(c, c.req.valid('param').id, c.req.valid('json'))
)

adminComplaintRoutes.post(
  '/:id/close',
  ...adminMiddleware,
  zValidator('param', complaintIdParamSchema),
  zValidator('json', closeComplaintSchema),
  (c) => complaintsController.closeComplaint(c, c.req.valid('param').id, c.req.valid('json'))
)

adminComplaintRoutes.put(
  '/:id/note',
  ...adminMiddleware,
  zValidator('param', complaintIdParamSchema),
  zValidator('json', complaintAdminNoteSchema),
  (c) => complaintsController.setComplaintAdminNote(c, c.req.valid('param').id, c.req.valid('json'))
)
