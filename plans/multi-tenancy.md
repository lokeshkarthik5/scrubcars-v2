# Multi-tenancy — Detlio implementation plan

Status: **all decisions resolved. Ready to build.**

Goal: a garage is a company with a team. It has one owner, some admins, and
some employees. A person can belong to more than one company and switches
between them in-page.

Today the vendor portal is strictly 1:1 — `vendors.owner_id` points at one
`users` row, and every `/vendors/me/*` endpoint resolves the tenant by asking
"who is logged in?" (`findVendorByOwnerId(auth.sub)`). There is no seat
concept and no path for a second person.

## The model

- `vendors` is the company. It keeps `owner_id` — the one person who owns the
  business.
- `vendor_members` is the team: `(vendor_id, user_id, role, status)` where role
  is `admin` or `employee`. It is the single source of truth for both *can this
  person open the vendor app at all* (checked at login) and *what may they do
  in this company* (checked per request).
- The owner is always an active `admin` member, and is the one member nobody
  can remove, demote or suspend (§5).
- Internal Detlio staff get a membership row with `vendor_id = NULL`, meaning
  every company (§10). Same table, same resolver — no impersonation endpoint,
  no separate internal flag.

---

## 0. Gaps in the spec, and what I propose

The spec is clear on the shape. These are the places it did not decide. All
are now resolved. G14 was found while scoping G4 — a finding rather than a gap
in the spec.

### G1 — Can an admin remove or demote the owner? ✅ decided

The spec says an employee cannot remove an admin, but not what admins can do
to each other. If any admin can remove any admin, then an admin can remove the
owner and the business is orphaned.

**Decided:** the owner's membership is immutable — it cannot be removed or
demoted by anyone, including themselves. Admins can add/remove/promote/demote
everyone *except* the owner. Ownership moves only by explicit transfer
(§5), which is owner-only and swaps `vendors.owner_id` in the same
transaction. This makes "at least one admin exists" true by construction
rather than something to enforce with a count query.

### G2 — Hiding earnings from employees ✅ decided: separate endpoint

Earnings moves to its own admin-gated endpoint, and the money-breakdown fields
come off the vendor booking payload entirely.

The reason this works cleanly: **every vendor-side consumer of those fields is
an earnings computation.** `vendorPayoutAmount` is read in exactly four places,
all in `web/lib/vendor-stats.ts` (`:62`, `:94`, `:99`, `:119`) — the earnings
summary, the recent-earnings list, and the home dashboard's week total. And
`subtotalAmount` / `discountAmount` / `discountFundedBy` are read only by
customer screens (`/bookings`, `/bookings/[id]`, `/book/[vendorId]`) and the
platform admin bookings screen, which has its own endpoint and its own types in
`lib/api/admin.ts`. **No vendor screen touches them.**

So once the computation moves server-side, the fields have no vendor-side
consumer left and can simply be absent — no role-conditional response shape, no
role argument threaded through call sites. The role check exists in exactly one
place: the earnings endpoint's middleware.

That is strictly simpler than the role-aware serializer I proposed earlier, and
it is a stronger boundary, because a field that is never serialized cannot be
forgotten about on a new endpoint.

**Second earnings surface, easy to miss:** `/vendor/home` renders a
`weekEarnings` stat tile via `computeVendorDashboardStats`
(`vendor-stats.ts:47-71`), which reduces over `vendorPayoutAmount`. Gating the
Earnings *tab* alone would leave that tile on an employee's landing page. §6
splits it out.

`amount` and `paymentMethod` stay on the vendor payload: a cash booking goes
`pending → collected` at completion, so whoever finishes the job has to know
what to collect.

### G3 — Which job actions does an employee get? ✅ decided

The spec says "accept jobs or cancel jobs". The actual vendor lifecycle is
four endpoints: `accept`, `reject`, `progress`, `complete`
(`bookings.routes.ts`). "Cancel" maps to `reject`.

**Decided:** employees get all four. An employee who can accept a job but
cannot mark it complete cannot do the job. Note that `reschedule` is
`requireCustomer` today — vendors of any role cannot reschedule, which is
existing behaviour this plan does not change.

### G4 — Role name `admin` collides with the platform admin ✅ decided

`users.is_admin` and the `/admin` portal already mean "Detlio staff".
`vendor_members.role = 'admin'` makes "admin" refer to two different things one
grep apart.

