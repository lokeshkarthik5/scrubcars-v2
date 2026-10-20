import { describe, expect, test } from 'bun:test'

// razorpay.ts reads the app's env, which insists on a database URL.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
const { RazorpayRefundError, readCreatedRefund, readRefundList } =
  await import('./razorpay.js')

const refund = {
  id: 'rfnd_ABC123',
  payment_id: 'pay_SEED',
  amount: 49900,
  status: 'pending',
  notes: [],
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 })

/** A 2xx whose body breaks off mid-read, as a timeout during the read does. */
const cutOff = () =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"id":"rfnd_'))
        controller.error(
          new DOMException('The operation timed out.', 'TimeoutError')
        )
      },
    }),
    { status: 200 }
  )

/** No answer: what a call that never came back throws, so the callers treat it the same. */
async function expectNoAnswer(read: Promise<unknown>) {
  const error = await read.then(
    () => null,
    (err: unknown) => err
  )
  expect(error).toBeInstanceOf(RazorpayRefundError)
  expect(error).toMatchObject({ status: null, description: null })
}

describe('reading a refund Razorpay made', () => {
  test('the refund, with its notes as an object', async () => {
    expect(await readCreatedRefund(json(refund))).toEqual({
      id: 'rfnd_ABC123',
      paymentId: 'pay_SEED',
      amountPaise: 49900,
      status: 'pending',
      notes: {},
    })
  })

  test('a body that breaks off, is not JSON, or is not a refund is no answer', async () => {
    await expectNoAnswer(readCreatedRefund(cutOff()))
    await expectNoAnswer(
      readCreatedRefund(
        new Response('<html>Bad gateway</html>', { status: 200 })
      )
    )
    await expectNoAnswer(readCreatedRefund(json(null)))
    await expectNoAnswer(readCreatedRefund(json({ entity: 'refund' })))
  })
})

describe("reading a payment's refunds", () => {
  test('every refund listed, and none when there are none', async () => {
    expect(
      (await readRefundList(json({ items: [refund] }))).map((r) => r.id)
    ).toEqual(['rfnd_ABC123'])
    expect(await readRefundList(json({ count: 0 }))).toEqual([])
  })

  test('a body that breaks off, is not JSON, or holds no refunds list is no answer', async () => {
    await expectNoAnswer(readRefundList(cutOff()))
    await expectNoAnswer(
      readRefundList(new Response('{"items":', { status: 200 }))
    )
    await expectNoAnswer(readRefundList(json({ items: 'none' })))
    await expectNoAnswer(readRefundList(json({ items: [refund, { id: 7 }] })))
  })
})
