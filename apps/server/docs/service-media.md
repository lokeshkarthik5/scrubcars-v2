# Service photos and videos: setup

Garages (from their own app) and admin add up to 3 photos and one video of at
most 60 seconds to each service. Customers see them on the garage page. Admin
can also make a sample picture with AI for a service that has no real photo;
it shows only in the admin and garage editors, never to customers.

Photos already work: they use R2, like every other upload. **Video** and **AI
pictures** stay switched off until the settings below are in the Vercel
environment of the API (`api.detlio.com`). Off means the apps show no video
slot and no AI button, and their routes answer 404. Keys go in Vercel only,
never in git or a chat.

Migration `0033_service_media` (new columns only) is applied by CI on merge.

## 1. Video: Cloudflare Stream

Stream stores each video, makes the adaptive versions (up to Full HD when the
phone recorded at that size), serves the poster, and tells the API when a
video is ready. It is billed per minute stored and per minute watched; the
first bill shows the real figure for our numbers.

1. **Turn on Stream.** Cloudflare dashboard → *Stream* → subscribe (the same
   account that holds R2).
2. **Account id.** Shown on the right of the dashboard's account home, or in
   the URL (`dash.cloudflare.com/<account id>/…`). Set it as
   `CLOUDFLARE_ACCOUNT_ID`.
3. **API token.** My Profile → *API Tokens* → *Create Token* → *Create Custom
   Token*. Permissions: **Account → Stream → Edit**, and nothing else. Account
   resources: only the Detlio account. Set it as `CLOUDFLARE_STREAM_API_TOKEN`.
4. **Customer code.** Stream → upload any short test video → open it → the
   embed or HLS link looks like
   `https://customer-<code>.cloudflarestream.com/…`. Set `<code>` as
   `CLOUDFLARE_STREAM_CUSTOMER_CODE`. Delete the test video afterwards.
5. **Webhook.** Stream has one webhook per account, set through the API. With
   the token from step 3 (in your terminal, not in a file):

   ```sh
   curl -X PUT \
     "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/stream/webhook" \
     -H "Authorization: Bearer $CLOUDFLARE_STREAM_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"notificationUrl":"https://api.detlio.com/api/v1/webhooks/cloudflare-stream"}'
   ```

   The answer contains `"secret": "…"`. Set it as
   `CLOUDFLARE_STREAM_WEBHOOK_SECRET`. Running the command again issues a new
   secret, so update the variable if you ever do.
6. **Redeploy the API** so it reads the four variables. Then, in the garage
   app, open Services: each service shows "Add video · up to 60 sec".

If the webhook is ever missing, nothing is lost: while a video shows
"Processing…", the upload block asks the API every few seconds, and the API
asks Stream directly.

## 2. AI sample pictures: OpenAI

1. platform.openai.com → *API keys* → create a key for the Detlio project
   (the same key as the AI descriptions, if that is already set up). Make sure
   the project has billing and image generation enabled.
2. Set it as `OPENAI_API_KEY` and redeploy the API.
3. Optional: `AI_IMAGE_MODEL` (default `chatgpt-image-latest`, OpenAI's name
   for the ChatGPT image model) and `AI_PICTURES_PER_HOUR` (default 20 presses
   per admin per hour; each press makes two pictures, about ₹8).

What is sent to OpenAI: the admin's description (pre-filled from the service
name and category; email addresses, phone numbers and number plates are
removed) plus a fixed style line. Nothing about customers or bookings.

## 3. R2: clear unused AI pictures

The two options wait under `ai-temp/` in the bucket until admin picks one;
the picked one is copied out and both are removed. Options of a sheet closed
without picking stay behind, so add one lifecycle rule: R2 → the bucket →
*Settings* → *Object lifecycle rules* → *Add rule*: prefix `ai-temp/`, delete
objects **1 day** after upload.

## Privacy

Every upload needs the tick "No number plates or faces can be read, or the
owner agreed". The API refuses an upload without it (`MEDIA_CONSENT_REQUIRED`)
and stores when it was given. AI pictures are never shown to customers: the
API leaves them out of every customer response, and a service without the
garage's own photos shows its category icon instead. Admin still sees them,
tagged "Sample", in its editor.

## Tests

The E2E suite never reaches Cloudflare or OpenAI: `STREAM_FAKE=1` and
`AI_FAKE=1` in `apps/e2e/.env.e2e`. The API refuses to start with either set
in production.
