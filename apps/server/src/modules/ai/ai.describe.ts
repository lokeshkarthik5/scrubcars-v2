import { AiUnavailableError, type DocumentClient, type TextClient } from '../../lib/ai.js'
import { categoryLabel } from '../../lib/categories.js'
import { AppError } from '../../lib/errors.js'
import { writeServiceDescription } from '../../lib/service-description.js'
import type { DescribeServiceInput } from './ai.validation.js'

/**
 * The AI service's decisions with the client passed in: which helpers are
 * on, and how each way "Write with AI" can end becomes a status the admin
 * panel understands. Apart from ai.service.ts (which wires the env-built
 * client and the logger), so the tests can drive every ending with a fake
 * client — and without the env a real boot needs.
 */

/** Where the reason a call ended goes. The service passes the logger. */
export interface AiLog {
  warn(details: Record<string, unknown>, message: string): void
}

/**
 * Which AI helpers the admin panel may show. All off without a client.
 * `import` is reading photos and PDFs on Add garage; the Tally CSV import
 * needs no AI and is always there.
 */
export function aiConfigFor(client: TextClient | null, reader: DocumentClient | null) {
  return { describe: client !== null, import: reader !== null }
}

/**
 * One service description, or the AppError the panel shows: 503
 * AI_UNAVAILABLE when AI is off or OpenAI can't answer, 422
 * AI_NO_DESCRIPTION when its answer broke the rules twice.
 */
export async function describeServiceWith(
  client: TextClient | null,
  input: DescribeServiceInput,
  log: AiLog
): Promise<{ description: string }> {
  if (!client) {
    throw new AppError(503, 'Writing with AI is not set up.', 'AI_UNAVAILABLE')
  }

  try {
    const result = await writeServiceDescription(
      {
        name: input.name,
        categoryLabel: categoryLabel(input.category),
        pricingType: input.pricingType,
        durationMins: input.durationMins,
        garageName: input.garageName || undefined,
      },
      client
    )
    if (!result.ok) {
      // The model's answer broke a rule twice. Logged with the reason so a
      // pattern shows up, never with the answer itself.
      log.warn({ problem: result.problem }, 'ai description refused')
      throw new AppError(
        422,
        "Couldn't write a description that fits the rules. Try again or type one.",
        'AI_NO_DESCRIPTION'
      )
    }
    return { description: result.description }
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      log.warn({ err: err.cause ?? err }, 'ai unavailable')
      throw new AppError(
        503,
        "Couldn't reach the AI service. Try again in a minute.",
        'AI_UNAVAILABLE'
      )
    }
    throw err
  }
}
