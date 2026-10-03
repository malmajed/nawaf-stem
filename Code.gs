// Nawaf STEM Portal — Google Sheet backend (v3: photos, large state, online game rooms)
const SECRET = 'nawaf-2026-red';
const PHOTO_FOLDER = 'Nawaf STEM Photos';
const CHUNK = 40000; // Sheets cell limit is 50,000 characters

function doGet(e) {
  if (!e.parameter || e.parameter.key !== SECRET) return out({ error: 'bad key' });
  if (e.parameter.game) return out({ game: readGame(e.parameter.game) });
  return out({ state: readState() });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ error: 'bad json' }); }
  if (body.key !== SECRET) return out({ error: 'bad key' });

  // --- online game rooms (Spelling Snakes & Ladders)
  if (body.game) {
    const lock = LockService.getScriptLock();
    lock.waitLock(8000);
    try {
      const code = String(body.game).toUpperCase().slice(0, 4);
      const data = body.data || {};
      if (body.create) { data.v = 1; data.t = Date.now(); writeGame(code, data); return out({ ok: true, game: data }); }
      const cur = readGame(code);
      if (!cur) return out({ error: 'no room' });
      if (cur.v !== body.v) return out({ ok: false, conflict: true, game: cur });
      data.v = cur.v + 1; data.t = Date.now();
      writeGame(code, data);
      return out({ ok: true, game: data });
    } finally { lock.releaseLock(); }
  }

  // --- photo upload from the lab notebook
  if (body.photo) {
    const m = body.photo.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return out({ error: 'bad image' });
    const folder = getFolder();
    const name = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH-mm') + ' ' + (body.name || body.mission || 'photo') + '.jpg';
    const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const log = sheet('activity');
    if (log.getLastRow() === 0) log.appendRow(['Time', 'Type', 'Mission', 'Detail']);
    log.appendRow([new Date(), 'photo', body.mission || '', file.getUrl()]);
    return out({ ok: true, url: file.getUrl(), id: file.getId() });
  }

  // --- progress state
  const st = body.state || {};
  writeState(st, body.device);
  const log = sheet('activity');
  if (log.getLastRow() === 0) log.appendRow(['Time', 'Type', 'Mission', 'Detail']);
  const last = log.getLastRow() > 1 ? new Date(log.getRange(log.getLastRow(), 1).getValue()).getTime() : 0;
  (st.log || []).filter(x => x.t > last).forEach(x => log.appendRow([new Date(x.t), x.type, x.mod, x.detail || '']));
  const sum = sheet('summary');
  sum.clear();
  sum.appendRow(['Mission', 'Status', 'Best score %', 'Attempts', 'XP', 'Time (min)', 'Last activity']);
  Object.keys(st.progress || {}).forEach(id => {
    const p = st.progress[id];
    sum.appendRow([id, p.status, Math.round((p.best || 0) * 100), p.attempts || 0, p.xp || 0, Math.round(((st.time || {})[id] || 0) / 60), p.updated ? new Date(p.updated) : '']);
  });
  return out({ ok: true });
}

// ---- state stored as chunks down column A of the "state" sheet
function writeState(st, device) {
  const sh = sheet('state');
  const s = JSON.stringify(st);
  const parts = [];
  for (let i = 0; i < s.length; i += CHUNK) parts.push([s.slice(i, i + CHUNK)]);
  sh.clear();
  sh.getRange(1, 1, parts.length, 1).setValues(parts);
  sh.getRange('B1').setValue(new Date());
  sh.getRange('C1').setValue(device || '');
}
function readState() {
  const sh = sheet('state');
  const n = sh.getLastRow();
  if (!n) return null;
  const vals = sh.getRange(1, 1, n, 1).getValues().map(r => r[0]).join('');
  try { return vals ? JSON.parse(vals) : null; } catch (e) { return null; }
}

// ---- weekly parent email. Run setupWeeklyTrigger() ONCE from the editor to schedule it (Fridays 8am).
function setupWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'weeklyReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(8).inTimezone('Asia/Riyadh').create();
  weeklyReport(); // send one now so you can see it works
}
function weeklyReport() {
  const st = readState() || {};
  const prog = st.progress || {};
  const week = Date.now() - 7 * 24 * 3600 * 1000;
  const log = (st.log || []).filter(x => x.t > week);
  const ids = Object.keys(prog);
  const done = ids.filter(id => prog[id].status === 'completed');
  const doneThisWeek = ids.filter(id => prog[id].status === 'completed' && (prog[id].updated || 0) > week);
  const review = ids.filter(id => prog[id].status === 'completed' && (prog[id].best || 0) < 0.67);
  const xp = ids.reduce((a, id) => a + (prog[id].xp || 0), 0);
  const mins = Math.round(Object.values(st.time || {}).reduce((a, b) => a + b, 0) / 60);
  const quiz = log.filter(x => x.type === 'quiz'); const right = quiz.filter(x => (x.detail || '').startsWith('✓')).length;
  const daily = st.daily || {};
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px">
  <h2 style="color:#C8102E">Nawaf's STEM week</h2>
  <p>${Utilities.formatDate(new Date(), 'Asia/Riyadh', 'EEEE d MMMM yyyy')}</p>
  <table cellpadding="8" style="border-collapse:collapse">
   <tr><td><b>Missions completed (total)</b></td><td>${done.length}</td></tr>
   <tr><td><b>Completed this week</b></td><td>${doneThisWeek.join(', ') || '—'}</td></tr>
   <tr><td><b>Quiz answers this week</b></td><td>${right} correct of ${quiz.length}</td></tr>
   <tr><td><b>Daily-challenge streak</b></td><td>${daily.streak || 0} days</td></tr>
   <tr><td><b>Total XP</b></td><td>${xp}</td></tr>
   <tr><td><b>Total time on missions</b></td><td>${mins} min</td></tr>
   <tr><td><b>Needs review (score under 67%)</b></td><td style="color:#C8102E">${review.join(', ') || 'none'}</td></tr>
  </table>
  <h3>Activity this week</h3>
  <ul>${log.slice(-40).reverse().map(x => `<li>${Utilities.formatDate(new Date(x.t), 'Asia/Riyadh', 'EEE HH:mm')} · ${x.type} · ${x.mod} · ${x.detail || ''}</li>`).join('') || '<li>No activity logged.</li>'}</ul>
  <p style="color:#888">Sheet: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}</p></div>`;
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: "Nawaf's STEM week: " + done.length + ' missions, ' + right + '/' + quiz.length + ' quiz answers correct', htmlBody: html });
}

// ---- game rooms live in script properties (small JSON, auto-cleaned after a day)
function writeGame(code, data) {
  const ps = PropertiesService.getScriptProperties();
  ps.setProperty('game_' + code, JSON.stringify(data));
  const all = ps.getProperties(); const old = Date.now() - 864e5;
  Object.keys(all).forEach(k => { if (k.startsWith('game_') && k !== 'game_' + code) { try { if ((JSON.parse(all[k]).t || 0) < old) ps.deleteProperty(k); } catch (e) { ps.deleteProperty(k); } } });
}
function readGame(code) {
  const v = PropertiesService.getScriptProperties().getProperty('game_' + String(code).toUpperCase().slice(0, 4));
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}

function getFolder() {
  const it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
}
function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