**Decided:** `admin` means the garage role. The *platform* side is renamed to
**super admin**, which removes the collision at the type level instead of by
comment discipline.

- JWT claim `isAdmin` → `isSuperAdmin`; middleware `requireAdmin` →
  `requireSuperAdmin`
- `users.is_admin` is **dropped**, not renamed (G14) — so there is no column
  left to disambiguate
- Garage side: Postgres enum `vendor_member_role`, TS type `VendorMemberRole`,
  middleware `requireVendorRole('admin')` — never bare `requireRole`

Cost is 17 references, nearly all plumbing: the `requireAdmin` gate
(`auth.middleware.ts:60`), the claim in `jwt.ts:11,71,88`, the column
(`schema.ts:146`), two response literals (`admin.controller.ts:47,56`),
session/profile copying (`auth.service.ts:43,71,217`,
`users.service.ts:35,71`), and on the web `admin/layout.tsx:32` plus types in
`lib/api/{admin,types}.ts`. Most of the session/profile sites are deletions
rather than renames once G14 lands.

**One deploy caveat.** Renaming a JWT claim breaks in-flight tokens —
`verifyAccessToken` reads `isSuperAdmin`, old tokens carry `isAdmin`, result is
`undefined` → falsy → 403. Here that is acceptable: admin tokens are minted by
`signAdminToken()` with a 12h TTL and **no refresh flow**, so the blast radius
is a one-time re-login for a handful of platform admins at a
username/password form. (Contrast `is_vendor_owner` in §2, where the same
rename would have logged out every vendor — which is why that one is retired
rather than renamed.) Don't ship it during an incident.

### G14 — `users.is_admin` ✅ decided: drop the column

Nothing anywhere writes it. The only three `isAdmin: true` in the codebase are
`signAdminToken()` (`jwt.ts:71`), which mints `sub: 'admin'` from env
credentials with no `users` row at all, and two response literals. No seed, no
repository, no endpoint sets it. It is always `false`.

But `auth.service.ts:71` and `:217` copy it into every OTP-issued session
token, and `requireAdmin` trusts that claim — so it is a dormant second path
into the platform admin portal. `UPDATE users SET is_admin = true` on a
customer's row would grant them `/admin` with no deploy and no admin password.

**Decided: drop the column.** `signAdminToken()` becomes the only source of
super-admin.

What that means in practice:

- `schema.ts:146` — column removed.
- `auth.service.ts:217` — `createSession` hardcodes `isSuperAdmin: false`
  instead of reading the user row. **A user session can then never be
  super-admin, by construction** — a stronger property than the current code
  has, and one that cannot regress by someone flipping a row.
- `auth.service.ts:71` and `users.service.ts:35,71` — drop it from the session
  and profile responses; nothing on the web branches on it (`admin/layout.tsx`
  reads `isAdmin` from `/admin/me`, a different endpoint, which keeps working).
- `jwt.ts` keeps the claim as `isSuperAdmin`, set true only by
  `signAdminToken()`.

If named per-user admin accounts are wanted later, that is a new feature with
its own endpoint and audit trail — not this column switched back on.

### G7 — `users.is_vendor_owner` ✅ decided: retire it, don't cache it

See §2 for the full reasoning. Short version: the "13 files" framing was
misleading — after phases 2–3 the flag is meaningfully *read* in only two
places, both once per login. So it is neither kept as a cache nor ripped out
now; it is retired on a schedule that needs no compatibility window.

### G5–G13 — gaps with defaults I'd just apply

| # | Gap | Default |
| --- | --- | --- |
| G5 | Admin adds a phone that has no account yet | Create a stub `users` row (name + phone, `is_vendor_owner = true`). They get access on first OTP login. No invite-acceptance flow. |
| G6 | No consent — being added grants access without agreement | Accepted for v1. Note it in §14. |
| G7 | `users.is_vendor_owner` gates vendor-audience OTP login and `requireVendor` | Decided above — retired per §2. Until it is, adding a member must set it or they cannot log into the vendor app at all. |
| G8 | Self-serve create blocks a second company (`vendors.service.ts:501`) | Lift it — multi-company is the point. Guard instead on a sane per-user company cap. |
| G9 | Which company is active on login; what if it is archived mid-session | Last-used, persisted to `localStorage`, validated against the membership list on session restore; fall back to the first membership if invalid. |
| G10 | Bookings record no actor — with a team, "who accepted this?" is unanswerable | Add `accepted_by` / `completed_by` user FKs. Small, and painful to backfill later. |
| G11 | What do employees see under Settings (profile, hours, service areas)? | Hide the tab. All of it is admin-only per the matrix. |
| G12 | Vendor onboarding (`vendor/onboarding/step-1..4`) assumes one vendor per user | Only reachable when creating a *new* company; it writes to `vendor-onboarding-store` and then to the active company. |
| G13 | Can a member remove themselves / leave a company? | Yes for admins and employees, no for the owner. Same rule as G1. |

