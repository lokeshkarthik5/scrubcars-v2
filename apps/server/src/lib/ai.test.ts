import { describe, expect, test } from 'bun:test'
import { AiUnavailableError, openAiTextClient, textClientFor } from './ai.js'

// The real OpenAI client, with a stand-in for the network: canned answers in
// place of api.openai.com, so nothing leaves the process.

/** A fetch that answers every request with `status` and `body`, and remembers the requests. */
function cannedFetch(status: number, body: unknown) {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof globalThis.fetch
  return { fetch, requests }
}

const REQUEST = { instructions: 'Write one sentence.', input: 'Service: Foam wash', maxOutputTokens: 1000 }

describe('openAiTextClient', () => {
  test('asks the Responses API with the model and reads the text out', async () => {
    const { fetch, requests } = cannedFetch(200, {
      id: 'resp_test',
      object: 'response',
      status: 'completed',
      output: [
        {
          type: 'message',
          id: 'msg_test',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Foam wash and hand dry.', annotations: [] }],
        },
      ],
    })
    const client = openAiTextClient({ apiKey: 'sk-test', model: 'gpt-test', fetch })
    expect(await client.complete(REQUEST)).toBe('Foam wash and hand dry.')
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toEndWith('/responses')
    expect(requests[0].body).toEqual({
      model: 'gpt-test',
      instructions: REQUEST.instructions,
      input: REQUEST.input,
      max_output_tokens: REQUEST.maxOutputTokens,
    })
  })

  test('an SDK error (here a bad key) becomes AiUnavailableError', async () => {
    const { fetch, requests } = cannedFetch(401, {
      error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' },
    })
    const client = openAiTextClient({ apiKey: 'sk-test', model: 'gpt-test', fetch })
    await expect(client.complete(REQUEST)).rejects.toBeInstanceOf(AiUnavailableError)
    // A bad key is not retried.
    expect(requests).toHaveLength(1)
  })
})

describe('textClientFor', () => {
  test('off without a key; the fake with AI_FAKE, key or not', async () => {
    expect(textClientFor({ apiKey: undefined, model: 'gpt-test', fake: false })).toBeNull()
    expect(textClientFor({ apiKey: '', model: 'gpt-test', fake: false })).toBeNull()
    const fake = textClientFor({ apiKey: undefined, model: 'gpt-test', fake: true })
    expect(fake).not.toBeNull()
    expect(textClientFor({ apiKey: 'sk-test', model: 'gpt-test', fake: false })).not.toBeNull()
  })
})
