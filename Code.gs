// Nawaf STEM Portal — Google Sheet backend.
// 1) Change SECRET to any private word. 2) Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
const SECRET = 'change-me';

function doGet(e) {
  if (!e.parameter || e.parameter.key !== SECRET) return out({ error: 'bad key' });
  const sh = sheet('state');
  const v = sh.getRange('A1').getValue();
  return out({ state: v ? JSON.parse(v) : null });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ error: 'bad json' }); }
  if (body.key !== SECRET) return out({ error: 'bad key' });
  const st = body.state || {};
  const sh = sheet('state');
  sh.getRange('A1').setValue(JSON.stringify(st));
  sh.getRange('B1').setValue(new Date());
  sh.getRange('C1').setValue(body.device || '');
  // Activity log: append only events newer than the last one stored.
  const log = sheet('activity');
  if (log.getLastRow() === 0) log.appendRow(['Time', 'Type', 'Mission', 'Detail']);
  const last = log.getLastRow() > 1 ? new Date(log.getRange(log.getLastRow(), 1).getValue()).getTime() : 0;
  (st.log || []).filter(x => x.t > last).forEach(x => log.appendRow([new Date(x.t), x.type, x.mod, x.detail || '']));
  // Summary sheet for a quick look in Drive.
  const sum = sheet('summary');
  sum.clear();
  sum.appendRow(['Mission', 'Status', 'Best score %', 'Attempts', 'XP', 'Time (min)', 'Last activity']);
  Object.keys(st.progress || {}).forEach(id => {
    const p = st.progress[id];
    sum.appendRow([id, p.status, Math.round((p.best || 0) * 100), p.attempts || 0, p.xp || 0, Math.round(((st.time || {})[id] || 0) / 60), p.updated ? new Date(p.updated) : '']);
  });
  return out({ ok: true });
}

function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
