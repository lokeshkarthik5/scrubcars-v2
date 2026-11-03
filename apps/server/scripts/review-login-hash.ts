/**
 * Makes the value for REVIEW_LOGIN_CODE_HASH from the review code, read from
 * standard input so it never lands in a shell's history or the process list:
 *
 *   read -rs -p "Review code (6 digits): " CODE; echo
 *   printf '%s' "$CODE" | bun run --cwd apps/server review-login:hash
 *
 * Prints one line (base64url, no characters a shell would expand). Run it
 * anywhere: it needs no database and no secret.
 */
import { text } from 'node:stream/consumers'
import { makeReviewCodeHash } from '../src/lib/review-login.js'

const code = (await text(process.stdin)).trim()

if (!/^\d{6}$/.test(code)) {
  console.error('The review code must be exactly 6 digits (it is typed into the app\'s code boxes).')
  process.exit(1)
}

console.log(await makeReviewCodeHash(code))
