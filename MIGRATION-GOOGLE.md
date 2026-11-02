# Moving the SEA app to Google AI Studio

The app now runs on Google as well as on Vercel. On Google it uses:

| What | On Vercel (today) | On Google |
|---|---|---|
| The app itself | Vercel | Cloud Run, deployed from Google AI Studio (Build) |
| Attempts, answers, published question sets, settings | Upstash Redis | **Firestore** (chosen automatically on Cloud Run) |
| Uploaded images, audio, video | Vercel Blob | **Cloud Storage** bucket (`MEDIA_BUCKET`) |
| Results Sheet and questions Sheet | Apps Script | Same, unchanged |
| Files that came with the app | In the code | Same, unchanged |

Nothing changes for candidates or evaluators: same pages, same Sheets, same rules.

Keep the Vercel app running until the last step, so candidates are never without a working link.

---

## 1. Import the code into AI Studio

1. Open **Google AI Studio → Build**, with the company Google account that should own the app.
2. In the prompt box, click **+ → Import from GitHub** and pick **marcklan-eng/mmm-assessments** (branch `main`).
3. **Don't ask the AI Studio assistant to change or "improve" the code.** These are live assessments. If it offers changes, decline. The app is ready to deploy as it is (it includes a `Dockerfile` for Cloud Run).

## 2. Set up Firestore and the media bucket (Google Cloud console)

AI Studio deploys into a Google Cloud project. Open that project in **console.cloud.google.com**. Billing must be on, because Cloud Run, Firestore and Cloud Storage need it.

1. **Firestore:** go to **Firestore → Create database**.
   - Mode: **Native**. Database ID: **(default)**.
   - Location: pick the same region as the app, e.g. `asia-southeast1` (Singapore).
2. **Cloud Storage:** go to **Cloud Storage → Buckets → Create**.
   - Name it, e.g. `mmm-sea-media`, in the same region.
   - Keep **Prevent public access** on, with uniform access control. The app serves files to signed-in people only.
3. **Permissions:** open **Cloud Run**, then your service, then **Security**, and note its *service account*. In **IAM → Grant access**, give that account:
   - **Cloud Datastore User** (for Firestore)
   - **Storage Object Admin**, on the bucket only (Bucket → Permissions → Grant access)

## 3. Add the settings (AI Studio → Settings → Secrets)

Copy these from **Vercel → Project → Settings → Environment Variables**. Use the same values unless a different one is given.

| Name | Value |
|---|---|
| `STORAGE` | `firestore` |
| `MEDIA_BUCKET` | the bucket name from step 2, e.g. `mmm-sea-media` |
| `NEXTAUTH_SECRET` | same as Vercel (otherwise everyone is signed out) |
| `NEXTAUTH_URL` | the new app address. Fill it in after the first deploy (step 4) and redeploy. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | same as Vercel |
| `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | only if they're set in Vercel |
| `SHEET_WEBHOOK_URL`, `SHEET_WEBHOOK_SECRET` | same as Vercel (results Sheet) |
| `QUESTIONS_WEBHOOK_URL`, `QUESTIONS_WEBHOOK_SECRET` | same as Vercel (questions Sheet) |
| `ADMIN_EMAILS`, `DEMO_MODE`, `LINK_EXPIRY_HOURS` | only if they're set in Vercel |

**Only for copying the old data** (step 6; remove them after the switch):

| Name | Value |
|---|---|
| `OLD_KV_REST_API_URL` | Vercel's `KV_REST_API_URL` (or `UPSTASH_REDIS_REST_URL`) |
| `OLD_KV_REST_API_TOKEN` | Vercel's `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_TOKEN`) |
| `OLD_BLOB_READ_WRITE_TOKEN` | Vercel's `BLOB_READ_WRITE_TOKEN`, only if files were uploaded on Vercel |

Don't add `KV_REST_API_URL`, `KV_REST_API_TOKEN` or `BLOB_READ_WRITE_TOKEN` under their **normal** names. Use the `OLD_` names, or the app keeps writing to the old storage.

## 4. Deploy

1. Click **Deploy** in AI Studio. When it finishes, copy the app's address, e.g. `https://mmm-sea-xxxxx.a.run.app`.
2. Set `NEXTAUTH_URL` to that address and deploy again.
3. Recommended Cloud Run settings (Cloud Run → service → **Edit & deploy new revision**):
   - Memory **1 GiB**
   - Request timeout **300 seconds** (the data import needs it)
   - Minimum instances **1** while candidates are taking assessments, to avoid a few seconds' wait on the first visit

## 5. Let Google sign-in work on the new address

In the Google Cloud project that holds the sign-in client (the one `GOOGLE_CLIENT_ID` comes from), go to **APIs & Services → Credentials** and open the OAuth client.

- **Authorized JavaScript origins:** add `https://<new address>`
- **Authorized redirect URIs:** add `https://<new address>/api/auth/callback/google`

Keep the Vercel entries until the switch is done.

## 6. Check, then copy the old data

1. Open `https://<new address>/api/health`. You should see:
   - `storage`: **firestore: connected**
   - `googleSheet` and `questionsSheet`: **connected**
2. Sign in and open the **dashboard**. There's an **Import old data** button next to Questions & media.
3. Click **Import everything from the old app**. It copies every attempt, candidate record, published question set, setting (such as link expiry) and uploaded file.
4. Check the numbers on the dashboard match the Vercel dashboard.

Running the import again is safe; it copies everything again.

## 7. Test before switching

Use a test email, then delete the test attempt afterwards (**Delete attempt…**). Check that:

- An assessment can be taken start to finish, and a row appears in the results Sheet.
- The dashboard, attempt page and CSV export show it.
- **Questions & media** lists the assessments, **Preview** works, and an image can be uploaded and shown.
- Audio and video play in an assessment that has them (e.g. Medical Receptionist, Medical Scribe).

## 8. Switch over (go-live day)

1. Run the import once more (step 6), to pick up anyone who finished on Vercel in the meantime.
2. Ask the Salesforce team to change the invitation email links to `https://<new address>/a/<assessment>`. All the links are on the new app's home page.
3. Set `DEMO_MODE` to `false` (if not already) and deploy.
4. A few days later, when no one is mid-assessment on Vercel:
   - Remove the `OLD_…` secrets.
   - Remove the Vercel entries from the Google sign-in client.
   - Pause or delete the Vercel project.

### Optional: your own address

To use an address like `sea.mymountainmover.com` instead of the `run.app` one:

1. Add a **custom domain mapping** to the Cloud Run service.
2. Update `NEXTAUTH_URL` and the sign-in client (step 5) with the new address.
3. Use it in the Salesforce links.