---

## 1. Scope

**In:** `vendor_members` + backfill · tenant resolution middleware · the
`admin`/`employee` matrix · member management API and UI · in-page company
switcher · internal cross-tenant access (§10) · booking actor columns (G10).

**Out:** per-tenant billing · DB-level isolation (row-scoping only) · customer
flow changes · admin portal restructuring · invite/consent flow (G6).

---

## 2. Data model

### `vendor_members` — new

| column | type | notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `vendor_id` | uuid → `vendors.id` cascade, **nullable** | `NULL` = every company (§10) |
| `user_id` | uuid → `users.id` cascade | |
| `role` | enum `vendor_member_role`: `admin` / `employee` | G4 |
| `status` | enum `vendor_member_status`: `active` / `suspended` | default `active`; see below |
| `added_by` | uuid → `users.id` nullable | audit |
| `created_at` | timestamptz | |

### `status` — suspend without deleting

An enum, not a boolean, so `revoked` or `invited` can be added later without a
migration. It buys suspension that preserves `added_by` and history, and it is
what the vendor-audience login gate checks (§2, G7): *"does this user have at
least one **active** membership?"*

Three things it drags in, all easy to miss:

1. **Every membership read must filter on it** — `resolveTenant`, the login
   `EXISTS`, the member list, `GET /auth/me/vendors`, and the company switcher.
   Miss it in one and a suspended member still has access. Same bug class as
   forgetting a tenant filter, so it belongs in the same choke points (§3).
2. **Adding a member becomes an upsert.** The `(vendor_id, user_id)` unique
   index means a suspended person cannot be re-added with a plain insert — it
   would 409 with "already a member", which is a confusing error for someone
   who looks removed in the UI. Re-adding must reactivate the existing row.
3. **It is a back door around G1 unless the invariant is widened.** "The
   owner's membership cannot be removed or demoted" does not say anything
   about *suspending* it — so without an explicit rule, an admin suspends the
   owner and the company is orphaned exactly as G1 set out to prevent.
   Invariant §11.2 is extended to cover status.

If suspension is not actually a product requirement, drop this column and use
delete — it is simpler, and the row is reconstructable from the member list
UI. Include it only if a garage genuinely needs to park a seasonal worker.

- Unique on `(vendor_id, user_id)` — one role per person per company.
- **Partial unique on `user_id WHERE vendor_id IS NULL`.** The composite above
  does *not* cover wildcard rows: Postgres treats NULLs as distinct in a unique
  index, so `(NULL, user_x)` could be inserted repeatedly. (PG 15+ could use
  `NULLS NOT DISTINCT`; the partial index works on every version.)
- Index on `user_id` — "which companies can I act as?"
- Index on `vendor_id` — the member list screen.
- A wildcard row may never belong to a company owner (§10).

### `vendors.owner_id` — keep, and give it teeth

Stays exactly as it is: the one person who owns the business, and already the
identity anchor for `admin.service.ts:120-133` (owner phone rewrites and
collision checks). The rule that makes it meaningful:

> `owner_id`'s user always has a `vendor_members` row for that vendor with
> role `admin`, and that row is immutable (§5).

So `owner_id` answers *who owns the company*; `vendor_members` answers *who
can use the portal and with what power*.

### `bookings` — two new columns (G10)

`accepted_by` and `completed_by`, both nullable uuid → `users.id`. Written by
the vendor action handlers from the authenticated user, not the tenant.

### `users.is_vendor_owner` — retire it (G7)

"13 files" overstates the problem. Of the 36 references:

