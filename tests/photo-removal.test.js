const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function backend(secret='test-only-key') {
  const sheets=new Map(),properties=new Map();
  const ctx=vm.createContext({console,Date,PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='SYNC_SECRET'?secret:properties.get(k),setProperty:(k,v)=>properties.set(k,v),getProperties:()=>Object.fromEntries(properties),deleteProperty:k=>properties.delete(k)})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})}});
  vm.runInContext(read('Code.gs'),ctx);
  ctx.sheet=name=>{if(!sheets.has(name)){let rows=[];sheets.set(name,{clear:()=>{rows=[]},appendRow:r=>rows.push(r),getLastRow:()=>rows.length,getRange:(r,c,n=1)=>({setValues:v=>{rows=v.map(x=>x.slice())},setValue(){},getValues:()=>rows.slice(r-1,r-1+n),getValue:()=>rows[r-1]?.[c-1]})})}return sheets.get(name)};
  return {ctx,post:o=>ctx.doPost({postData:{contents:JSON.stringify({key:'test-only-key',...o})}}),get:()=>ctx.doGet({parameter:{key:'test-only-key'}})};
}
const fixture={progress:{design:{status:'completed',xp:30,best:1}},time:{design:120},custom:{design:[{q:'Q',a:'A'}]},tests:[{score:3,n:4}],writing:[{parts:['hello']}],savedAt:100,photos:[{url:'https://example.invalid/private-photo',thumb:'test-image'}],sets:[{id:'one',title:'Words',img:'test-cover',qs:[{q:'word',a:'meaning'}]}],log:[{type:'photo',t:1,detail:'https://example.invalid/private-photo'},{type:'quiz',t:2,mod:'design',detail:'correct'}]};
test('all scripts parse and photo controls are absent',()=>{
 for(const f of ['index.html','follow.html']){const src=read(f);for(const m of src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);assert.doesNotMatch(src,/accept="image\/|getUserMedia|readAsDataURL|photoIn|photoBtn|setupNotebook|coverFromFile|s\.img|st\.photos|state\.photos/);assert.ok(!/key:\s*['"][^'"]+['"]|KEY=['"][^'"]+['"]/.test(src),'no embedded sync key (the web-app URL alone is not a credential)')}
 new vm.Script(read('Code.gs'));new vm.Script(read('sw.js'));assert.doesNotMatch(read('Code.gs'),/DriveApp|setSharing|createFile|base64Decode/);
});
test('projection strips media without changing learning records or original data',()=>{const c=vm.createContext({});vm.runInContext(read('photo-free.js'),c);const before=JSON.stringify(fixture);const st=plain(c.withoutPhotos(fixture));assert.equal(JSON.stringify(fixture),before);assert.equal(st.photos,undefined);assert.equal(st.sets[0].img,undefined);assert.equal(st.log.length,1);for(const k of ['progress','time','custom','tests','writing'])assert.deepEqual(st[k],fixture[k]);});
test('legacy uploads and malformed writes cannot overwrite progress',()=>{const b=backend();b.ctx.writeState(fixture,'test');const before=plain(b.ctx.readState());for(const payload of [{photo:'test-image'},{photo:''},{}])assert.ok(b.post(payload).error);assert.deepEqual(plain(b.ctx.readState()),before)});
test('state sync keeps stored history but never returns media',()=>{const b=backend();b.ctx.writeState({},'test'); // seed the old format directly as it existed before this release
 const sheet=b.ctx.sheet('state');sheet.getRange(1,1,1,1).setValues([[JSON.stringify(fixture)]]);
 const updated=plain(fixture);updated.savedAt=200;updated.progress.design.xp=40;delete updated.photos;delete updated.sets[0].img;updated.log=updated.log.filter(x=>x.type!=='photo');assert.equal(b.post({state:updated}).ok,true);
 const stored=plain(b.ctx.readState()),returned=plain(b.get().state);assert.deepEqual(stored.photos,fixture.photos);assert.equal(stored.sets[0].img,fixture.sets[0].img);assert.equal(stored.log.filter(x=>x.type==='photo').length,1);assert.equal(returned.photos,undefined);assert.equal(returned.sets[0].img,undefined);assert.equal(returned.log.length,1);assert.equal(returned.progress.design.xp,40);assert.deepEqual(returned.custom,fixture.custom);
});
test('game creation, updates and conflict checks still work without image payloads',()=>{const b=backend();assert.equal(b.post({game:'ABCD',create:true,data:{players:[],img:'test-cover'}}).game.img,undefined);assert.equal(b.post({game:'ABCD',v:1,data:{players:[{score:4}]}}).game.v,2);assert.equal(b.post({game:'ABCD',v:1,data:{}}).conflict,true)});
test('missing server configuration fails closed',()=>{const b=backend(null);assert.equal(b.get().error,'bad key');assert.equal(b.post({state:{}}).error,'bad key')});
test('frontend push projects state and cache includes helper',()=>{assert.match(read('index.html'),/state:withoutPhotos\(state\)/);assert.match(read('follow.html'),/render\(withoutPhotos\(j.state\)\)/);assert.match(read('sw.js'),/photo-free.js/);assert.match(read('sw.js'),/v4[1-9]-no-photos|v[5-9]\d-no-photos/);assert.match(read('index.html'),/id="edCsv"/)});
test('merge-safe writes: a fresh or stale device cannot erase stored progress, an explicit reset can',()=>{const b=backend();
 const rich={progress:{solar:{status:'completed',best:1,attempts:2,xp:175,updated:5},taa:{status:'completed',best:0.8,attempts:1,xp:120,updated:6}},time:{solar:300},log:[{t:1,type:'complete',mod:'solar'}],bee:{words:{apple:{box:3}},best:{},round:2},arena:{tokens:120,blooks:['🐝','🦊'],stats:{gold:{games:3,wins:1,best:900}}},daily:{date:'2026-10-14',i:5,ok:5,done:true,streak:6},savedAt:1000};
 assert.equal(b.post({state:rich}).ok,true);
 const r=b.post({state:{progress:{arena:{status:'in_progress',xp:0}},log:[{t:2,type:'opened',mod:'arena'}],savedAt:2000}});
 assert.equal(r.ok,true);assert.equal(r.state.progress.solar.status,'completed');assert.equal(r.state.progress.arena.status,'in_progress');assert.equal(r.state.log.length,2);assert.equal(r.state.arena.tokens,120);assert.equal(r.state.bee.words.apple.box,3);assert.equal(r.state.daily.streak,6);
 const stale=b.post({state:{progress:{solar:{status:'in_progress',best:0.4,attempts:1,xp:50,updated:3}},savedAt:500}}).state;assert.equal(stale.progress.solar.status,'completed');assert.equal(stale.progress.solar.xp,175);
 const reset=b.post({state:{progress:{},custom:{},time:{},log:[],resetAt:3000,savedAt:3000}}).state;assert.deepEqual(reset.progress,{});assert.equal(reset.resetAt,3000);
 assert.equal(b.post({state:{progress:{gears:{status:'completed',xp:100}},savedAt:4000}}).state.progress.gears.status,'completed');
});
test('read-only key can read but not write',()=>{const b=backend();b.ctx.PropertiesService.getScriptProperties().setProperty('READ_SECRET','family');const ctx=b.ctx;
 assert.equal(ctx.doGet({parameter:{key:'family'}}).error,undefined);assert.equal(ctx.doPost({postData:{contents:JSON.stringify({key:'family',state:{}})}}).error,'bad key');assert.equal(ctx.doGet({parameter:{key:'nope'}}).error,'bad key')});
