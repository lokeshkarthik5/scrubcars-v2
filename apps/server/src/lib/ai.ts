import OpenAI from 'openai'

/**
 * The one door to AI text in Detlio.
 *
 * Owner decision: every AI feature goes through OpenAI, on one key, so there
 * is one account, one bill and one data agreement to keep track of. Nothing
 * else in the API imports the SDK; a feature asks this file for a
 * TextClient and gets back plain text or an AiUnavailableError.
 *
 * What is sent is the caller's business, and the rule for callers is that it
 * is never personal data: no customer, owner or staff names, phones or
 * addresses. See AGENTS.md.
 *
 * No env is read here. The caller passes the key, model and fake flag in,
 * so the tests can build a client without a database URL or a key.
 */

/** One request for text: the standing rules, and what to write about. */
export interface TextRequest {
  instructions: string
  input: string
  /**
   * The ceiling on the answer, in tokens. On a reasoning model it covers the
   * model's thinking as well as the text, so it is set well above what a
   * short answer needs; an answer cut off by it comes back empty.
   */
  maxOutputTokens: number
}

/** Anything that turns a TextRequest into text: OpenAI, or a test's fake. */
export interface TextClient {
  complete(request: TextRequest): Promise<string>
}

/**
 * OpenAI could not answer: no connection, a timeout, a rate limit, a bad
 * key, an outage. The caller says "try again later"; nothing about it is the
 * admin's fault, and the detail goes to the log, not the screen.
 */
export class AiUnavailableError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

/**
 * What the fake client says to every request. The E2E specs assert on it, so
 * it passes the service-description rules (lib/service-description.ts).
 */
export const FAKE_AI_TEXT =
  'Exterior washed by hand and dried with microfibre, with the wheels and glass cleaned.'

/** A client that never leaves the process. Used with AI_FAKE=1 and in tests. */
export function fakeTextClient(answer: string = FAKE_AI_TEXT): TextClient {
  return { complete: async () => answer }
}

interface OpenAiTextConfig {
  apiKey: string
  model: string
  /**
   * Tests only: a stand-in for the network, which the SDK takes in place of
   * the global fetch (its README, "Customizing the fetch client"), so the
   * real client can be run against canned answers without calling OpenAI.
   */
  fetch?: typeof fetch
}

/**
 * The OpenAI Responses API, which the SDK's README names as the primary way
 * to generate text. `output_text` is the SDK's join of every text part of the
 * answer; reasoning and other items are ignored.
 *
 * 20 seconds and one retry: an admin is waiting on a button, and the API's
 * function would be cut off long before the SDK's own 10-minute default.
 */
export function openAiTextClient({ apiKey, model, fetch }: OpenAiTextConfig): TextClient {
  const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1, ...(fetch && { fetch }) })

  return {
    async complete({ instructions, input, maxOutputTokens }) {
      try {
        const response = await client.responses.create({
          model,
          instructions,
          input,
          max_output_tokens: maxOutputTokens,
        })
        return response.output_text ?? ''
      } catch (err) {
        // Every error the SDK raises is an OpenAIError: APIError and its
        // subclasses (RateLimitError, AuthenticationError,
        // InternalServerError, APIConnectionError, the timeout) and the
        // client-side ones. Anything else is a bug here, and is left to
        // surface as one.
        if (err instanceof OpenAI.OpenAIError) {
          throw new AiUnavailableError(err.message, err)
        }
        throw err
      }
    },
  }
}

export interface TextClientConfig {
  apiKey: string | undefined
  model: string
  fake: boolean
}

/**
 * The client the config allows, or null when AI is switched off (no key and
 * not faked). Null is what turns the admin buttons off.
 */
export function textClientFor({ apiKey, model, fake }: TextClientConfig): TextClient | null {
  if (fake) return fakeTextClient()
  if (!apiKey) return null
  return openAiTextClient({ apiKey, model })
}
