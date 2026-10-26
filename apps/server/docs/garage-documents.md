# Garage documents: setup

Garages upload their documents in the partner portal (Settings → Documents),
the team checks them in admin (a garage's edit page → Documents), and when
the four required ones are approved, customers see a **Documents verified**
shield on the garage's card and page. It is separate from Verify
(`is_verified`), which still alone decides whether a garage is listed.

| Document | | What to upload |
| --- | --- | --- |
| Shop photo | required | The shop front with its name board |
| Owner ID | required | PAN card, or Aadhaar **with the first 8 digits covered** |
| Bank proof | required | A cancelled cheque, or the passbook / statement page with the payout account |
| Signed Detlio agreement | required | Usually uploaded by admin |
| GST certificate | optional | |
| Trade licence | optional | With an optional expiry date |

The feature stays **off** until `R2_DOCS_BUCKET` is set in the Vercel
environment of the API (`api.detlio.com`). Off means: every documents route
answers 404, the portal has no Documents row, admin has no Documents tab or
"Documents to review" chip, and no garage shows the badge. Migration
`0043_garage_documents` (two new tables) is applied by CI on merge either way.

## 1. Make a private bucket

These are ID cards and bank details, so they never go in the photo bucket
(`R2_BUCKET`), which is public.

1. Cloudflare dashboard → **R2** → *Create bucket*. Name it, for example,
   `detlio-garage-documents`. Location: *Automatic* (or Asia-Pacific).
2. Open the bucket → **Settings**:
   - **Public access**: leave *R2.dev subdomain* **disabled**, and add **no
     custom domain**. Nothing in this bucket should ever have a public URL.
   - **CORS policy** → *Add CORS policy*, so the portal, admin and the
     customer app can upload straight to it (opening a file is a plain new
     tab and needs no CORS). The customer app is there because **job photos**
     live in this bucket too (customers' car photos and redo-claim photos;
     see "Job photos" below):

     ```json
     [
       {
         "AllowedOrigins": ["https://vendor.detlio.com", "https://admin.detlio.com", "https://detlio.com", "https://www.detlio.com"],
         "AllowedMethods": ["PUT"],
         "AllowedHeaders": ["Content-Type"],
         "MaxAgeSeconds": 3600
       }
     ]
     ```

     Add a preview's origin only if previews should take uploads.
3. **Keys.** The API's existing R2 token (`R2_ACCESS_KEY_ID` /
   `R2_SECRET_ACCESS_KEY`) must be able to read and write this bucket too. If
   that token is scoped to the photo bucket only, edit it (R2 → *Manage API
   tokens*) and add the new bucket with *Object Read & Write*. No other key is
   needed: the account and keys are shared, the bucket is not.
4. Set `R2_DOCS_BUCKET=detlio-garage-documents` in Vercel → the API project →
   *Settings → Environment Variables* (Production; Preview only if wanted), and
   **redeploy the API**.
5. Check: in the garage portal, Settings shows a **Documents** row; in admin, a
   garage's edit page has a **Documents** tab.

## How it works

- **Upload**: the browser re-encodes a photo first (`stripImageMetadata`,
  dropping location data; a PDF is sent as it is), asks the API for an upload
  link signed for that exact type and size (10 MB at most, JPEG / PNG / WebP /
  PDF), PUTs the file straight to the bucket, then tells the API. The API
  checks the file is there, in the garage's own folder
  (`vendors/<garage>/documents/<type>/<uuid>.<ext>`), the right type and size,
  and records it as **Waiting for review**. One or two files per document
  (front and back).
- **Replace**: uploading a document again replaces it and sends it back for
  review (the badge goes until it is approved again). The old files are deleted
  from the bucket; no history of ID or bank proof is kept.
- **Review**: admin opens each file (a link that works for **5 minutes**, made
  for that press, never stored or logged), then Approve or Reject with a reason
  the garage reads. Admin can upload on a garage's behalf (the agreement,
  mostly) and mark it approved at once. Every review names the version it was
  made on, so a garage uploading again meanwhile is never approved unseen
  (409 `DOCUMENT_CHANGED`).
- **Who can open them**: the garage's owner seat (an Admin member of its team)
  and Detlio's super-admins. Not operators, not other garages, not customers.
  Customers only ever see the yes/no `documentsVerified`.
- **Alerts**: the team's Telegram group gets "📄 Documents to review: <garage>"
  with the kind of document and a link to the admin tab. Never a file.
- **The Bin**: moving a garage to the Bin keeps its documents. **Delete
  forever** removes them (rows, then files after the commit, best effort);
  when bookings with real money are kept and the garage stays as a tombstone,
  only the signed agreement stays with them. The pilot reset never touches
  documents.

## Turning it off

Remove `R2_DOCS_BUCKET` and redeploy: the routes go back to 404 and the
section disappears. Nothing is deleted; setting it again brings everything
back as it was.

## Job photos

Job photos (the garage's before/after, customers' car photos, extra-work and
redo-claim photos) use this bucket as well, under
`vendors/<garage>/job-photos/<booking>/…`, apart from the documents'
`vendors/<garage>/documents/…`. Setting `R2_DOCS_BUCKET` is what makes them
private: new uploads go here, rows store the key, and every app is handed a
link that works for 10–15 minutes (`lib/job-photo-storage.ts`). Photos taken
before that keep their public address until they are moved (the one-off move
in the "keep job photos private" PR). With the variable unset, job photos stay
in the public photo bucket, as before.
