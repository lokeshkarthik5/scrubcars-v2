import OpenAI from 'openai'

/**
 * The one door to AI in Detlio.
 *
 * Owner decision: every AI feature goes through OpenAI, on one key, so there
 * is one account, one bill and one data agreement to keep track of. Nothing
 * else in the API imports the SDK; a feature asks this file for a
 * TextClient (plain text back) or a DocumentClient (files in, JSON back),
 * and gets its answer or an AiUnavailableError.
 *
 * What is sent is the caller's business. Text requests never carry personal
 * data: no customer, owner or staff names, phones or addresses. The one
 * exception is the garage import, which sends the documents a garage gave
 * Detlio to join (owner decision, with a line in the privacy policy), and
 * only from the admin panel. See AGENTS.md.
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

/** The fake's answer when asked for points (the editor's Points mode, 0064). */
export const FAKE_AI_POINTS =
  'Full exterior clean by hand.\n- Foam wash and rinse\n- Wheels and tyres cleaned\n- Glass wiped inside and out'

/**
 * A client that never leaves the process. Used with AI_FAKE=1 and in tests.
 * Asked for points (lib/service-description.ts pointsInstructions), it
 * answers with points, as the real model is told to.
 */
export function fakeTextClient(answer: string = FAKE_AI_TEXT, pointsAnswer: string = FAKE_AI_POINTS): TextClient {
  return {
    complete: async (request) =>
      request.instructions.includes('on its own line starting with "- "') ? pointsAnswer : answer,
  }
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
          // The Responses API keeps every response for 30 days unless told
          // not to, and nothing here is ever fetched back.
          store: false,
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

// ─── Documents (photos and PDFs) ─────────────────────────────────────────────

/** One file to read, as the admin panel uploaded it. Held in memory only. */
export interface DocumentFile {
  name: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  dataBase64: string
}

/** Files to read into JSON of a given shape. */
export interface DocumentRequest {
  instructions: string
  files: DocumentFile[]
  /** The answer's JSON schema (strict structured output) and its name. */
  schemaName: string
  schema: Record<string, unknown>
  maxOutputTokens: number
}

/** Anything that reads files into JSON text: OpenAI, or a test's fake. */
export interface DocumentClient {
  /** The answer's JSON as text; '' when the model gave none (refused, cut off). */
  read(request: DocumentRequest): Promise<string>
}

/** A reader that never leaves the process: answers every request with `answer`. */
export function fakeDocumentClient(answer: string): DocumentClient {
  return { read: async () => answer }
}

interface OpenAiDocumentConfig {
  apiKey: string
  model: string
  /** Tests only, as for the text client. */
  fetch?: typeof fetch
}

/**
 * Photos and PDFs through the Responses API: images as `input_image` with a
 * base64 data URL, PDFs as `input_file` with `file_data` (the SDK's
 * ResponseInputImage and ResponseInputFile), and the answer held to a JSON
 * schema with structured output (`text.format`, type json_schema, strict).
 *
 * 50 seconds and no retry. The API runs as one Vercel function whose limit
 * is 60 seconds (vercel.json), and a vision call takes 15–40 s: a retry
 * would be cut off by the platform half-way, with the admin left waiting on
 * a request that can no longer answer. One try, then a plain "try again".
 *
 * `detail: 'high'` for images: posters are small print, photographed from
 * an arm's length.
 */
export function openAiDocumentClient({ apiKey, model, fetch }: OpenAiDocumentConfig): DocumentClient {
  const client = new OpenAI({ apiKey, timeout: 50_000, maxRetries: 0, ...(fetch && { fetch }) })

  return {
    async read({ instructions, files, schemaName, schema, maxOutputTokens }) {
      try {
        const response = await client.responses.create({
          model,
          instructions,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text:
                    files.length === 1
                      ? 'Read this document.'
                      : `Read these ${files.length} documents; they are about the same garage.`,
                },
                ...files.map((file) =>
                  file.mimeType === 'application/pdf'
                    ? {
                        type: 'input_file' as const,
                        filename: file.name,
                        file_data: `data:application/pdf;base64,${file.dataBase64}`,
                      }
                    : {
                        type: 'input_image' as const,
                        detail: 'high' as const,
                        image_url: `data:${file.mimeType};base64,${file.dataBase64}`,
                      }
                ),
              ],
            },
          ],
          text: { format: { type: 'json_schema', name: schemaName, schema, strict: true } },
          max_output_tokens: maxOutputTokens,
          // Without this the Responses API keeps the response, garage files
          // and all, for at least 30 days (store defaults to true). We
          // promise the files aren't stored, so ask for that.
          store: false,
        })
        // Cut off by the token ceiling, or refused: there is no complete
        // answer to use, and the caller says it couldn't read the file.
        if (response.status === 'incomplete') return ''
        return response.output_text ?? ''
      } catch (err) {
        if (err instanceof OpenAI.OpenAIError) {
          throw new AiUnavailableError(err.message, err)
        }
        throw err
      }
    },
  }
}

export interface DocumentClientConfig {
  apiKey: string | undefined
  model: string
  fake: boolean
  /** What the fake answers, when `fake` is on. */
  fakeAnswer: string
}

/** The reader the config allows, or null when AI is switched off. */
export function documentClientFor({ apiKey, model, fake, fakeAnswer }: DocumentClientConfig): DocumentClient | null {
  if (fake) return fakeDocumentClient(fakeAnswer)
  if (!apiKey) return null
  return openAiDocumentClient({ apiKey, model })
}
