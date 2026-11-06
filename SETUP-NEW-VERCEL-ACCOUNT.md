# Moving the SEA app to a new Vercel account

This zip holds the whole app: code, assessments, audio and video. It has **no passwords and no candidate data**.
You copy the data from the old app after the new one is running (step 6), using the app's **Import old data** button.

Keep the old app running until the last step, so candidates are never without a working link.

---

## 1. Put the code on GitHub (new owner's account)

1. Unzip this file.
2. On GitHub, signed in as the new owner: **+ → New repository**. Name it `mmm-assessments`, choose **Private**, and click **Create repository**.
3. Click **uploading an existing file**. Drag in **everything inside** the unzipped folder (not the folder itself). Then click **Commit changes**.
   - GitHub takes up to 100 files at a time. If it complains, upload `private-assets` first, then the rest.
   - Check that hidden files came along too: `.gitignore`, `.env.example` and `.dockerignore`. If your computer hides them, upload them separately.

## 2. Create the Vercel project

1. In the new Vercel account: **Add New → Project**, import `mmm-assessments` from GitHub, then **Deploy**.
2. The first deploy works, but shows the "not set up" state. That's expected.
3. Note the new address, e.g. `https://mmm-assessments-xxxx.vercel.app`.

## 3. Add storage

In the new project, open **Storage**:

1. **Create → Upstash (Redis) → Free plan → Connect to project.** This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` by itself.
2. **Create → Blob → Connect to project.** This adds `BLOB_READ_WRITE_TOKEN` by itself. Choose **private** access if it asks.

## 4. Add the settings

Go to **Settings → Environment Variables**. Copy the values from the old project, or from where each one comes from.

| Name | Value |
|---|---|
| `NEXTAUTH_SECRET` | a long random string. Using the same one as the old app is fine. |
| `NEXTAUTH_URL` | the new address from step 2 |
| `DEMO_MODE` | `true` while testing; `false` at go-live |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | same as the old app |
| `QUESTIONS_WEBHOOK_URL`, `QUESTIONS_WEBHOOK_SECRET` | Live SEA Questions script: same as the old app |
| `SHEET_WEBHOOK_URL`, `SHEET_WEBHOOK_SECRET` | SEA Result 2026 script: same as the old app |
| `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | only if the old app has them |
| `ADMIN_EMAILS`, `LINK_EXPIRY_HOURS` | only if the old app has them |

**Only for copying the old data** (step 6). Delete these after go-live.

| Name | Value |
|---|---|
| `OLD_KV_REST_API_URL` | the **old** project's `KV_REST_API_URL` |
| `OLD_KV_REST_API_TOKEN` | the **old** project's `KV_REST_API_TOKEN` |
| `OLD_BLOB_READ_WRITE_TOKEN` | the **old** project's `BLOB_READ_WRITE_TOKEN` |

Get the old values in the old Vercel account: **Storage → (the store) → .env.local tab → Show secret**.
In the Environment Variables list they're hidden (Sensitive).

Then click **Deployments → ⋯ → Redeploy**.

## 5. Let Google sign-in work on the new address

In Google Cloud (project 844840892234): **APIs & Services → Credentials →** the OAuth client.

- **Authorized JavaScript origins:** add `https://<new address>`
- **Authorized redirect URIs:** add `https://<new address>/api/auth/callback/google`

Do the same in Azure if Microsoft sign-in is used (`/api/auth/callback/azure-ad`).
Keep the old entries until the switch is done.

## 6. Check, then copy the old data

1. Open `https://<new address>/api/health`. `storage`, `googleSheet` and `questionsSheet` should say **connected**.
2. Sign in and open the **dashboard**. Click **Import old data**, then **Import everything from the old app**.
   This copies every attempt, candidate record, published question set, setting (such as link expiry) and uploaded file.
3. Check the numbers on the dashboard match the old dashboard.

Running the import again is safe; it copies everything again.

## 7. Test

Use a test email, and delete the test attempt afterwards (**Delete attempt…**). Check that:

- An assessment can be taken start to finish, and a row appears in the results Sheet.
- **Questions & media** lists the assessments, and **Preview** works.
- Audio and video play (e.g. Medical Receptionist, Medical Scribe).

## 8. Switch over (go-live day)

1. Run the import once more (step 6), to pick up anyone who finished on the old app in the meantime.
2. Choose the link:
   - **Easiest:** ask the Salesforce team to change the links to `https://<new address>/a/<assessment>`.
   - **Keep the old link** (`mmm-assessments.vercel.app`): delete or rename the old project first, so its address is freed. Keep its **storage** until step 4 below. The import reads the storage, not the project.
     Then, in the new project, add it under **Settings → Domains** right away, and update `NEXTAUTH_URL` and the Google sign-in client to match.
3. Set `DEMO_MODE` to `false` and redeploy.
4. A few days later:
   - Remove the `OLD_…` settings.
   - Remove the old entries from the Google sign-in client.
   - Delete the old project and its storage.
