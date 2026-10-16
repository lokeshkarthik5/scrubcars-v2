import { createMiddleware } from 'hono/factory'
import { AppError } from '../lib/errors.js'
import {
  membersRepository,
  type VendorScopedRole,
} from '../modules/members/members.repository.js'
import type { AuthVariables } from './auth.middleware.js'

/**
 * The rule the whole multi-tenancy design rests on:
 *
 *   The active vendorId is produced by this middleware and read from context.
 *   No handler, service or repository ever reads it from a request parameter.
 *
 * Before the company switcher, authorization was *structurally* impossible to
 * get wrong: the vendor was derived from the session, so there was no
 * attacker-controlled input in the resolution path. A selector puts one there
 * and turns every vendor endpoint into an IDOR candidate. This middleware being
 * the only reader of `X-Vendor-Id` is what preserves the original property.
 */
export const VENDOR_ID_HEADER = 'X-Vendor-Id'

/** Set on every response to a request that resolved through a platform grant. */
export const SUPPORT_SESSION_HEADER = 'X-Detlio-Support-Session'

export type TenantContext = {
  vendorId: string
  /**
   * The caller's power *inside this company*. A super_admin resolves to
   * `vendor_admin` here — their own mapping role is platform-scoped and means
   * nothing inside a company.
   */
  role: VendorScopedRole
  /** True when access came from a platform grant rather than a seat. */
  viaSuperAdmin: boolean
}

/**
 * `tenant` is optional in the type because these Hono instances also carry
 * customer and public routes, which never run `resolveTenant`. Handlers read it
 * through `getTenant`, which turns "middleware was not wired up" into a loud
 * 500 rather than a silently undefined vendor id.
 */
export type TenantVariables = AuthVariables & {
  tenant?: TenantContext
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A mapping miss is a 404, never a 403. A 403 confirms the company exists and
 * leaks the id space; a 404 says nothing. A suspended row is treated exactly
 * like no row at all.
 */
function notFound(): never {
  throw new AppError(404, 'Vendor profile not found', 'VENDOR_NOT_FOUND')
}

export const resolveTenant = createMiddleware<{ Variables: TenantVariables }>(
  async (c, next) => {
    const auth = c.get('auth')
    const header = c.req.header(VENDOR_ID_HEADER)?.trim()

    // The env-credential break-glass session has no `users` row, so its subject
    // is the literal 'admin' rather than a uuid. It therefore holds no seats and
    // no platform row, and 404 is the honest answer — without this guard the
    // mapping lookups below compare a uuid column against 'admin' and the
    // request dies as a 500 instead.
    if (!UUID_RE.test(auth.sub)) notFound()

    if (!header) {
      // No header. This is what keeps every existing single-garage client
      // working with no change — and it deliberately ignores super_admin rows,
      // because otherwise a Detlio staffer with no seat would silently resolve
      // to an arbitrary company.
      const seats = await membersRepository.listActiveVendorSeats(auth.sub)

      if (seats.length === 0) notFound()

      if (seats.length > 1) {
        throw new AppError(
          400,
          'Multiple companies available — send an X-Vendor-Id header',
          'VENDOR_ID_REQUIRED'
        )
      }

      c.set('tenant', {
        vendorId: seats[0].vendorId!,
        role: seats[0].role as VendorScopedRole,
        viaSuperAdmin: false,
      })
      await next()
      return
    }

    if (!UUID_RE.test(header)) notFound()

    // A vendor-scoped row always wins over super_admin: a Detlio staffer who
    // also owns a garage acts as its vendor_admin there, and that request is
    // not logged as support access.
    const seat = await membersRepository.findActiveVendorSeat(header, auth.sub)

    if (seat) {
      c.set('tenant', {
        vendorId: header,
        role: seat.role as VendorScopedRole,
        viaSuperAdmin: false,
      })
      await next()
      return
    }

    const platformRow = await membersRepository.findActivePlatformRow(auth.sub)

    if (platformRow?.role !== 'super_admin') notFound()

    // The company has to exist and be out of the Bin. A garage in the Bin is
    // closed to everyone but the admin panel, support sessions included, and
    // its team's seats no longer match above, so a staffer who also holds a
    // seat there lands here too. Checked before the audit row, so a refused
    // id leaves no access record for a company nobody entered.
    if (!(await membersRepository.findVendorForSupport(header))) notFound()

    c.set('tenant', {
      vendorId: header,
      // Deliberate, and the widest grant in the system: support sessions act
      // with write access to the garage's prices, services and settings. The
      // only control is the audit row written below.
      role: 'vendor_admin',
      viaSuperAdmin: true,
    })

    // Written here rather than in a handler, so no route can be added that
    // reaches a customer's company without leaving a trace. Logged before the
    // request runs, so one that throws is still recorded.
    await membersRepository.logInternalAccess({
      userId: auth.sub,
      vendorId: header,
      method: c.req.method,
      endpoint: c.req.path,
    })

    // What the portal renders its persistent "Detlio support session" banner
    // from. A header rather than a body field because it has to be true of
    // every response on the request, not of one endpoint's payload.
    c.header(SUPPORT_SESSION_HEADER, 'true')

    await next()
  }
)

/**
 * Role gate for a vendor-scoped route. Default deny: a vendor route with no
 * `requireVendorRole` is vendor_admin-only until someone deliberately widens
 * it, so adding a route can never accidentally expose it to operators.
 */
export function requireVendorRole(...allowed: VendorScopedRole[]) {
  const permitted: VendorScopedRole[] =
    allowed.length > 0 ? allowed : ['vendor_admin']

  return createMiddleware<{ Variables: TenantVariables }>(async (c, next) => {
    const tenant = getTenant(c)

    if (!permitted.includes(tenant.role)) {
      throw new AppError(
        403,
        'You do not have permission to do this',
        'INSUFFICIENT_ROLE'
      )
    }

    await next()
  })
}

/** Reads the tenant a handler must act on. Never accepts a request parameter. */
export function getTenant(c: {
  get: (key: 'tenant') => TenantContext | undefined
}): TenantContext {
  const tenant = c.get('tenant')

  if (!tenant) {
    throw new AppError(
      500,
      'Tenant not resolved for this route',
      'TENANT_NOT_RESOLVED'
    )
  }

  return tenant
}
