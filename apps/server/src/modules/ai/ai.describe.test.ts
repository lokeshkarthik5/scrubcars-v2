import { describe, expect, test } from 'bun:test'
import {
  AiUnavailableError,
  FAKE_AI_TEXT,
  fakeDocumentClient,
  fakeTextClient,
  type TextClient,
} from '../../lib/ai.js'
import { AppError } from '../../lib/errors.js'
import { aiConfigFor, describeServiceWith, type AiLog } from './ai.describe.js'
import type { DescribeServiceInput } from './ai.validation.js'

// The statuses the admin panel is built on: what each way "Write with AI"
// can end becomes. Every client here is a fake; nothing leaves the process.

const INPUT: DescribeServiceInput = {
  name: 'Foam wash',
  category: 'car_wash',
  pricingType: 'per_vehicle',
  garageName: 'Next Level Auto Detailing',
}

/** Remembers what was logged, so a test can see the reason was kept. */
function recordingLog(): AiLog & { lines: Array<{ details: Record<string, unknown>; message: string }> } {
  const lines: Array<{ details: Record<string, unknown>; message: string }> = []
  return { lines, warn: (details, message) => lines.push({ details, message }) }
}

/** The AppError a call ends in, or a failed test. */
async function refusal(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(AppError)
    return err as AppError
  }
  throw new Error('expected the call to be refused')
}

describe('aiConfigFor', () => {
  test('on with a client, off without one (no OPENAI_API_KEY)', () => {
    expect(aiConfigFor(fakeTextClient(), fakeDocumentClient('{}'))).toEqual({ describe: true, import: true })
    expect(aiConfigFor(null, null)).toEqual({ describe: false, import: false })
  })
})

describe('describeServiceWith', () => {
  test('a good answer comes back as the description', async () => {
    expect(await describeServiceWith(fakeTextClient(), INPUT, recordingLog())).toEqual({
      description: FAKE_AI_TEXT,
    })
  })

  test('AI switched off is 503 AI_UNAVAILABLE', async () => {
    const err = await refusal(describeServiceWith(null, INPUT, recordingLog()))
    expect([err.statusCode, err.code]).toEqual([503, 'AI_UNAVAILABLE'])
  })

  test('OpenAI not answering (rate limit, timeout, bad key) is 503 AI_UNAVAILABLE, logged', async () => {
    const client: TextClient = {
      complete: async () => {
        throw new AiUnavailableError('429 Rate limit reached')
      },
    }
    const log = recordingLog()
    const err = await refusal(describeServiceWith(client, INPUT, log))
    expect([err.statusCode, err.code]).toEqual([503, 'AI_UNAVAILABLE'])
    expect(err.message).toBe("Couldn't reach the AI service. Try again in a minute.")
    expect(log.lines.map((line) => line.message)).toEqual(['ai unavailable'])
  })

  test('an answer that breaks the rules twice is 422 AI_NO_DESCRIPTION, logged without the text', async () => {
    let calls = 0
    const client: TextClient = {
      complete: async () => {
        calls++
        return 'The best wash in Chennai, guaranteed!'
      },
    }
    const log = recordingLog()
    const err = await refusal(describeServiceWith(client, INPUT, log))
    expect([err.statusCode, err.code]).toEqual([422, 'AI_NO_DESCRIPTION'])
    expect(calls).toBe(2)
    expect(log.lines).toHaveLength(1)
    expect(log.lines[0].message).toBe('ai description refused')
    expect(JSON.stringify(log.lines[0].details)).not.toContain('Chennai')
  })

  test('an empty answer is 422 too, never an empty description', async () => {
    const err = await refusal(describeServiceWith(fakeTextClient('   '), INPUT, recordingLog()))
    expect([err.statusCode, err.code]).toEqual([422, 'AI_NO_DESCRIPTION'])
  })

  test('anything else is left to surface as the bug it is', async () => {
    const client: TextClient = {
      complete: async () => {
        throw new TypeError('boom')
      },
    }
    await expect(describeServiceWith(client, INPUT, recordingLog())).rejects.toBeInstanceOf(TypeError)
  })
})
