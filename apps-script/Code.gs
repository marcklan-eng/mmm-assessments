/**
 * My Mountain Mover Skills Assessment — results Sheet connector.
 *
 * Paste this into the results Sheet: Extensions → Apps Script → replace everything in Code.gs.
 * Then Deploy → New deployment → Web app:
 *   Execute as: Me
 *   Who has access: Anyone
 * Copy the Web app URL into Vercel as SHEET_WEBHOOK_URL, and the password below as SHEET_WEBHOOK_SECRET.
 * After editing this script later: Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy
 * (keeps the same URL).
 *
 * What it does:
 *   - "append": adds one result row to the assessment's tab (with a header row), and updates the
 *     summary on the FIRST tab: one row per candidate, one column per assessment, holding the score.
 *   - "sharedEmails": returns everyone the Sheet is shared with by email (used for dashboard access)
 *   - "ping": connection test
 * Run rebuildSummary() from the editor any time to rebuild the summary tab from all assessment tabs.
 */

// Must match SHEET_WEBHOOK_SECRET in Vercel. Change both together if you ever rotate it.
const SECRET = 'PASTE_PASSWORD_HERE';

// Columns at the start of every assessment tab (question columns Q1, Q2, … follow).
const BASE_HEADERS = [
  'Submitted At', 'Name', 'Email', 'Sign-in', 'Started At', 'Time Used', 'Completion', 'Score', 'Total',
  'Percent', 'Result', 'Left Window', 'Exited Fullscreen', 'Copy/Paste Attempts', 'Screenshot Key',
  'Retake After', 'Attempt ID',
];

// Assessment columns on the summary tab, in this order (missing ones are added automatically).
const ASSESSMENTS = [
  'Medical Receptionist', 'Medical Admin', 'Medical Biller', 'Advanced RCM', 'Medical Scribe',
  'Health Educator', 'Dental Receptionist', 'Dental Biller', 'General Business VA',
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || body.secret !== SECRET) return reply({ ok: false, error: 'unauthorized' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.action === 'ping') {
      return reply({ ok: true, sheetName: ss.getName() });
    }

    if (body.action === 'sharedEmails') {
      const emails = {};
      ss.getEditors().forEach(function (u) { if (u.getEmail()) emails[u.getEmail().toLowerCase()] = true; });
      ss.getViewers().forEach(function (u) { if (u.getEmail()) emails[u.getEmail().toLowerCase()] = true; });
      try {
        const owner = DriveApp.getFileById(ss.getId()).getOwner();
        if (owner && owner.getEmail()) emails[owner.getEmail().toLowerCase()] = true;
      } catch (err) { /* shared drives have no single owner */ }
      return reply({ ok: true, emails: Object.keys(emails) });
    }

    if (body.action === 'append') {
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        let sheet = ss.getSheetByName(body.tab);
        if (!sheet) sheet = ss.insertSheet(body.tab); // new tabs go after the summary tab
        ensureHeader(sheet, body.headers);
        // Skip if this attempt was already written (e.g. a retry).
        if (body.attemptId && sheet.createTextFinder(body.attemptId).matchEntireCell(true).findNext()) {
          return reply({ ok: true, duplicate: true });
        }
        sheet.appendRow(body.values.map(safe));
        if (body.summary) updateSummary(ss, body.summary);
        return reply({ ok: true });
      } finally {
        lock.releaseLock();
      }
    }

    return reply({ ok: false, error: 'unknown action' });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return reply({ ok: true, message: 'Assessment results connector is running.' });
}

/** Puts the header row in row 1 if it isn't there yet (inserting it above any existing rows). */
function ensureHeader(sheet, headers) {
  const first = sheet.getLastRow() > 0 ? String(sheet.getRange(1, 1).getValue()) : '';
  if (first !== headers[0]) {
    if (sheet.getLastRow() > 0) sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

/** Summary = first tab. One row per candidate (matched by email), score in the assessment's column. */
function summarySheet(ss) {
  const sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, ASSESSMENTS.length + 2).setValues([['Name'].concat(ASSESSMENTS).concat(['Email'])]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function headerIndex(sh, title) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  let i = header.indexOf(title.toLowerCase());
  if (i === -1) {
    i = lastCol; // add the missing column at the end
    sh.getRange(1, i + 1).setValue(title).setFontWeight('bold');
  }
  return i + 1; // 1-based
}

function updateSummary(ss, s) {
  const sh = summarySheet(ss);
  const nameCol = headerIndex(sh, 'Name');
  const emailCol = headerIndex(sh, 'Email');
  const scoreCol = headerIndex(sh, s.assessment);
  const email = String(s.email || '').toLowerCase();
  let row = -1;
  if (sh.getLastRow() > 1) {
    const emails = sh.getRange(2, emailCol, sh.getLastRow() - 1, 1).getValues();
    for (let r = 0; r < emails.length; r++) {
      if (String(emails[r][0]).toLowerCase() === email) { row = r + 2; break; }
    }
  }
  if (row === -1) {
    row = sh.getLastRow() + 1;
    sh.getRange(row, emailCol).setValue(email);
  }
  sh.getRange(row, nameCol).setValue(safe(s.name));
  sh.getRange(row, scoreCol).setValue(s.score); // latest attempt's score (number correct)
}

/**
 * Rebuilds the summary tab from every assessment tab (latest attempt per candidate wins),
 * and adds missing header rows to assessment tabs. Run from the editor: select rebuildSummary → ▶ Run.
 * This replaces the rows under the summary tab's header row.
 */
function rebuildSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = summarySheet(ss);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), 1)).clearContent();
  ss.getSheets().slice(1).forEach(function (tab) {
    if (ASSESSMENTS.indexOf(tab.getName()) === -1 || tab.getLastRow() === 0) return;
    const qCount = Math.max(tab.getLastColumn() - BASE_HEADERS.length, 0);
    const headers = BASE_HEADERS.concat(Array.from({ length: qCount }, function (_, i) { return 'Q' + (i + 1); }));
    ensureHeader(tab, headers);
    if (tab.getLastRow() < 2) return;
    const rows = tab.getRange(2, 1, tab.getLastRow() - 1, BASE_HEADERS.length).getValues();
    rows.forEach(function (r) {
      if (!r[2]) return; // no email
      updateSummary(ss, { name: r[1], email: r[2], assessment: tab.getName(), score: r[7] });
    });
  });
  Logger.log('Summary rebuilt.');
}

function safe(v) {
  // Store as plain text so names/answers are never treated as formulas.
  const s = String(v === null || v === undefined ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : v;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run this once from the editor (▶ Run) to grant permissions before deploying. */
function authorize() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getEditors();
  DriveApp.getFileById(ss.getId()).getName();
  Logger.log('Authorized for: ' + ss.getName());
}
