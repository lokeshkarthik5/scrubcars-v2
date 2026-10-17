import { describe, expect, test } from 'bun:test'
import {
  AiUnavailableError,
  documentClientFor,
  openAiDocumentClient,
  openAiTextClient,
  textClientFor,
} from './ai.js'

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
      store: false,
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

describe('openAiDocumentClient', () => {
  const REQUEST = {
    instructions: 'Read the garage.',
    files: [
      { name: 'poster.jpg', mimeType: 'image/jpeg' as const, dataBase64: '/9j/AAAA' },
      { name: 'form.pdf', mimeType: 'application/pdf' as const, dataBase64: 'JVBERi0x' },
    ],
    schemaName: 'garage_reading',
    schema: { type: 'object', additionalProperties: false, required: [], properties: {} },
    maxOutputTokens: 16000,
  }
  const answer = (status: string, text: string) => ({
    id: 'resp_test',
    object: 'response',
    status,
    output: [
      {
        type: 'message',
        id: 'msg_test',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
  })

  test('sends images as data URLs and PDFs as file data, held to the JSON schema', async () => {
    const { fetch, requests } = cannedFetch(200, answer('completed', '{"readable":true}'))
    const client = openAiDocumentClient({ apiKey: 'sk-test', model: 'gpt-test', fetch })
    expect(await client.read(REQUEST)).toBe('{"readable":true}')
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toEndWith('/responses')
    expect(requests[0].body).toEqual({
      model: 'gpt-test',
      instructions: REQUEST.instructions,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Read these 2 documents; they are about the same garage.' },
            { type: 'input_image', detail: 'high', image_url: 'data:image/jpeg;base64,/9j/AAAA' },
            { type: 'input_file', filename: 'form.pdf', file_data: 'data:application/pdf;base64,JVBERi0x' },
          ],
        },
      ],
      text: { format: { type: 'json_schema', name: 'garage_reading', schema: REQUEST.schema, strict: true } },
      max_output_tokens: 16000,
      // The files must not be kept in OpenAI's response store.
      store: false,
    })
  })

  test('an answer cut off by the token ceiling is no answer', async () => {
    const { fetch } = cannedFetch(200, answer('incomplete', '{"readable":tr'))
    const client = openAiDocumentClient({ apiKey: 'sk-test', model: 'gpt-test', fetch })
    expect(await client.read(REQUEST)).toBe('')
  })

  test('an SDK error is AiUnavailableError, and is never retried', async () => {
    const { fetch, requests } = cannedFetch(500, { error: { message: 'Server error', type: 'server_error' } })
    const client = openAiDocumentClient({ apiKey: 'sk-test', model: 'gpt-test', fetch })
    await expect(client.read(REQUEST)).rejects.toBeInstanceOf(AiUnavailableError)
    // One try: a retry would outlast the function's 60 s.
    expect(requests).toHaveLength(1)
  })
})

describe('documentClientFor', () => {
  test('off without a key; the fake with AI_FAKE, answering its fixed reading', async () => {
    expect(documentClientFor({ apiKey: undefined, model: 'gpt-test', fake: false, fakeAnswer: '{}' })).toBeNull()
    const fake = documentClientFor({ apiKey: undefined, model: 'gpt-test', fake: true, fakeAnswer: '{"a":1}' })
    expect(await fake?.read({ instructions: '', files: [], schemaName: 'x', schema: {}, maxOutputTokens: 1 })).toBe('{"a":1}')
    expect(documentClientFor({ apiKey: 'sk-test', model: 'gpt-test', fake: false, fakeAnswer: '{}' })).not.toBeNull()
  })
})
