// Nawaf STEM Portal — Google Sheet backend v6 (learning state, merge-safe sync, online game rooms)
// Setup: Project Settings → Script properties → SYNC_SECRET (write key, entered once per device in Parent view)
//        and optionally READ_SECRET (read-only key for the family follow page).
const PROPS = PropertiesService.getScriptProperties();
const SECRET = PROPS.getProperty('SYNC_SECRET');
const canRead = k => { const rk = PROPS.getProperty('READ_SECRET'); return !!SECRET && !!k && (k === SECRET || (!!rk && k === rk)); };
const CHUNK = 40000; // Sheets cell limit is 50,000 characters

function doGet(e) {
  if (!e.parameter || !canRead(e.parameter.key)) return out({ error: 'bad key' });
  if (e.parameter.game) return out({ game: readGame(e.parameter.game) });
  return out({ state: withoutPhotos(readState()) });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out({ error: 'bad json' }); }
  if (!SECRET || body.key !== SECRET) return out({ error: 'bad key' });

  // Reject old clients before they can overwrite learning state.
  if (Object.prototype.hasOwnProperty.call(body, 'photo')) return out({ error: 'photo uploads disabled' });

  // --- online game rooms (Spelling Snakes & Ladders)
  if (body.game) {
    const lock = LockService.getScriptLock();
    lock.waitLock(8000);
    try {
      const code = String(body.game).toUpperCase().slice(0, 4);
      const data = withoutPhotos(body.data || {});
      if (body.create) { data.v = 1; data.t = Date.now(); writeGame(code, data); return out({ ok: true, game: data }); }
      const cur = readGame(code);
      if (!cur) return out({ error: 'no room' });
      if (cur.v !== body.v) return out({ ok: false, conflict: true, game: cur });
      data.v = cur.v + 1; data.t = Date.now();
      writeGame(code, data);
      return out({ ok: true, game: data });
    } finally { lock.releaseLock(); }
  }

  // --- progress state: merged with what is stored, so a fresh or stale device can never erase progress
  if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) return out({ error: 'missing state' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let st;
  try {
    st = mergeState(withoutPhotos(readState() || {}), withoutPhotos(body.state));
    writeState(st, body.device);
  } finally { lock.releaseLock(); }
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
  return out({ ok: true, state: withoutPhotos(st) });
}

// ---- state stored as chunks down column A of the "state" sheet
function writeState(st, device) {
  // Keep historical media in storage, but never return or accept it via sync.
  st = preserveStoredPhotos(readState() || {}, st);
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
  const st = withoutPhotos(readState()) || {};
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
  try { return v ? withoutPhotos(JSON.parse(v)) : null; } catch (e) { return null; }
}

function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// A projection for transport/rendering; original local and server records stay intact.
function withoutPhotos(value) {
  if (Array.isArray(value)) return value.filter(x => !x || x.type !== 'photo').map(withoutPhotos);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  Object.keys(value).forEach(key => {
    if (!['photo', 'photos', 'thumb', 'img'].includes(key)) result[key] = withoutPhotos(value[key]);
  });
  return result;
}

function preserveStoredPhotos(previous, incoming) {
  const next = withoutPhotos(incoming);
  if (previous.photos) next.photos = previous.photos;
  if (next.sets && previous.sets) next.sets.forEach(set => {
    const old = previous.sets.find(x => x.id === set.id);
    if (old && old.img) set.img = old.img;
  });
  const history = (previous.log || []).filter(x => x.type === 'photo');
  if (history.length) next.log = (next.log || []).concat(history).sort((a, b) => a.t - b.t);
  return next;
}

// Same merge rules as the app (keep in sync with index.html).
function mergeState(a,b){a=a||{};b=b||{};if((b.resetAt||0)>(a.resetAt||0)&&(b.resetAt||0)>(a.savedAt||0))return Object.assign({},b);if((a.resetAt||0)>(b.resetAt||0)&&(a.resetAt||0)>(b.savedAt||0))return Object.assign({},a);
  const out=Object.assign({},a,b);const mx=(x,y)=>Math.max(x||0,y||0);const ST={completed:3,in_progress:2,not_started:1};
  out.progress={};new Set([...Object.keys(a.progress||{}),...Object.keys(b.progress||{})]).forEach(id=>{const p=(a.progress||{})[id]||{},q=(b.progress||{})[id]||{};const n=(q.updated||0)>=(p.updated||0)?q:p;out.progress[id]=Object.assign({},p,q,{status:(ST[q.status]||0)>=(ST[p.status]||0)?q.status:p.status,best:mx(p.best,q.best),attempts:mx(p.attempts,q.attempts),xp:mx(p.xp,q.xp),score:n.score||0});if(p.lessonXP||q.lessonXP)out.progress[id].lessonXP=mx(p.lessonXP,q.lessonXP);if(p.updated||q.updated)out.progress[id].updated=mx(p.updated,q.updated)});
  out.custom=Object.assign({},a.custom||{},b.custom||{});out.time={};new Set([...Object.keys(a.time||{}),...Object.keys(b.time||{})]).forEach(k=>out.time[k]=mx((a.time||{})[k],(b.time||{})[k]));
  const seen={};out.log=[].concat(a.log||[],b.log||[]).filter(x=>{if(!x)return false;const k=x.t+'|'+x.type+'|'+x.mod;if(seen[k])return false;seen[k]=1;return true}).sort((x,y)=>x.t-y.t).slice(-200);
  const ts={};out.tests=[].concat(a.tests||[],b.tests||[]).filter(x=>{if(!x)return false;const k=x.t+'|'+x.track;if(ts[k])return false;ts[k]=1;return true}).sort((x,y)=>x.t-y.t);
  if(a.daily||b.daily){const d1=a.daily||{},d2=b.daily||{};const pk=(d2.date||'')>(d1.date||'')?d2:(d1.date||'')>(d2.date||'')?d1:((d2.i||0)>(d1.i||0)||(d2.done&&!d1.done))?d2:d1;out.daily=Object.assign({},pk,{streak:mx(d1.streak,d2.streak)})}
  if(a.bee||b.bee){const x=a.bee||{},y=b.bee||{};const bee=Object.assign({},x,y);bee.words={};new Set([...Object.keys(x.words||{}),...Object.keys(y.words||{})]).forEach(w=>{const u=(x.words||{})[w]||{},v=(y.words||{})[w]||{};bee.words[w]=Object.assign({},u,v,{box:mx(u.box,v.box),seen:mx(u.seen,v.seen),right:mx(u.right,v.right)})});bee.best={};new Set([...Object.keys(x.best||{}),...Object.keys(y.best||{})]).forEach(k=>bee.best[k]=mx((x.best||{})[k],(y.best||{})[k]));bee.round=mx(x.round,y.round)||bee.round;if(!bee.list&&(x.list||y.list))bee.list=x.list||y.list;bee.lists=Object.assign({},x.lists||{},y.lists||{});bee.retry=Object.assign({},x.retry||{},y.retry||{});out.bee=bee}
  if(a.arena||b.arena){const x=a.arena||{},y=b.arena||{};const ar=Object.assign({},x,y);ar.tokens=mx(x.tokens,y.tokens);ar.blooks=[...new Set([].concat(x.blooks||[],y.blooks||[]))];ar.stats={};new Set([...Object.keys(x.stats||{}),...Object.keys(y.stats||{})]).forEach(k=>{const u=(x.stats||{})[k],v=(y.stats||{})[k];ar.stats[k]=(typeof u==='object'&&u&&typeof v==='object'&&v)?Object.assign({},u,v,{games:mx(u.games,v.games),best:mx(u.best,v.best),wins:mx(u.wins,v.wins)}):(typeof u==='number'||typeof v==='number')?mx(u,v):(v!==undefined?v:u)});out.arena=ar}
  if(a.sets||b.sets){const m={};[].concat(a.sets||[],b.sets||[]).forEach(s=>{if(!s||!s.id)return;const o=m[s.id];m[s.id]=(!o||(s.created||0)>=(o.created||0)||(s.qs||[]).length>(o.qs||[]).length)?Object.assign({},o||{},s,{plays:mx(o&&o.plays,s.plays)}):Object.assign({},s,o,{plays:mx(o.plays,s.plays)})});out.sets=Object.values(m).sort((x,y)=>(x.created||0)-(y.created||0))}
  ['cards','tt','sud','hive','chess','robbuild','mq','beb','bal','g','writing'].forEach(k=>{const x=a[k],y=b[k];if(x===undefined||y===undefined)return;const sx=JSON.stringify(x).length,sy=JSON.stringify(y).length;out[k]=sy>=sx?y:x});
  out.savedAt=mx(a.savedAt,b.savedAt);if(a.resetAt||b.resetAt)out.resetAt=mx(a.resetAt,b.resetAt);return out}
