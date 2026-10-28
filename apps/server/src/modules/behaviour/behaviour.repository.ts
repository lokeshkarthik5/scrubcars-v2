import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import type { BehaviourDevice, BehaviourSessionGroup, BehaviourSource } from '../../lib/behaviour.js'

/** An instant as a SQL timestamptz. */
const at = (instant: Date) => sql`${instant.toISOString()}::timestamptz`

/**
 * A visit's events can begin before the period does: they are read from a
 * day earlier, so a visit is dated by its first event and counted once,
 * whole, in the period it began.
 */
const LOOK_BACK = sql`interval '1 day'`

export interface BehaviourFilters {
  start: Date
  end: Date
  source: BehaviourSource
  device: BehaviourDevice
}

export const behaviourRepository = {
  /**
   * Visits that began in [start, end), grouped by what they did: the set
   * of events, the last one, whether an account was on any of them, and
   * whether that account is the team's or made a booking marked Test during
   * the visit. Counts only; no account id, name or number leaves the
   * query. The team: a super_admin mapping, or a users row whose number
   * (last ten digits) is a team login's phone.
   *
   * One read-only transaction with a ten-second statement timeout, like
   * the other Statistics reads: the API's one database connection is
   * shared with checkout.
   */
  async sessionGroups(filters: BehaviourFilters): Promise<BehaviourSessionGroup[]> {
    const { start, end, source, device } = filters
    const sourceFilter =
      source === 'all'
        ? sql``
        : source === 'other'
          ? sql`and coalesce(s.channel, 'other') not in ('instagram', 'google', 'direct')`
          : sql`and s.channel = ${source}`
    const deviceFilter =
      device === 'all'
        ? sql``
        : device === 'phone'
          ? sql`and s.device = 'phone'`
          : sql`and s.device in ('tablet', 'desktop')`

    return db.transaction(
      async (tx) => {
        await tx.execute(sql`set local statement_timeout = '10s'`)
        const rows = await tx.execute<{
          names: string[]
          last_name: string | null
          signed_in: boolean
          team: boolean
          test: boolean
          sessions: number
        }>(sql`
          with s as (
            select e.visit_id,
                   min(e.occurred_at) as started_at,
                   max(e.occurred_at) as ended_at,
                   array_agg(distinct e.name order by e.name) as names,
                   (array_agg(e.name order by e.occurred_at desc, e.id desc))[1] as last_name,
                   bool_or(e.user_id is not null) as signed_in,
                   (array_agg(e.device order by e.occurred_at) filter (where e.device is not null))[1] as device,
                   (array_agg(e.props->>'channel' order by e.occurred_at) filter (where e.name = 'app_open'))[1] as channel,
                   array_remove(array_agg(distinct e.user_id), null) as user_ids
              from analytics_events e
             where e.visit_id is not null
               and e.occurred_at >= ${at(start)} - ${LOOK_BACK}
               and e.occurred_at < ${at(end)} + ${LOOK_BACK}
             group by e.visit_id
          ),
          team as (
            select m.user_id
              from user_member_mapping m
             where m.role = 'super_admin'
               and m.status = 'active'
            union
            select u.id
              from users u
              join admin_logins a
                on a.phone is not null
               and right(regexp_replace(u.phone, '[^0-9]', '', 'g'), 10)
                 = right(regexp_replace(a.phone, '[^0-9]', '', 'g'), 10)
          ),
          scoped as (
            select s.names,
                   s.last_name,
                   s.signed_in,
                   exists (select 1 from team t where t.user_id = any(s.user_ids)) as team,
                   exists (
                     select 1
                       from bookings b
                      where b.user_id = any(s.user_ids)
                        and b.marked_test_at is not null
                        and b.created_at >= s.started_at - interval '1 hour'
                        and b.created_at <= s.ended_at + interval '1 hour'
                   ) as test
              from s
             where s.started_at >= ${at(start)}
               and s.started_at < ${at(end)}
               ${sourceFilter}
               ${deviceFilter}
          )
          select names, last_name, signed_in, team, test, count(*)::int as sessions
            from scoped
           group by 1, 2, 3, 4, 5
        `)
        return rows.map((row) => ({
          names: row.names,
          lastName: row.last_name,
          signedIn: row.signed_in,
          team: row.team,
          test: row.test,
          sessions: row.sessions,
        }))
      },
      { accessMode: 'read only' }
    )
  },

  /** When the first Behaviour step was recorded (its release), or null before any. */
  async stepsSince(): Promise<Date | null> {
    const [row] = await db.execute<{ first: Date | string | null }>(sql`
      select min(occurred_at) as first from analytics_events where name = 'landing_view'
    `)
    if (!row?.first) return null
    return row.first instanceof Date ? row.first : new Date(row.first)
  },
}