| Kind | Count | Fate |
| --- | --- | --- |
| **Writes** — seeds, `setUserAsVendorOwner`, admin/auth repositories | 11 | Keep writing through phase 3, then stop |
| **Plumbing** — copying the boolean through payload → token → response (`jwt.ts`, `users.service.ts`, `auth.repository.ts`, web types/mappers) | 11 | Never branched on. Inert. |
| **`getBookingForViewer`** — `bookings.{service,controller}.ts` | 5 | Already rewritten to a membership check in §8 |
| **Session/audience derivation** — `auth.service.ts:231,352,382` | 3 | Already rewritten in §7 |
| **Actual gates** | 3 | ← the only ones that matter |

The three real gates are `requireVendor` (`auth.middleware.ts:36`) and the two
vendor-audience OTP checks (`auth.service.ts:117`, `:193`).

And `requireVendor` has **8 call sites** — `vendors.routes.ts:37`, five in
`bookings.routes.ts`, and `auth.routes.ts:42` — *every one of which phase 2
replaces with `resolveTenant`*. So after phase 3 it has no callers at all.

That leaves the flag meaningfully read in exactly **two** places, both once per
login. So: neither cache it nor rip it out — **retire it**.

- **Phases 1–3:** keep writing it exactly as today. Adding a member also sets
  it. Nothing breaks, nothing changes behaviour.
- **Phase 4:** switch the two OTP gates to `EXISTS (SELECT 1 FROM
  vendor_members WHERE user_id = ? AND status = 'active')`. One query per
  login, not per request. This is the "check membership, then log them in"
  path — a user with zero active memberships cannot open a vendor session,
  which is exactly today's behaviour for non-vendors.
- **After that** the column and the JWT claim are vestigial — nothing reads
  either. Drop the column in a cleanup migration whenever convenient.

Why this beats the two obvious alternatives:

- **vs. keeping it as a maintained cache:** no permanent second source of
  truth, so no drift if a membership row is ever written outside the service
  layer — and no lasting misnomer where every employee has
  `is_vendor_owner = true`.
- **vs. renaming the column now:** renaming the *JWT claim* would break every
  in-flight token. `verifyAccessToken` would read `undefined` → falsy → 403
  for every logged-in vendor until their token refreshed, which would need a
  read-both-keys compatibility window. Retiring needs no window, because by
  the time the claim is dropped nothing reads it.

The one ordering constraint: **the OTP gates must switch to membership in the
same phase that member management ships (phase 4/6), or a newly added employee
cannot log into the vendor app.** Until then, the membership insert setting
`is_vendor_owner` is what carries them.

### Backfill

```
INSERT INTO vendor_members (vendor_id, user_id, role)
SELECT id, owner_id, 'admin' FROM vendors;
```

One row per existing company. Reversible — drop the table and `owner_id` still
holds. Per AGENTS.md, schema files only; the developer runs migrations.

---

## 3. Tenant resolution

The rule the whole design rests on:

> The active `vendorId` is produced by middleware and read from context. No
> handler, service, or repository ever reads it from a request parameter.

Today authorization is *structurally* impossible to get wrong — the vendor is
derived from the session, so there is no attacker-controlled input in the
resolution path. A company selector puts one there and turns 35 endpoints into
IDOR candidates in one commit. Middleware being the only reader is what
preserves the current property.

### `resolveTenant`

Replaces `requireVendor` in vendor-scoped chains.

1. Read `X-Vendor-Id`.
2. **Absent:** look up the caller's **active** company-scoped memberships. Exactly one →
   use it (this is what keeps every existing single-garage client working with
   no change). Zero → 404 `VENDOR_NOT_FOUND`. More than one → 400
   `VENDOR_ID_REQUIRED`.
3. **Present:** load the **active** row for `(vendorId, auth.sub)`; if none,
   fall back to the caller's active wildcard row. Neither → **404**, not 403 —
   a 403 confirms the company exists and leaks the id space. A suspended row is
   treated exactly like no row.
4. `c.set('tenant', { vendorId, role, viaWildcard })`.

Two ordering rules that are not obvious:

- Step 2 ignores wildcard rows. Otherwise an internal user with no direct
  membership silently resolves to an arbitrary company. Wildcard holders must
  always send the header.
- A direct membership **wins over** a wildcard. A Detlio employee who also owns
  a garage acts as its admin there, and that request is not logged as support
  access.

### Why a header, not `/vendors/:vendorId/*`

Keeps `/vendors/me/*` and `/bookings/vendor` unchanged — 35 route
registrations untouched, one enforcement point instead of 35, and the selector
never lands in logs or referrers. Cost: not linkable or URL-cacheable, which
does not matter for authenticated, uncached endpoints.

