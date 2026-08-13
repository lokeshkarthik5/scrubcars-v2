#!/usr/bin/env node
/**
 * Detlio driver — drives the running app (web on :3000, API on :8080).
 *
 * The web app serves THREE surfaces off one Next.js server, split by Host
 * header in web/middleware.ts. This driver maps them to *.localhost hostnames,
 * which Chromium resolves to 127.0.0.1 without any /etc/hosts editing.
 *
 *   customer -> http://localhost:3000
 *   vendor   -> http://vendor.localhost:3000   (clean paths: /login /home /bookings ...)
 *   admin    -> http://admin.localhost:3000    (clean paths: /login /vendors /bookings)
 *
 * Usage:
 *   node .claude/skills/run-detlio/driver.mjs api  <METHOD> <path> [jsonBody]
 *   node .claude/skills/run-detlio/driver.mjs login <surface> [phone]
 *   node .claude/skills/run-detlio/driver.mjs run   <surface> <step> [step ...]
 *
 * Steps (run):
 *   goto:/path              navigate (relative to the surface origin)
 *   click:<sel>             click; <sel> is any Playwright selector, e.g. text=Continue
 *   fill:<sel>@@<value>     fill an input. The separator is @@, NOT = — selectors
 *                           themselves contain = (input[type=tel], text=Continue).
 *   press:<sel>@@<key>      press a key on an element (e.g. press:input@@Enter)
 *   keys:<text>             type on the keyboard (for the 6-box OTP input)
 *   waitfor:<sel>           wait for a selector to be visible (10s)
 *   wait:<ms>               sleep
 *   shot[:name]             screenshot -> /tmp/detlio-shots/<name>.png
 *   text                    dump visible body text
 *   html                    dump page HTML
 *   url                     print current URL
 *   eval:<js>               evaluate JS in the page, print the result
 *
 * Flags:
 *   --fresh      ignore saved cookies for this surface
 *   --desktop    1280x900 viewport (default is mobile 390x844 — the UI is mobile-first)
 *   --headed     run headed (needs a display; default headless)
 *
 * State: cookies persist per surface in /tmp/detlio-state-<surface>.json, so
 * `login` then `run` in a later invocation stays authenticated.
 */
import { chromium } from 'playwright'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'

const API = 'http://localhost:8080'
const SHOTS = '/tmp/detlio-shots'

const SURFACES = {
  customer: 'http://localhost:3000',
  vendor: 'http://vendor.localhost:3000',
  admin: 'http://admin.localhost:3000',
}

// server/src/modules/auth/auth.service.ts — BYPASS_PHONES skip OTP entirely:
// no SMS is sent and ANY 6-digit code verifies. This is the only way to log in
// locally; every other phone hits the real 2factor.in SMS provider.
const BYPASS_PHONES = ['7358197924', '9566141671', '8015676678']

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith('--')))
const args = argv.filter((a) => !a.startsWith('--'))
const [cmd, ...rest] = args

const statePath = (s) => `/tmp/detlio-state-${s}.json`
const die = (m) => {
  console.error(`ERROR: ${m}`)
  process.exit(1)
}

async function cmdApi() {
  const [method = 'GET', path = '/', body] = rest
  if (!path.startsWith('/')) die('path must start with /')
  const res = await fetch(`${API}${path}`, {
    method: method.toUpperCase(),
    headers: { 'content-type': 'application/json' },
    body: body ?? undefined,
  })
  console.log(`${res.status} ${method.toUpperCase()} ${path}`)
  console.log(await res.text())
}

async function launch(surface) {
  const origin = SURFACES[surface] ?? die(`unknown surface: ${surface}`)
  const browser = await chromium.launch({ headless: !flags.has('--headed') })
  const sp = statePath(surface)
  const ctx = await browser.newContext({
    viewport: flags.has('--desktop')
      ? { width: 1280, height: 900 }
      : { width: 390, height: 844 },
    storageState: !flags.has('--fresh') && existsSync(sp) ? sp : undefined,
  })
  const page = await ctx.newPage()
  const problems = []
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  return { browser, ctx, page, origin, sp, problems }
}

