import { describe, expect, test } from 'bun:test'
import { AiUnavailableError, FAKE_AI_POINTS, FAKE_AI_TEXT, fakeTextClient, type TextClient, type TextRequest } from './ai.js'
import {
  cleanDescription,
  cleanPoints,
  pointsProblem,
  descriptionInput,
  descriptionProblem,
  writeServiceDescription,
  type ServiceFacts,
} from './service-description.js'

const FACTS: ServiceFacts = {
  name: 'Foam wash',
  categoryLabel: 'Car wash',
  pricingType: 'per_vehicle',
  garageName: 'Next Level Auto Detailing',
}

/** Answers in turn, and remembers what it was asked. Never leaves the process. */
function scriptedClient(answers: string[]): TextClient & { asked: TextRequest[] } {
  const asked: TextRequest[] = []
  return {
    asked,
    complete: async (request) => {
      asked.push(request)
      return answers[Math.min(asked.length - 1, answers.length - 1)]
    },
  }
}

describe('descriptionProblem', () => {
  test('a plain sentence or two is fine', () => {
    expect(descriptionProblem(FAKE_AI_TEXT, false)).toBeNull()
    expect(
      descriptionProblem('Exterior foam wash and hand dry. Wheels and glass cleaned too.', false)
    ).toBeNull()
  })

  test('empty, too long, three sentences or no full stop', () => {
    expect(descriptionProblem('', false)).toBe('It was empty.')
    expect(descriptionProblem(`${'Foam wash and dry, '.repeat(12)}done.`, false)).toMatch(/limit is 200/)
    expect(descriptionProblem('One. Two. Three.', false)).toBe('It was more than two sentences.')
    expect(descriptionProblem('Foam wash and hand dry', false)).toBe('It did not end with a full stop.')
    expect(descriptionProblem('A shiny car!', false)).toBe('It used an exclamation or question mark.')
  })

  test('the copy rules, and the claims a model reaches for', () => {
    expect(descriptionProblem('Lifetime shine for your paint.', false)).toMatch(/"lifetime"/)
    expect(descriptionProblem('Guaranteed spotless finish.', false)).toMatch(/"guaranteed"/)
    expect(descriptionProblem('The best wash for your car.', false)).toMatch(/"best"/)
    expect(descriptionProblem('Removes 100% of dirt.', false)).toMatch(/"100%"/)
    expect(descriptionProblem('A permanent protective layer.', false)).toMatch(/"permanent"/)
  })

  test('no prices; no times unless the admin gave one', () => {
    expect(descriptionProblem('A full wash for just ₹499.', false)).toBe('It mentioned a price or money.')
    expect(descriptionProblem('A full wash for Rs 499.', false)).toBe('It mentioned a price or money.')
    expect(descriptionProblem('Done in 45 minutes.', false)).toBe('It mentioned how long the service takes.')
    expect(descriptionProblem('Takes about two hours.', false)).toBe('It mentioned how long the service takes.')
    expect(descriptionProblem('Done in about 45 minutes.', true)).toBeNull()
  })
})

describe('cleanDescription', () => {
  test('one line, without the quotes and label a model sometimes adds', () => {
    expect(cleanDescription('  "Foam wash and\n hand dry."  ')).toBe('Foam wash and hand dry.')
    expect(cleanDescription('Description: Foam wash.')).toBe('Foam wash.')
  })
})

describe('descriptionInput', () => {
  test('service facts and the business name only', () => {
    expect(descriptionInput({ ...FACTS, durationMins: 90 })).toBe(
      [
        'Service: Foam wash',
        'Category: Car wash',
        'Pricing: priced by car type (hatchback, sedan, SUV)',
        'Takes about: 90 minutes',
        'Garage: Next Level Auto Detailing',
      ].join('\n')
    )
    expect(descriptionInput({ ...FACTS, garageName: undefined, durationMins: 120 })).toBe(
      [
        'Service: Foam wash',
        'Category: Car wash',
        'Pricing: priced by car type (hatchback, sedan, SUV)',
        'Takes about: 2 hours',
      ].join('\n')
    )
  })
})