### Why not put memberships in the JWT

`AccessTokenPayload` (`lib/jwt.ts:8`) is three booleans. Encoding per-company
roles makes the payload grow with membership count and go stale — removing an
employee would not take effect until their access token expired. One indexed
lookup per request buys immediate revocation.

---

## 4. Permissions

| Capability | owner | admin | employee |
| --- | :-: | :-: | :-: |
| View bookings | ✓ | ✓ | ✓ |
| Accept / reject / progress / complete (G3) | ✓ | ✓ | ✓ |
| See per-booking `amount` (G2) | ✓ | ✓ | ✓ |
| Earnings endpoint + home week-earnings tile (G2) | ✓ | ✓ | — |
| Earnings summary | ✓ | ✓ | — |
| Services + packages CRUD | ✓ | ✓ | — |
| Service images, logo, gallery | ✓ | ✓ | — |
| Working hours, slot interval, job types | ✓ | ✓ | — |
| Service areas | ✓ | ✓ | — |
| Company profile (`PATCH /vendors/me`) | ✓ | ✓ | — |
| Reviews (read) | ✓ | ✓ | ✓ |
| Add / remove members | ✓ | ✓ | — |
| Change a member's role | ✓ | ✓ | — |
| Remove or demote the **owner** (G1) | — | — | — |
| Transfer ownership | ✓ | — | — |

`owner` is not a role — it is `admin` plus the protections in §5. The enum
stays two values as specified.

Enforcement: `requireVendorRole('admin')` after `resolveTenant`, reading
`c.get('tenant').role`. **Default deny** — a vendor route with no
`requireVendorRole` is admin-only until someone deliberately widens it, so
adding a route can never accidentally expose it to employees.

---

## 5. Membership rules

The logic behind "employee cannot remove admin", made total:

1. Only admins reach member management at all. Employees get 403 on every
   member endpoint — they cannot remove an admin, another employee, or add
   anyone.
2. An admin may add, remove, promote and demote any member **except** the
   owner (G1).
3. The owner's row cannot be removed, demoted **or suspended** by anyone,
   including the owner. This is what guarantees at least one active admin
   always exists.
3a. Suspending a member revokes access immediately — §3 looks membership up per
   request, never from the token. Re-adding a suspended person reactivates
   their existing row rather than inserting a new one.
4. Transfer of ownership is owner-only: in one transaction, promote the target
   to `admin` if needed, set `vendors.owner_id`, and the protection moves with
   it. The old owner stays an `admin` member.
5. Admins and employees may remove themselves; the owner cannot (G13).
6. Adding a member sets `users.is_vendor_owner = true` (G7). Removing one
   clears it only if they have no memberships left.
7. `added_by` is recorded on every insert.

---

## 6. Earnings visibility

### New endpoint

`GET /vendors/me/earnings`, behind `requireVendorRole('admin')`, returning what
`web/lib/vendor-stats.ts` computes client-side today: the summary
(`computeEarningsSummary`), the recent-earnings list
(`computeRecentEarningsJobs`), and the home dashboard's `weekEarnings`. The
payout rule (`computeVendorPayout`) already lives server-side, so this is
moving the aggregation to sit beside it.

### Two vendor booking mappers

`toBookingResponse` (`bookings.service.ts:101`) is shared by customer and
vendor paths, so the fields cannot be dropped globally — customer receipts need
the discount breakdown. Split it instead:

- `toBookingResponse` — unchanged. Customer paths (`:572`, `:611`).
- `toVendorBookingResponse` — new. Omits `vendorPayoutAmount`,
  `subtotalAmount`, `discountAmount`, `discountFundedBy`. Keeps `amount` and
  `paymentMethod`. Used by `listVendorBookings` (`:757`) and the four status
  transitions (`:789`, `:807`, `:825`, `:848`).
- `GET /bookings/:id` (`:456`/`:466`) picks the mapper from how the viewer
  resolved — that branch already exists in `getBookingForViewer`.

Two mappers for two audiences, not one mapper with a role flag. The vendor
payload has a single fixed shape regardless of role, which is easier to type on
the client and impossible to get wrong per-request.

### Home dashboard

`computeVendorDashboardStats` mixes money and non-money stats. Split it:
`todaysJobs`, `pendingRequests`, `avgRating` and `reviewCount` stay
client-derived and visible to everyone; `weekEarnings` comes from the earnings
endpoint and the tile renders only for admins, so an employee's home page never
makes the call.

