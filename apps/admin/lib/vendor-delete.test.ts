import { describe, expect, test } from 'bun:test'
import { deleteConfirm, deleteRefusal } from './vendor-delete'

describe('deleteRefusal', () => {
  test('a live garage is pointed at Archive', () => {
    for (const status of ['active', 'pending', 'suspended']) {
      expect(deleteRefusal(status)).toBe(
        "This garage has bookings, so it can't be deleted yet. Archive it to hide it from customers; its bookings are kept."
      )
    }
  })

  test('an archived garage is not told to archive itself', () => {
    const message = deleteRefusal('archived')
    expect(message).toBe(
      "Already archived and hidden from customers. A garage with bookings can't be deleted yet."
    )
    expect(message).not.toContain('Archive it')
  })
})

describe('deleteConfirm', () => {
  test('asks only about the delete itself', () => {
    const message = deleteConfirm('Sparkle Wash')
    expect(message).toStartWith('Permanently delete "Sparkle Wash"?')
    expect(message).toContain('cannot be undone')
    // Only asked when the garage can be deleted, so no talk of archiving.
    expect(message).not.toContain('Archive')
  })
})