describe('writeServiceDescription', () => {
  test('the fake client’s answer is accepted as it is', async () => {
    expect(await writeServiceDescription(FACTS, fakeTextClient())).toEqual({
      ok: true,
      description: FAKE_AI_TEXT,
    })
  })

  test('a rule-breaking answer is asked for once more, with the reason', async () => {
    const client = scriptedClient(['Lifetime protection for your paint.', 'Paint washed and sealed.'])
    expect(await writeServiceDescription(FACTS, client)).toEqual({
      ok: true,
      description: 'Paint washed and sealed.',
    })
    expect(client.asked).toHaveLength(2)
    expect(client.asked[1].input).toContain('Your last answer could not be used. It said "lifetime"')
    expect(client.asked[0].instructions).toContain('Do not say how long it takes.')
  })

  test('two bad answers are refused, never returned', async () => {
    const client = scriptedClient(['', 'Only ₹299 this week.'])
    expect(await writeServiceDescription(FACTS, client)).toEqual({
      ok: false,
      problem: 'It mentioned a price or money.',
    })
    expect(client.asked).toHaveLength(2)
  })

  test('OpenAI being unavailable is passed up, not retried here', async () => {
    let calls = 0
    const client: TextClient = {
      complete: async () => {
        calls++
        throw new AiUnavailableError('Rate limited')
      },
    }
    await expect(writeServiceDescription(FACTS, client)).rejects.toBeInstanceOf(AiUnavailableError)
    expect(calls).toBe(1)
  })
})

describe('the ready-made service templates', () => {
  // Loaded by path, as copy-rules.parity.test.ts loads its twin: packages/core
  // is not a dependency of the API.
  const templatesUrl = new URL('../../../../packages/core/src/service-templates.ts', import.meta.url).href

  test('every template description passes the same rules as an AI one', async () => {
    const { SERVICE_TEMPLATES } = (await import(templatesUrl)) as {
      SERVICE_TEMPLATES: Array<{ name: string; description: string }>
    }
    expect(SERVICE_TEMPLATES.length).toBeGreaterThan(0)
    for (const template of SERVICE_TEMPLATES) {
      expect({ name: template.name, problem: descriptionProblem(template.description, false) }).toEqual({
        name: template.name,
        problem: null,
      })
    }
  })
})

describe('points (0064: the editor’s Points mode)', () => {
  test('the answer is kept as an intro line and "- " points, full stops and labels dropped', () => {
    expect(cleanPoints('Description: "Full clean.\n\n• Foam wash.\n- Vacuum\n3. Tyre polish."')).toBe(
      'Full clean.\n- Foam wash\n- Vacuum\n- Tyre polish'
    )
  })

  test('3 to 6 short points, an intro of one sentence, and the paragraph’s claim and price rules', () => {
    expect(pointsProblem('- Foam wash\n- Vacuum\n- Tyre polish', false)).toBeNull()
    expect(pointsProblem('Full clean.\n- A\n- B\n- C', false)).toBeNull()
    expect(pointsProblem('- A\n- B', false)).toContain('It had 2 points')
    expect(pointsProblem(Array.from({ length: 7 }, (_, i) => `- P${i}`).join('\n'), false)).toContain('It had 7 points')
    expect(pointsProblem(`- ${'x'.repeat(61)}\n- B\n- C`, false)).toContain('A point was 61 characters')
    expect(pointsProblem('One. Two.\n- A\n- B\n- C', false)).toBe('The line before the points was more than one sentence.')
    expect(pointsProblem('- Lifetime shine\n- B\n- C', false)).toContain('lifetime')
    expect(pointsProblem('- Only ₹299\n- B\n- C', false)).toBe('It mentioned a price or money.')
    expect(pointsProblem('- Done in 45 minutes\n- B\n- C', false)).toBe('It mentioned how long the service takes.')
    expect(pointsProblem('- Done in 45 minutes\n- B\n- C', true)).toBeNull()
    expect(pointsProblem('- Wow!\n- B\n- C', false)).toBe('It used an exclamation or question mark.')
    expect(pointsProblem('', false)).toBe('It was empty.')
  })

  test('asked for points, the model is told the shape and its answer keeps it', async () => {
    const client = scriptedClient(['Full clean.\n- Foam wash.\n- Vacuum\n- Tyre polish'])
    expect(await writeServiceDescription(FACTS, client, 'points')).toEqual({
      ok: true,
      description: 'Full clean.\n- Foam wash\n- Vacuum\n- Tyre polish',
    })
    expect(client.asked[0].instructions).toContain('on its own line starting with "- "')
  })

  test('a paragraph where points were asked for is asked again, then refused', async () => {
    const client = scriptedClient(['A full wash of the car.', 'Still a paragraph.'])
    const result = await writeServiceDescription(FACTS, client, 'points')
    expect(result.ok).toBe(false)
    expect(client.asked).toHaveLength(2)
    expect(client.asked[1].input).toContain('It had 0 points')
  })

  test('the fake client answers points when asked for points, and passes the rules', async () => {
    expect(await writeServiceDescription(FACTS, fakeTextClient(), 'points')).toEqual({
      ok: true,
      description: FAKE_AI_POINTS,
    })
  })
})