async function cmdLogin() {
  const [surface = 'customer', phone = BYPASS_PHONES[0]] = rest
  if (!BYPASS_PHONES.includes(phone))
    die(`phone ${phone} is not an OTP-bypass number; use one of ${BYPASS_PHONES.join(', ')}`)
  const audience = surface === 'vendor' ? 'vendor' : 'customer'
  const { browser, ctx, page, origin, sp, problems } = await launch(surface)

  // Drive login through the browser (not raw fetch) so the HttpOnly access +
  // refresh cookies are set on the :3000 origin the app actually reads from.
  // The requests go through web/app/api/v1/[...path]/route.ts, which forwards
  // every upstream Set-Cookie.
  await page.goto(`${origin}/`)
  const send = await page.request.post(`${origin}/api/v1/auth/otp/send`, {
    data: { phone, purpose: 'login', audience },
  })
  if (!send.ok()) die(`otp/send failed: ${send.status()} ${await send.text()}`)
  const verify = await page.request.post(`${origin}/api/v1/auth/otp/verify`, {
    data: { phone, otp: '123456', purpose: 'login', audience },
  })
  if (!verify.ok()) die(`otp/verify failed: ${verify.status()} ${await verify.text()}`)
  console.log(await verify.text())

  await ctx.storageState({ path: sp })
  console.log(`state saved -> ${sp}`)
  if (problems.length) console.log(problems.join('\n'))
  await browser.close()
}

async function cmdRun() {
  const [surface, ...steps] = rest
  if (!steps.length) die('need at least one step')
  const { browser, ctx, page, origin, sp, problems } = await launch(surface)
  mkdirSync(SHOTS, { recursive: true })
  let shotN = 0

  for (const step of steps) {
    const i = step.indexOf(':')
    const op = i === -1 ? step : step.slice(0, i)
    const arg = i === -1 ? '' : step.slice(i + 1)
    const [sel, ...v] = arg.split('@@')
    const val = v.join('@@')

    try {
    switch (op) {
      case 'goto':
        await page.goto(origin + arg, { waitUntil: 'domcontentloaded' })
        // Next dev compiles the route on first hit; give hydration a beat.
        await page.waitForTimeout(1200)
        console.log(`goto ${arg} -> ${page.url()}`)
        break
      case 'click':
        await page.click(arg, { timeout: 10_000 })
        await page.waitForTimeout(800)
        console.log(`click ${arg}`)
        break
      case 'fill':
        await page.fill(sel, val, { timeout: 10_000 })
        console.log(`fill ${sel} = ${val}`)
        break
      case 'press':
        await page.press(sel, val, { timeout: 10_000 })
        await page.waitForTimeout(500)
        console.log(`press ${sel} ${val}`)
        break
      // Types on the keyboard, not into a selector — needed for the 6-box OTP
      // input (components/sc/otp-input.tsx), which is six maxLength=1 inputs
      // that auto-advance focus. `fill` can only reach one box.
      case 'keys':
        await page.keyboard.type(arg, { delay: 60 })
        await page.waitForTimeout(500)
        console.log(`keys ${arg}`)
        break
      case 'waitfor':
        await page.waitForSelector(arg, { state: 'visible', timeout: 10_000 })
        console.log(`visible ${arg}`)
        break
      case 'wait':
        await page.waitForTimeout(Number(arg) || 1000)
        break
      case 'shot': {
        const name = arg || `shot-${++shotN}`
        const file = `${SHOTS}/${name}.png`
        await page.screenshot({ path: file, fullPage: true })
        console.log(`shot -> ${file}`)
        break
      }
      case 'text':
        console.log('--- visible text ---')
        console.log((await page.innerText('body')).trim())
        console.log('--- end ---')
        break
      case 'html': {
        const file = `${SHOTS}/page.html`
        writeFileSync(file, await page.content())
        console.log(`html -> ${file}`)
        break
      }
      case 'url':
        console.log(page.url())
        break
      case 'eval':
        console.log(JSON.stringify(await page.evaluate(arg), null, 2))
        break
      default:
        die(`unknown step: ${step}`)
    }
    } catch (err) {
      // Screenshot the failure before bailing — a selector that times out is
      // almost always "the page isn't where you think it is".
      const file = `${SHOTS}/failure.png`
      await page.screenshot({ path: file, fullPage: true }).catch(() => {})
      console.error(`\nSTEP FAILED: ${step}\n${err.message.split('\n')[0]}`)
      console.error(`url: ${page.url()}\nscreenshot: ${file}`)
      if (problems.length) console.error([...new Set(problems)].join('\n'))
      await browser.close()
      process.exit(1)
    }
  }

  await ctx.storageState({ path: sp })
  if (problems.length) {
    console.log('--- page problems ---')
    console.log([...new Set(problems)].join('\n'))
  }
  await browser.close()
}

const commands = { api: cmdApi, login: cmdLogin, run: cmdRun }
const fn = commands[cmd]
if (!fn) die(`usage: driver.mjs <api|login|run> ...  (see header of this file)`)
await fn()