### UI

`useVendorRole()` drops the Earnings item from the employee nav
(`bottom-nav.tsx:26-32`, five items → four) and route-guards `/vendor/earnings`
to the vendor home page.

### Web changes this implies

`lib/api/earnings.ts` calls the endpoint instead of deriving from bookings ·
`lib/vendor-stats.ts` loses the earnings functions (or keeps them for the
server to reuse) · `lib/types/index.ts:155` and `lib/api/types.ts:226` drop
`vendorPayoutAmount` from the vendor booking type · `mappers.ts:230` drops the
mapping · `app/vendor/home/page.tsx` splits its stats fetch.

---

## 7. Auth and session

- `createSession` (`auth.service.ts:210-242`) attaches one `vendor` via
  `findVendorByOwnerId`. It becomes a `vendors[]` from membership, each entry
  carrying `role` and whether the user is the owner. Keep `vendor` populated
  when there is exactly one membership so existing clients survive the
  transition.
- `getMe` (`auth.service.ts:366-385`) — same change.
- New `GET /auth/me/vendors` — the switcher's data source: id, business name,
  logo, role, `isOwner`, verification status.
- Token shape **unchanged**. No migration, no forced logout.

---

## 8. Server refactor

Wide but shallow — it funnels through a few choke points.

| Location | Change |
| --- | --- |
| `vendors.controller.ts:29` | `getOwnerId(c)` → `getVendorId(c)` reading `c.get('tenant')`. Feeds all 30 vendor methods; each call site keeps its shape, the argument changes meaning. |
| `vendors.service.ts:401` | `getOwnedVendor(ownerId)` → load by `vendorId`, or delete if the middleware attaches the row. |
| `bookings.service.ts:180` | `getVendorForOwner(ownerId)` → same. Feeds `getBookingForVendor` (`:258`) and `listVendorBookings` (`:750`). |
| `bookings.service.ts:283` | **Highest-risk line.** The only place the 1:1 is assumed *inline*: it gates on `isVendorOwner` then compares one `findVendorByOwnerId` result. Becomes a membership check. It is read-authorization on `GET /bookings/:id`, which serves customers *and* vendors. |
| `vendors.routes.ts:37` | `ownerMiddleware` → `[authMiddleware, resolveTenant]` + per-route `requireVendorRole`. 30 routes. |
| `bookings.routes.ts` | Same swap at 5 vendor routes (list, accept, reject, progress, complete). |
| `auth.routes.ts:42` | The 8th `requireVendor` call site — `GET /auth/me/vendor`. Superseded by `GET /auth/me/vendors` (§7); keep it working via `resolveTenant` during the transition. |
| `vendors.service.ts:501` | Drop the "vendor already exists" block (G8). |
| `auth.middleware.ts:32` | `requireVendor` loses all 8 call sites in phase 2. Delete it in phase 4 once the OTP gates move to membership (§2). |

New module `server/src/modules/members/` (standard five-file structure) mounted
at `/vendors/me/members`.

---

## 9. Web changes

`web/lib/stores/auth-store.ts` holds `vendor: ApiAuthVendor | null` — the 1:1
assumption on the client. It gains `vendors[]`, `activeVendorId`, `role`,
`isOwner` and `setActiveVendor`, with `vendor` kept as a **derived getter** for
the active company so the 13 files reading `s.vendor` need no immediate change:
`web/app/vendor/{home,settings,earnings,reviews}`, the four
`vendor/onboarding/step-*` pages, `web/app/{home,search}`,
`web/app/admin/vendors/[id]/edit`, `components/providers/app-provider.tsx`,
`lib/api/{mappers,bookings}.ts`.

`web/lib/api/client.ts:82` builds `requestHeaders` in one place — attach
`X-Vendor-Id` there and no individual API module changes.

**Company switcher (in-page, per spec).** A control in the vendor page header,
rendered only when `vendors.length > 1`, showing logo + business name + role.
Switching sets `activeVendorId`, persists it, and invalidates the vendor
TanStack Query keys so every screen refetches under the new tenant. Query keys
must include `activeVendorId` or a stale company's data will render after a
switch — easy to miss, and it looks exactly like a data leak.

**Role gating.** Employee nav is four items (no Earnings). Settings hidden
(G11). Services screens read-only or hidden. A `useVendorRole()` hook keeps
this out of individual components. Server enforcement is the boundary; the UI
is convenience.

