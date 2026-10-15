/**
 * My Mountain Mover Skills Assessment — results Sheet connector.
 *
 * Paste this into the results Sheet: Extensions → Apps Script → replace everything in Code.gs.
 * Then Deploy → New deployment → Web app:
 *   Execute as: Me
 *   Who has access: Anyone
 * Copy the Web app URL into Vercel as SHEET_WEBHOOK_URL, and the password below as SHEET_WEBHOOK_SECRET.
 *
 * What it does:
 *   - "append": adds one result row to the assessment's tab (creates the tab with headers if needed)
 *   - "sharedEmails": returns everyone the Sheet is shared with by email (used for dashboard access)
 *   - "ping": connection test
 */

// Must match SHEET_WEBHOOK_SECRET in Vercel. Change both together if you ever rotate it.
const SECRET = 'PASTE_PASSWORD_HERE';

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
        if (!sheet) {
          sheet = ss.insertSheet(body.tab);
          sheet.appendRow(body.headers);
          sheet.setFrozenRows(1);
          sheet.getRange(1, 1, 1, body.headers.length).setFontWeight('bold');
        }
        // Skip if this attempt was already written (e.g. a retry).
        if (body.attemptId && sheet.createTextFinder(body.attemptId).matchEntireCell(true).findNext()) {
          return reply({ ok: true, duplicate: true });
        }
        // Store everything as plain text so names/answers are never treated as formulas.
        const safe = body.values.map(function (v) {
          const s = String(v === null || v === undefined ? '' : v);
          return /^[=+\-@]/.test(s) ? "'" + s : v;
        });
        sheet.appendRow(safe);
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
