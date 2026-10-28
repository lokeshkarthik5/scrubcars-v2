import { describe, expect, it } from 'bun:test'
import { planServiceReconcile, type ServiceRowState } from './service-reconcile.js'

const live = (id: string): ServiceRowState => ({ id, isActive: true, deleted: false })
const hidden = (id: string): ServiceRowState => ({ id, isActive: false, deleted: false })
const gone = (id: string): ServiceRowState => ({ id, isActive: false, deleted: true })

describe('planServiceReconcile', () => {
  it('updates live rows, inserts new ones and hides live rows left out', () => {
    const plan = planServiceReconcile([{ id: 'a' }, {}], [live('a'), live('b')])
    expect(plan.update).toEqual([{ index: 0, id: 'a', isActive: true }])
    expect(plan.insert).toEqual([1])
    expect(plan.deactivate).toEqual(['b'])
    expect(plan.deleted).toEqual([])
  })

  it('never brings a deleted service back from a stale tab', () => {
    const plan = planServiceReconcile([{ id: 'a' }, { id: 'x' }], [live('a'), gone('x')])
    expect(plan.deleted).toEqual(['x'])
    expect(plan.insert).toEqual([])
    expect(plan.update.map((u) => u.id)).toEqual(['a'])
  })

  it('keeps a service hidden since the editor loaded hidden, edits and all', () => {
    const plan = planServiceReconcile([{ id: 'h' }], [hidden('h')])
    expect(plan.update).toEqual([{ index: 0, id: 'h', isActive: false }])
    expect(plan.insert).toEqual([])
    expect(plan.deactivate).toEqual([])
  })

  it("treats an id that is not this garage's as a new service", () => {
    const plan = planServiceReconcile([{ id: 'other-garage' }], [live('a')])
    expect(plan.insert).toEqual([0])
    expect(plan.deactivate).toEqual(['a'])
  })

  it('updates an id sent twice only once', () => {
    const plan = planServiceReconcile([{ id: 'a' }, { id: 'a' }], [live('a')])
    expect(plan.update).toHaveLength(1)
    expect(plan.insert).toEqual([])
  })

  it('does not hide deleted or already hidden rows again', () => {
    const plan = planServiceReconcile([], [hidden('h'), gone('x'), live('a')])
    expect(plan.deactivate).toEqual(['a'])
  })
})
