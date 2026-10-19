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
| **Anti-cheating** | Fullscreen required. Questions blur when they leave the window. Copy/paste and right-click are blocked. Their email is watermarked on screen. Window switches, fullscreen exits, copy attempts and the Print Screen key are logged for evaluators. Questions and choices appear in the same order as the original Form. The answer key never reaches the browser. |
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

### 4. Google sign-in (Google Cloud, sign-in button only)
In https://console.cloud.google.com, create a project (e.g. "MMM Assessments"), then:
1. Go to **OAuth consent screen** (or **Google Auth Platform → Branding**). Set the app name to "My Mountain Mover Assessments", enter your support email, set the audience to **External**, then **Publish app**.
2. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI: `https://YOUR-APP.vercel.app/api/auth/callback/google`
   Copy the values into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### 5. The results Google Sheet (Apps Script, no Google Cloud needed)
1. Create a Google Sheet in your Drive (e.g. "Skills Assessment Results").
2. Open **Extensions → Apps Script**, delete what's there, and paste in `apps-script/Code.gs`.
   Set `SECRET` to a long random password.
3. Click **Run** with the `authorize` function selected, then allow the permissions.
4. Click **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy**. Copy the Web app URL.
5. In Vercel, add `SHEET_WEBHOOK_URL` (the URL) and `SHEET_WEBHOOK_SECRET` (the same password).
6. Share the Sheet with each evaluator **by email**. These people get dashboard access. "Anyone with the link" or "anyone in the organization" sharing doesn't count.

The app creates one tab per assessment automatically, with a header row, on the first submission.
Dashboard access updates within about 5 minutes of changing the sharing.
If you edit the script later, use **Deploy → Manage deployments → Edit → New version**, so the URL stays the same.
When moving to a shared company account: transfer Sheet ownership, then redeploy the script from that account and update `SHEET_WEBHOOK_URL`.
Check the connection at `/api/health`. It should say `"googleSheet": "connected: <Sheet name>"`.

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

## Changing questions (question bank)
Questions live in a separate **questions Sheet**, with **one tab per assessment**, named exactly like the assessment (e.g. `Medical Biller`, `Advanced RCM`). They're published from the dashboard: **Dashboard → Questions & media**.

**Setting up the questions Sheet (one time):**
1. Create a new Google Sheet, e.g. "Skills Assessment Questions".
2. Paste the same `apps-script/Code.gs` into it, with the same password, and run **authorize**.
3. **Deploy → New deployment → Web app** (Execute as: Me; Who has access: Anyone). Copy the URL.
4. In Vercel, add `QUESTIONS_WEBHOOK_URL` with that URL, then redeploy.

**Editing in the app:** on **Questions & media**, click **Edit** next to an assessment (the page reads the Sheet when it opens and again whenever you come back to its tab). Each question can be edited
(text, choices, correct answer, question type, points, media), deleted, or a new one added below it (**+ Below**). **+ New section after …** adds a new section (skill area) with its name, description, media and first question. **Save to Sheet**
first checks the change exactly like **Check** does and writes nothing if it would leave a problem; it also refuses if someone changed
that row in the Sheet since the editor was opened. Saved changes go live only when you click **Publish**. This needs `Code.gs`
version 4 in the questions Sheet (paste it in, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**).

A tab named **Instructions** (or "How to…", "Notes", "Readme", or any name starting with `_`) is for people and is ignored by the app.

The questions Sheet's sharing controls the question bank:
- **Anyone it's shared with** can check and preview. Preview shows the answer key.
- **Its editors** can publish and upload images and videos.

Results-Sheet evaluators don't see the answer key unless the questions Sheet is shared with them too.
Without `QUESTIONS_WEBHOOK_URL`, the Questions tab lives in the results Sheet instead.

1. The first time, click **Check the questions Sheet → Fill in the live questions**. This fills each assessment's tab with the questions that are live now.
2. Edit the tabs. Use one row per question, in the order candidates should see them. The Assessment column is only needed if you use a single combined `Questions` tab instead:

| Column | What goes in it |
|---|---|
| Assessment | The assessment name exactly, e.g. `Medical Biller`, `Dental Receptionist` |
| Section | The section (page) title. It only needs to be filled on the section's first row |
| Section Description | Optional text under the section title (first row of the section) |
| Section Media | Optional images, videos or audio (.mp3) for the section (first row): one per line, as `file-name.png \| Caption`. Add a line `Layout: side by side` to show the images in a row with Zoom buttons instead of full width |
| Question | The question text |
| A – F | The choices. At least A and B; leave the unused ones blank. Leave **all** blank for a **typed-answer** question |
| Correct | The letter of the correct choice. Several letters (`A, D`) with no Rows makes a **check all that apply** question: 1 point when exactly those are checked. For a typed answer, the accepted answer (several on separate lines). Case, spacing and punctuation don't matter, and dates match in any format (`06/18/1987` = `June 18, 1987`). When the accepted answer is a date, candidates pick it from Month / Day / Year dropdowns |
| Rows | Optional. Makes a **matching grid**: one item per line. Candidates pick one choice (A–F) for each row, and Correct lists one letter per row, e.g. `A, B`. By default it's worth 1 point, all rows must be right |
| Scoring | Optional. A number (e.g. `2`) makes the question worth that many points (still one question number). For matching grids, `Per row` makes each row its own numbered question worth 1 point (e.g. 5 voicemails = 5 points). Blank = 1 point, all or nothing |
| Question Media | Optional images shown with that one question (between the question and its choices), same format as Section Media |

3. Upload any new images, videos or audio on the same page, then use their file names in **Section Media**.
4. Click **Check again**. Every row is checked, and problems are listed with their row number. Use **Preview** to review an assessment the way candidates will see it, with the correct answers marked.
5. Click **Publish** for each assessment you changed. Only people who can **edit** the questions Sheet can publish or upload.

Each publish creates a new **question set version** (v1, v2, …; v0 is the original built-in Medical Biller set):
- Candidates who start after publishing get the new version.
- Attempts in progress keep their version.
- The Sheet records each result's version in a **Question Set** column.
- The dashboard shows question analysis per version.

Publishing questions for a "Coming soon" assessment makes it live.

**File storage for uploads:** in Vercel, go to **Storage → Create → Blob**, choose **Private** if asked, and connect it to the project (this adds `BLOB_READ_WRITE_TOKEN`), then redeploy. The images, video and audio that came with the app work without it.

**Other settings** (time limit, passing score, prerequisite, retake period) are in `src/content/assessments.ts`.

## Link expiry (off by default)
By default links don't expire: the 48-hour rule is handled in Salesforce, and evaluators judge late submissions from the
**Submitted At** time. To make late candidates see "This assessment link has expired", turn on **Link expiry** at the bottom of
the dashboard (editors of the questions Sheet; hours adjustable, default 48). The Vercel setting `LINK_EXPIRY_HOURS`, if set,
overrides the dashboard switch. Since every candidate gets the same link for an assessment, each candidate's window starts at the earliest of:
- **the time the invitation email was sent**, if the link carries it: `https://…/a/medical-admin?sent=<date>`. The Salesforce
  template can add this with a date/time merge field. Accepted formats: `2026-10-10`, `2026-10-10T20:47:00Z`, `10/10/2026`,
  `10/10/2026 8:47 PM`, or milliseconds since 1970;
- **the first time the candidate opens the link while signed in** (always applies, so it works without the `sent` part).

The earliest time ever seen is kept, so changing the date in the link can't extend the deadline. After the deadline the page says
the link has expired and the assessment can't be started. Someone already in the middle of the assessment can finish it. To give
a candidate a new 48 hours, use **Reopen an expired link** at the bottom of the dashboard (they use the same link again).

## Content notes to revisit (kept as-is for the prototype)

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
