import { describe, expect, test } from 'bun:test'
import * as server from './list-text.js'

// The apps' twin lives in packages/core, loaded by path at run time.
const coreUrl = new URL('../../../../packages/core/src/list-text.ts', import.meta.url).href

type Twin = typeof server

const SAMPLES = [
  '',
  'Plain paragraph.',
  'Intro\n- A\n- B',
  '• One\n•Two\n* Three\n· Four\n1. Five\n2) Six',
  '-10% off\n- real point\n  trailing line  ',
  '\r\n- a\r\n\r\nb',
]

describe('list text parity', () => {
  test('the server and the apps read and write lists the same way', async () => {
    const core = (await import(coreUrl)) as Twin
    for (const text of SAMPLES) {
      expect(core.splitListText(text)).toEqual(server.splitListText(text))
      expect(core.hasPoints(text)).toBe(server.hasPoints(text))
      for (const line of text.split('\n')) expect(core.pointOf(line)).toBe(server.pointOf(line))
    }
    expect(core.joinListText(' i ', [' a ', '', 'b'])).toBe(server.joinListText(' i ', [' a ', '', 'b']))
  })
})
