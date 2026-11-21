/**
 * Service templates (0082) through the real repository and a real Postgres:
 * the seeded built-ins in the old order, a team template added, edited,
 * switched off and deleted with an admin_audit_log row for each, the
 * case-insensitive name index, and Save as template's garage.
 *
 * Needs a throwaway, fully migrated local database, so it runs on its own
 * and only when asked (skipped in the ordinary suite):
 *
 *   SERVICE_TEMPLATES_DB_URL='postgresql://detlio:detlio@localhost:55432/<db>?sslmode=disable' \
 *     bun test src/modules/service-templates/service-templates.db.test.ts
 *
 * Never point it at a real database: it refuses any host but localhost.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'

const url = process.env.SERVICE_TEMPLATES_DB_URL
const local = url !== undefined && /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)
if (local) process.env.DATABASE_URL = url

describe.skipIf(!local)('service templates against Postgres (0082)', async () => {
  const { db } = await import('../../db/index.js')
  const { sql } = await import('drizzle-orm')
  const { serviceTemplatesRepository: repo } = await import('./service-templates.repository.js')
  const { serviceTemplatesService } = await import('./service-templates.service.js')
  const actor = { sub: 'admin:e2e', name: 'E2E Templates' }
  const ids = { user: randomUUID(), vendor: randomUUID() }
  const made: string[] = []

  afterAll(async () => {
    for (const id of made) await db.execute(sql`delete from service_templates where id = ${id}`)
    // admin_audit_log is append-only (a trigger); a throwaway database keeps its rows.
    await db.execute(sql`delete from vendors where id = ${ids.vendor}`)
    await db.execute(sql`delete from users where id = ${ids.user}`)
  })

  test('the built-ins come first, in the old order, all on', async () => {
    const rows = await repo.listTemplates()
    const builtIns = rows.filter((row) => row.builtIn)
    expect(builtIns.map((row) => row.key)).toEqual([
      'foam-wash', 'body-wash', 'full-wash', 'interior-cleaning', 'ceramic-coating', 'polishing',
      'engine-bay-cleaning', 'underbody-wash', 'headlight-restoration', 'bike-wash', 'general-service',
      'oil-change', 'wheel-alignment-balancing', 'brake-pads', 'ac-service', 'clutch-repair', 'dent-repair',
      'panel-painting',
    ])
    expect(builtIns.every((row) => row.isOn)).toBe(true)
    expect(builtIns.find((row) => row.key === 'interior-cleaning')!.description).toStartWith('Deep vacuum of seats')
  })

  test('add, edit, off, delete: each audited; the name index is case-blind; the editor list follows', async () => {
    const phone = `+9190000079${String(Date.now()).slice(-2)}`
    await db.execute(sql`insert into users (id, name, phone) values (${ids.user}, 'Template owner', ${phone})`)
    await db.execute(sql`
      insert into vendors (id, owner_id, business_name, phone, address, city)
      values (${ids.vendor}, ${ids.user}, 'Kumar Auto Spa', ${phone}, '1 Test Road', 'Chennai')`)

    const created = await serviceTemplatesService.create(
      {
        actorName: actor.name,
        name: 'Rat repellent treatment',
        category: 'others',
        durationMins: 30,
        pricingType: 'flat',
        description: 'Engine bay dusted off and a rodent-repellent spray applied to the wiring, hoses and bonnet lining.',
        fromVendorId: ids.vendor,
      },
      actor
    )
    made.push(created.id)
    expect(created).toMatchObject({ isNew: true, builtIn: false, sourceVendorName: 'Kumar Auto Spa', createdByName: actor.name })
    const all = await repo.listTemplates()
    expect(all.at(-1)!.id).toBe(created.id)

    // The database's own refusal, past the service's check.
    const clash = await repo
      .createTemplate(
        { name: ' RAT repellent treatment', category: 'others', durationMins: 30, pricingType: 'flat', description: 'x.', isOn: true, sourceVendorId: null },
        actor
      )
      .catch((error: unknown) => error)
    expect(clash).toBeInstanceOf(Error)

    await serviceTemplatesService.update(created.id, { actorName: actor.name, durationMins: 35 }, actor)
    await serviceTemplatesService.setOn(created.id, false, actor)
    expect((await repo.listTemplates(true)).map((row) => row.id)).not.toContain(created.id)
    expect((await repo.listTemplates(false)).map((row) => row.id)).toContain(created.id)
    await serviceTemplatesService.remove(created.id, actor)
    expect(await repo.findTemplate(created.id)).toBeUndefined()

    const audit = Array.from(
      await db.execute<{ action: string; summary: { templateId: string } }>(sql`
        select action, summary from admin_audit_log
         where summary->>'templateId' = ${created.id} order by created_at, id`)
    )
    expect(audit.map((row) => row.action)).toEqual([
      'service_template_saved_from_service',
      'service_template_edited',
      'service_template_turned_off',
      'service_template_deleted',
    ])
    expect(audit.every((row) => row.summary.templateId === created.id)).toBe(true)

    // Deleted, its name is free; removing the garage leaves a template alone.
    const again = await serviceTemplatesService.create(
      { actorName: actor.name, name: 'Rat repellent treatment', category: 'others', durationMins: 30, pricingType: 'flat', description: 'A rodent-repellent spray on the wiring.', fromVendorId: ids.vendor },
      actor
    )
    made.push(again.id)
    await db.execute(sql`delete from vendors where id = ${ids.vendor}`)
    expect((await repo.findTemplate(again.id))!.sourceVendorId).toBeNull()
  })
})