**New:** members screen under `vendor/settings/members` — list with roles, add
by phone, change role, remove, with the owner's row visibly locked.

---

## 10. Internal team access

One wildcard `vendor_members` row per Detlio employee: `vendor_id = NULL`,
role `employee` by default. Same table, resolver, enum and revocation path as
every other seat. No impersonation endpoint, no `is_internal` flag.

The naive alternative — a real membership row per company — fails three ways
the wildcard avoids: cardinality (`employees × companies`, re-granted on every
onboarding), visibility (the garage's member list would show Detlio staff), and
revocation (N deletes instead of one).

- Member lists filter `vendor_id IS NOT NULL`, so owners never see internal
  staff in their own team screen.
- Append-only `internal_access_log` — user, vendor, endpoint, method,
  timestamp — written by the middleware whenever `viaWildcard`, never by
  handlers.
- Responses on a wildcard-resolved request carry a flag the portal renders as
  a persistent "Detlio support session on <company>" banner.
- Granted from the admin portal only, never self-serve.
- **Never grant a wildcard row to an account that can authenticate without a
  one-time code.** A wildcard row turns any weaker login path on that account
  into access to every company at once, so the two must not overlap. Enforce it
  as a check in the grant endpoint, not as a convention.

**Open consequence of the two-role model:** there is no read-only role, so a
wildcard `employee` can accept, reject and complete jobs on any company — it is
the *least* privileged option available, not a safe one. If read-only internal
access matters, that is a third enum value (`support`) and it should be decided
alongside G4 rather than retrofitted.

---

## 11. Invariants — do not break

1. The tenant is never read from a request parameter outside `resolveTenant`.
2. The `owner_id` user always has an `admin` membership for that company that
   is **active**, and that cannot be removed, demoted **or suspended** — so at
   least one active admin always exists.
3. Membership miss returns 404, never 403.
4. A direct membership always wins over a wildcard.
5. Wildcard rows never appear in a company's member list and never belong to a
   company owner.
6. Missing `X-Vendor-Id` with exactly one active company-scoped membership
   resolves silently. This is what makes the rollout non-breaking.
7. Roles default deny — a new vendor route is admin-only until widened.
8. Until `users.is_vendor_owner` is retired (§2), it is true iff the user has
   ≥1 membership. After phase 4, nothing reads it.
9. Customer endpoints are untouched.
10. Client query keys include `activeVendorId`.

---

## 12. Build order

Each phase ships independently and leaves the app working.

| # | Phase | Depends on |
| --- | --- | --- |
| 1 | `vendor_members` schema + backfill + booking actor columns; dual-write on both company-create paths. Nothing reads it yet. | — |
| 2 | `resolveTenant`; swap `requireVendor` on all 35 routes. Header optional — single-company users unaffected. | 1 |
| 3 | Refactor the choke points (§8) to take `vendorId`. Behaviour-identical; the big shallow diff. | 2 |
| 4 | `requireVendorRole` + the §4 matrix + §5 membership rules. Switch the two OTP gates to active-membership `EXISTS`; delete `requireVendor` (§2). Rename the platform claim to `isSuperAdmin` and drop `users.is_admin` (G4, G14). | 3 |
| 5 | Earnings boundary (§6): admin-only endpoint, split vendor mapper, dashboard split, UI gating. | 4 |
| 6 | Members CRUD + `GET /auth/me/vendors` + ownership transfer. | 4 |
| 7 | Web: store, header wiring, switcher, members screen, role gating. | 6 |
| 8 | Wildcard rows + audit log + banner + admin grant UI (§10). | 4 |

Phase 8 can move ahead of 5–7 if internal support access is urgent — it needs
only 2, 3 and 4.

---

## 13. Acceptance checklist

**Tenancy**
- [ ] Every existing company has exactly one `admin` membership post-backfill
- [ ] A single-company user works end to end with no `X-Vendor-Id` sent
- [ ] `X-Vendor-Id` for a company you are not a member of → 404 on all 35
      endpoints (test the full list, not a sample)
- [ ] `GET /bookings/:id` for another company's booking → 404 (`:283` path)
- [ ] A user in two companies sees the switcher; switching refetches every
      screen and never renders the previous company's data

**Roles**
- [ ] Employee can accept, reject, progress and complete a job
- [ ] Employee gets 403 on services, hours, service areas, profile, members
- [ ] Vendor booking payload carries no `vendorPayoutAmount`,
      `subtotalAmount`, `discountAmount` or `discountFundedBy` — on the list
      endpoint, on all four status-transition responses, and on
      `GET /bookings/:id` when the viewer resolved as a vendor
- [ ] The same `GET /bookings/:id` still returns the discount breakdown to the
      **customer** who owns the booking
- [ ] Employee's `/vendor/home` shows no week-earnings tile and fires no
      request to the earnings endpoint
- [ ] Employee gets 403 on `GET /vendors/me/earnings`; nav has no Earnings tab;
      `/vendor/earnings` route-guards away
- [ ] Employee cannot remove or demote an admin, another employee, or add anyone
- [ ] Admin can add a member by phone for a number with no existing account
- [ ] Admin can remove and demote another admin
- [ ] **Nobody** can remove, demote **or suspend** the owner, including the owner
- [ ] A suspended member is refused by `resolveTenant`, by the vendor login
      gate, and is absent from `GET /auth/me/vendors` — test all three
- [ ] Suspending a member with a live session blocks their next request
      without a re-login
- [ ] Re-adding a suspended member reactivates their row instead of 409-ing
- [ ] A platform admin re-logs in once after the `isSuperAdmin` rename, and
      vendor/customer sessions are unaffected
- [ ] An OTP-issued session can never carry `isSuperAdmin: true`, even if a
      `users` row is hand-edited — the column no longer exists (G14)
- [ ] `/admin/me` and the admin portal still work end to end after the drop
- [ ] Ownership transfer moves both `owner_id` and the protection atomically
- [ ] A newly added employee can log into the vendor app — test both before
      phase 4 (via `is_vendor_owner`) and after (via membership `EXISTS`)
- [ ] After phase 4, an in-flight token issued before the deploy still works

**Internal**
- [ ] Wildcard holder reaches an arbitrary company; the owner's member list
      does not show them; the access log has a row; the banner renders
- [ ] Wildcard holder with no `X-Vendor-Id` → 404, not an arbitrary company
- [ ] A second wildcard row for the same user is rejected by the partial index
- [ ] An employee who also owns a garage resolves as its admin, and that
      request is *not* logged as support access
- [ ] Deleting a wildcard row blocks the next request without a re-login

**Regression**
- [ ] Admin portal vendor CRUD still passes
- [ ] Customer booking flow unchanged

---

## 14. Known limitations (accepted)

- Row-scoping, not DB-level isolation. A missing tenant filter is still a
  cross-tenant leak; §11.1 is the mitigation.
- No consent flow (G6) — an admin adds a phone and that person has access on
  next login.
- Per-booking `amount` and `paymentMethod` are visible to employees by design
  (G2) — cash collection needs them. Only the payout split, discount breakdown
  and aggregate are hidden.
- Wildcard grants are all-or-nothing across companies. Scoping one to a city
  needs a further column — the row model leaves room, a boolean flag would not.
- No read-only internal role under the two-role model (§10).
- `users.is_vendor_owner` stays a dual-written cache for phases 1–3 and can
  drift in that window if a membership row is written outside the service
  layer. Resolved when it is retired in phase 4 (§2).
- No per-tenant rate limiting.

---

## 15. File map

**Server — new:** `modules/members/members.{route,controller,service,validation,repository}.ts` ·
`middleware/tenant.middleware.ts`

**Server — modified:** `db/schema.ts` (+`vendor_members` incl. `status`,
+`internal_access_log`, +booking actor columns, −`is_admin` per G14) · `middleware/auth.middleware.ts` ·
`modules/vendors/{routes,controller,service,repository}.ts` ·
`modules/bookings/{routes,controller,service}.ts` ·
`modules/auth/{service,repository,routes}.ts` ·
`modules/admin/{service,repository,routes,validation}.ts` (wildcard grants,
dual-write) · `db/seeds/seed-vendors.ts`

**Web — new:** company switcher · `vendor/settings/members/` · support banner ·
`useVendorRole()`

**Web — modified:** `lib/stores/auth-store.ts` · `lib/api/client.ts` ·
`lib/api/{auth,types,mappers,earnings,bookings}.ts` ·
`components/sc/bottom-nav.tsx` · `components/providers/app-provider.tsx` ·
the 11 `s.vendor` consumers listed in §9
