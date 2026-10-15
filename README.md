# My Mountain Mover Skills Assessments (prototype)

A web app that runs the candidate skills assessments, with results going to a Google Sheet and an evaluator dashboard.
This prototype has the **Medical Biller** assessment loaded. The other eight show "Coming soon".

## How it works

| | |
|---|---|
| **Invite** | Salesforce sends the invite email with one shared link per assessment, e.g. `https://YOUR-APP.vercel.app/a/medical-biller`. Links for all 9 are listed on the app's home page. |
| **Sign-in** | Candidates sign in with Google or Microsoft, which confirms their email. |
| **Attempts** | One attempt per email per assessment every 6 months, whatever the result (pass, fail or timed out). |
| **Timer** | 30 minutes, enforced on the server. Closing the tab doesn't stop it, and they can resume with the time left. When time runs out, their answers are submitted. |
| **Results** | Candidates only see "Your assessment has been submitted." Score and pass/fail (80% = 24/30) go to the Sheet and the dashboard. |
| **Advanced RCM** | Offered after Medical Biller is completed, whatever the result. Blocked until then. |
| **Anti-cheating** | Fullscreen required. Questions blur when they leave the window. Copy/paste and right-click are blocked. Their email is watermarked on screen. Window switches, fullscreen exits, copy attempts and the Print Screen key are logged for evaluators. Question order and answer choices are shuffled per candidate. The answer key never reaches the browser. |
| **Dashboard** | `/admin`. Anyone the results Sheet is shared with **by email** can sign in. It shows totals, trends, section scores, most-missed questions with the most-picked wrong answer, candidate list with answers and activity log, filters and CSV export. |

## Before real candidates use it

1. Turn **off** `DEMO_MODE` (it allows sign-in with any email, no verification).
2. Connect Google sign-in, Microsoft sign-in, Upstash Redis and the Google Sheet (steps below).
3. Review the content notes at the bottom.

---

## Setup (about 45 minutes, one time)

You'll need: a GitHub account, a Vercel account, a Google account that owns the results Sheet, and a Microsoft account.

### 1. Put the code on GitHub and deploy to Vercel
1. Create a new **private** GitHub repository and upload this folder (everything except `node_modules`).
2. In Vercel: **Add New → Project**, import the repository, then **Deploy**. Note your app URL, e.g. `https://mmm-assessments.vercel.app`.

### 2. Add storage (Upstash Redis)
In your Vercel project: **Storage → Create → Upstash (Redis) → Free plan → Connect to project**.
This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.

### 3. Add the basic settings
In Vercel: **Settings → Environment Variables**:
- `NEXTAUTH_SECRET`: a long random string (e.g. from https://generate-secret.vercel.app/32)
- `NEXTAUTH_URL`: your app URL
- `DEMO_MODE`: `true` for testing; **`false` before launch**

Redeploy (**Deployments → ⋯ → Redeploy**). You can now test the whole flow with demo sign-in.

### 4. Google Cloud (Google sign-in + Sheet access)
In https://console.cloud.google.com, create a project (e.g. "MMM Assessments"):
1. **APIs & Services → Library**: enable **Google Sheets API** and **Google Drive API**.
2. **OAuth consent screen**: External, app name "My Mountain Mover Assessments", your support email, then **Publish app**.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI: `https://YOUR-APP.vercel.app/api/auth/callback/google`
   Copy the values into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. **Credentials → Create credentials → Service account** (name: `assessment-results`). Open it → **Keys → Add key → JSON**.
   Paste the entire JSON file contents into Vercel as `GOOGLE_SERVICE_ACCOUNT_JSON`.

### 5. The results Google Sheet
1. Create a Google Sheet (e.g. "Skills Assessment Results").
2. **Share** it with the service account email (looks like `assessment-results@….iam.gserviceaccount.com`) as **Editor**.
3. Share it with each evaluator **by email**. These people get dashboard access. "Anyone with the link" or "anyone in the organization" sharing doesn't count.
4. Copy the Sheet ID (the long code in the URL between `/d/` and `/edit`) into Vercel as `GOOGLE_SHEET_ID`.

The app creates one tab per assessment automatically, with a header row, on the first submission.
Dashboard access updates within about 5 minutes of changing the sharing.

### 6. Microsoft sign-in
In https://portal.azure.com (sign in with any Microsoft account), go to **App registrations → New registration**:
- Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
- Redirect URI (Web): `https://YOUR-APP.vercel.app/api/auth/callback/azure-ad`

Then:
1. **Certificates & secrets → New client secret**. Copy the **Value**.
2. In Vercel, add `AZURE_AD_CLIENT_ID` (the Application (client) ID), `AZURE_AD_CLIENT_SECRET` and `AZURE_AD_TENANT_ID` = `common`.

### 7. Go live
Set `DEMO_MODE` to `false`, redeploy, and put the link into the Salesforce email template.

---

## Changing content
- **Questions and answer key**: `src/content/medical-biller.ts` (one entry per question; `correctIndex` 0 = first choice).
- **Time limit, passing score, prerequisite, coming soon → live**: `src/content/assessments.ts`.
- **Images and video**: `private-assets/<assessment>/`. These are only served to candidates with an active attempt and to evaluators.
- **New assessment**: add a content file like `medical-biller.ts`, register it in `src/content/index.ts`, and set its status to `live`.

Commit the change to GitHub, and Vercel redeploys automatically.

## Content notes to revisit (kept as-is for the prototype)
- **Q9** uses a draft answer ("billed charges match the payer's maximum allowable fees"). Confirm it against the official key.
- **Q1 and Q4** have the same answer, and Q4 gives away Q1.
- **Q28** says "retro authorization request" but asks about the appeal.
- **CMS-1500** is filled out for Susan Smith / ABC Health, while the questions reference Edward Collins / Aetna.
- **Appeal Scenario 2**: Scenario 1 is used for all four Denial Management questions.

## Run locally (optional, for developers)
```
npm install
cp .env.example .env.local   # set NEXTAUTH_SECRET, keep DEMO_MODE=true
npm run dev                  # http://localhost:3000
```
Without Redis settings, data is stored in `.data/db.json`.
