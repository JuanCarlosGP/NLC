const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
require.extensions['.ts'] = (mod,file) => mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:file}).outputText,file);
const { parseSnapshot, validateSnapshot, mercuryBalances } = require('../src/lib/integrations/model.ts');
const { createIntegrationCache } = require('../src/lib/integrations/cache.ts');
const load = name => import(pathToFileURL(path.join(__dirname,'integrations',name)).href);
const json = value => new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const today = '2026-11-04';
const raw = () => ({profile:{user_id:123,first_name:'Prueba',last_name:'Local'},body:{weight_kilogram:78,height_meter:1.8,max_heart_rate:190},
  cycles:[{id:1,start:`${today}T00:30:00Z`,timezone_offset:'-02:00',score_state:'SCORED',score:{strain:0,kilojoule:4184}}],
  recoveries:[{cycle_id:1,sleep_id:'sleep',score_state:'SCORED',score:{recovery_score:0,resting_heart_rate:50,hrv_rmssd_milli:65}}],
  sleeps:[{id:'sleep',start:'2026-11-03T20:00:00Z',end:`${today}T04:00:00Z`,timezone_offset:'-02:00',score_state:'SCORED',score:{stage_summary:{total_light_sleep_time_milli:200*60000,total_slow_wave_sleep_time_milli:100*60000,total_rem_sleep_time_milli:100*60000,total_awake_time_milli:80*60000},sleep_performance_percentage:90}}],
  workouts:[{id:'workout',start:`${today}T00:30:00Z`,end:`${today}T01:15:00Z`,timezone_offset:'-02:00',sport_name:'Cycling',score_state:'UNSCORABLE',score:{strain:99}}]
});
test('WHOOP joins sleep by v2 ID, preserves zero, null and source timezone; no strength rows', async()=>{
  const {normalizeWhoop}=await load('providers.mjs');const data=validateSnapshot(normalizeWhoop(raw(),`${today}T12:00:00Z`));
  assert.equal(data.days[0].date,'2026-11-03');assert.equal(data.days[0].recovery,0);assert.equal(data.days[0].strain,0);assert.equal(data.days[0].calories,1000);assert.equal(data.days[0].sleepId,'sleep');assert.equal(data.sleeps[0].asleepMinutes,400);assert.equal(data.sleeps[0].date,today);assert.equal(data.activities[0].strain,null);assert.equal(data.activities[0].date,'2026-11-03');assert.equal('sessions' in data,false);
});
test('Mercury uses signed USD balances and ledger amounts, masks numbers and strips raw bank details',async()=>{
  const {normalizeMercury}=await load('providers.mjs');const data=validateSnapshot(normalizeMercury({accounts:[{id:'a',currentBalance:1000,availableBalance:900,accountNumber:'123456789012',routingNumber:'999999999'}],credit:[{id:'c',currentBalance:-120,availableBalance:-180}],treasury:[{id:'t',currentBalance:500,netReturns:[{month:'2026-11-01',netAmount:10,treasuryFee:1,status:'charged'}]}],transactions:[{id:'tx',accountId:'a',amount:-30,createdAt:`${today}T12:00:00Z`,currencyExchangeInfo:{convertedToCurrency:'EUR'},details:{routingNumber:'999999999'},status:'pending',categoryData:{customCategory:{name:'Trabajo'}}}],treasuryTransactions:[],categories:[]},`${today}T12:00:00Z`));
  assert.deepEqual(mercuryBalances(data),{assets:1500,credit:-120,total:1380});assert.equal(data.transactions[0].amount,-30);assert.equal(data.transactions[0].currency,'USD');assert.equal(data.transactions[0].category,'Trabajo');assert.equal(data.accounts[0].last4,'9012');assert.doesNotMatch(JSON.stringify(data),/123456789012|999999999|routingNumber|details|currencyExchangeInfo/);
});
test('pagination follows WHOOP, Mercury and numeric Treasury cursors, deduplicates IDs and rejects loops',async()=>{
  const {pages}=await load('providers.mjs');
  for(const kind of ['whoop','mercury','treasury']){const calls=[];const get=async(_path,query)=>{calls.push(query);if(calls.length===1)return {records:[{id:'one',value:'old'}],next_token:kind==='whoop'?'next':null,page:kind==='mercury'?{nextPage:'next'}:null,cursor:kind==='treasury'?0:null};return {records:[{id:'one',value:'new'},{id:'two'}]};};const result=await pages(get,'/data','records',kind);assert.equal(calls.length,2);assert.equal(result.length,2);assert.equal(result[0].value,'new');assert.equal(calls[1][kind==='whoop'?'nextToken':kind==='treasury'?'cursor':'start_after'],kind==='treasury'?0:'next');}
  await assert.rejects(()=>pages(async()=>({records:[{id:'one'}],next_token:'same'}),'/data','records'),/pagination/);
  await assert.rejects(()=>pages(async()=>({notRecords:[]}),'/data','records'),/invalid/);
});
test('strict JSON import rejects mismatches, extra credential fields, duplicate IDs, broken links and excess bytes',async()=>{
  const {demoSnapshot}=await load('demo.mjs');const data=demoSnapshot('whoop');assert.equal(parseSnapshot(JSON.stringify(data),'whoop').mode,'demo');
  assert.throws(()=>parseSnapshot(JSON.stringify(data),'mercury'),/invalid/);
  for(const mutate of [copy=>{copy.token='secret';},copy=>{copy.days.push(copy.days[0]);},copy=>{copy.days[0].sleepId='missing';},copy=>{copy.days[0].date='2026-02-30';},copy=>{copy.days[0].recovery='0';}]){const copy=structuredClone(data);mutate(copy);assert.throws(()=>validateSnapshot(copy),/invalid/);}
  const mercury=demoSnapshot('mercury');mercury.transactions[0].accountId='unknown';assert.throws(()=>validateSnapshot(mercury),/invalid/);
  assert.throws(()=>parseSnapshot(' '.repeat(16*1024*1024+1)),/size/);
});
test('offline cache survives reopening; imports are idempotent and examples never overwrite real accounts',async()=>{
  const {demoSnapshot}=await load('demo.mjs');const map=new Map();let fail=false;const storage={async getItem(k){return map.get(k)??null;},async setItem(k,v){if(fail)throw new Error('disk');map.set(k,v);},async removeItem(k){map.delete(k);}};
  let cache=createIntegrationCache(storage);const demo=demoSnapshot('whoop');const live={...demo,mode:'live',owner:'real-account'};await cache.write(live);await cache.write(demo);await cache.write(demo);
  cache=createIntegrationCache(storage);assert.deepEqual(await cache.read('whoop','live'),live);assert.deepEqual(await cache.read('whoop','demo'),demo);assert.equal(map.size,2);
  fail=true;await assert.rejects(()=>cache.write({...live,name:'changed'}),/disk/);assert.deepEqual(await cache.read('whoop','live'),live);fail=false;
  await cache.clear('whoop','demo');assert.equal(await cache.read('whoop','demo'),null);assert.deepEqual(await cache.read('whoop','live'),live);
});
test('real browser IndexedDB storage commits atomically and reopens offline',async()=>{
  const {indexedDB}=require('fake-indexeddb');global.indexedDB=indexedDB;
  const Module=require('node:module');const original=Module._load;Module._load=function(request,parent,isMain){if(request==='@/lib/dev/local-demo')return {localDemoEnabled:false};return original.call(this,request,parent,isMain);};
  let storage;try{storage=require('../src/lib/integrations/storage.web.ts').integrationStorage;}finally{Module._load=original;}
  const {demoSnapshot}=await load('demo.mjs');let cache=createIntegrationCache(storage,'test');const data=demoSnapshot('mercury');await cache.write(data);cache=createIntegrationCache(storage,'test');assert.deepEqual(await cache.read('mercury','demo'),data);await cache.clear('mercury','demo');assert.equal(await cache.read('mercury','demo'),null);
});
test('native SQLite cache preserves other tables and round-trips snapshots',async()=>{
  const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE manual_data (value TEXT); INSERT INTO manual_data VALUES (\'keep\')');const adapter={execAsync:async sql=>db.exec(sql),getFirstAsync:async(sql,...params)=>db.prepare(sql).get(...params),runAsync:async(sql,...params)=>db.prepare(sql).run(...params)};
  const Module=require('node:module');const original=Module._load;Module._load=function(request,parent,isMain){if(request==='@/lib/db/client')return {getDb:async()=>adapter};return original.call(this,request,parent,isMain);};let storage;try{storage=require('../src/lib/integrations/storage.ts').integrationStorage;}finally{Module._load=original;}
  try{const {demoSnapshot}=await load('demo.mjs');const data=demoSnapshot('whoop');await storage.setItem('test',JSON.stringify(data));assert.deepEqual(parseSnapshot(await storage.getItem('test')),data);await storage.removeItem('test');assert.equal(await storage.getItem('test'),null);assert.equal(db.prepare('SELECT value FROM manual_data').get().value,'keep');}finally{db.close();}
});
async function freePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
test('local HTTP service: OAuth browser binding, refresh rotation, atomic full sync, origin isolation and restart',async(t)=>{
  const {createIntegrationService}=await load('server.mjs');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nlc-integrations-test-'));const port=await freePort();const origin='http://127.0.0.1:8084';const base=`http://127.0.0.1:${port}`;
  const calls=[];let phase=0;let fail=false;let tokenCount=0;let releaseWorkout;let enteredWorkout;let gateWorkout=false;const rawWhoop=raw();
  const fetchImpl=async(input,options={})=>{const url=new URL(input);calls.push({url,options});if(url.hostname==='api.prod.whoop.com'){
    if(url.pathname.endsWith('/token')){tokenCount++;const form=new URLSearchParams(options.body);assert.equal(form.get('client_secret'),'client-secret-synthetic');if(tokenCount>1)assert.equal(form.get('refresh_token'),`refresh-${tokenCount-1}`);return json({access_token:`access-${tokenCount}`,refresh_token:`refresh-${tokenCount}`,expires_in:tokenCount===1?1:3600});}
    assert.equal(options.headers.Authorization,`Bearer access-${tokenCount}`);
    const key={'/developer/v2/user/profile/basic':'profile','/developer/v2/user/measurement/body':'body','/developer/v2/cycle':'cycles','/developer/v2/recovery':'recoveries','/developer/v2/activity/sleep':'sleeps','/developer/v2/activity/workout':'workouts'}[url.pathname];assert.ok(key);if(key==='workouts'&&gateWorkout){enteredWorkout();await new Promise(resolve=>{releaseWorkout=resolve;});gateWorkout=false;}return json(['profile','body'].includes(key)?rawWhoop[key]:{records:rawWhoop[key]});
  }
    assert.equal(url.hostname,'api.mercury.com');assert.equal(options.method,undefined);assert.equal(options.headers.Authorization,`Basic ${Buffer.from('synthetic-token:').toString('base64')}`);
    const cursor=url.searchParams.get('start_after');
    if(url.pathname.endsWith('/accounts'))return json({accounts:[{id:'bank',name:'Checking',currentBalance:500+phase,availableBalance:450,accountNumber:'123456789012',status:'active'}]});
    if(url.pathname.endsWith('/credit'))return json({accounts:[{id:'credit',currentBalance:-40,availableBalance:-50,status:'active'}]});
    if(url.pathname.endsWith('/treasury'))return json({accounts:[{id:'treasury',currentBalance:100,status:'active',netReturns:[]}]});
    if(url.pathname.endsWith('/categories'))return json({categories:[{id:'cat',name:'Software'}]});
    if(url.pathname.includes('/treasury/'))return json({transactions:[{id:'dividend',amount:2,canonicalDay:today}],cursor:null});
    assert.ok(url.pathname.endsWith('/transactions'));
    if(cursor){if(fail)return new Response('DO NOT LEAK synthetic-token',{status:500});return json({transactions:[{id:'second',accountId:'bank',amount:10,createdAt:`${today}T11:00:00Z`,status:'sent'}],page:{nextPage:null}});}
    return json({transactions:[{id:'first',accountId:'bank',amount:-20,createdAt:`${today}T10:00:00Z`,status:phase?'sent':'pending',details:{routingNumber:'111111111'}}],page:{nextPage:'cursor2'}});
  };
  let service;async function start(){service=await createIntegrationService({directory,port,env:{NLC_APP_ORIGIN:origin,WHOOP_CLIENT_ID:'client-synthetic',WHOOP_CLIENT_SECRET:'client-secret-synthetic',MERCURY_API_TOKEN:'synthetic-token'},fetchImpl});await new Promise(resolve=>service.server.listen(port,'127.0.0.1',resolve));}
  const close=()=>new Promise(resolve=>service.server.close(resolve));await start();t.after(async()=>{await close();fs.rmSync(directory,{recursive:true,force:true});});
  const request=(route,post=false,headers={})=>fetch(base+route,{method:post?'POST':'GET',headers:{Origin:origin,'X-NLC-Client':'1',...headers}});
  assert.equal((await fetch(base+'/status')).status,403);assert.equal((await request('/status',false,{Origin:'https://foreign.example'})).status,403);assert.equal((await request('/status',false,{'X-NLC-Client':''})).status,403);const hostStatus=await new Promise((resolve,reject)=>{const req=require('node:http').get(base+'/status',{headers:{Host:'foreign.example',Origin:origin,'X-NLC-Client':'1'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(hostStatus,403);
  const preflight=await fetch(base+'/whoop/sync',{method:'OPTIONS',headers:{Origin:origin}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
  const connect=await request('/whoop/connect',true);const cookie=connect.headers.get('set-cookie').split(';')[0];const auth=new URL((await connect.json()).url);assert.ok(auth.searchParams.get('scope').includes('offline'));assert.equal(auth.searchParams.get('client_secret'),null);
  const callback=`/whoop/callback?state=${auth.searchParams.get('state')}&code=synthetic-code`;
  assert.equal((await fetch(base+callback)).status,400);assert.equal(tokenCount,0);
  assert.equal((await fetch(base+callback,{headers:{Cookie:cookie}})).status,200);assert.equal(tokenCount,1);
  assert.equal((await fetch(base+callback,{headers:{Cookie:cookie}})).status,400);assert.equal(tokenCount,1);
  gateWorkout=true;const entered=new Promise(resolve=>{enteredWorkout=resolve;});const syncing=request('/whoop/sync',true);await entered;assert.equal((await request('/whoop/sync',true)).status,409);releaseWorkout();let response=await syncing;const whoopReply=await response.json();assert.equal(response.status,200,JSON.stringify(whoopReply));const whoop=validateSnapshot(whoopReply,'whoop');assert.equal(tokenCount,2);assert.equal(whoop.owner,'123');
  response=await request('/mercury/sync',true);assert.equal(response.status,200);const first=validateSnapshot(await response.json(),'mercury');assert.equal(first.transactions.length,3);assert.equal(first.transactions.find(row=>row.id==='depository:first').status,'pending');
  phase=1;const second=await (await request('/mercury/sync',true)).json();assert.equal(second.transactions.length,3);assert.equal(second.transactions.find(row=>row.id==='depository:first').status,'sent');assert.equal(second.accounts[0].balance,501);
  const oldFile=fs.readFileSync(path.join(directory,'mercury.json'),'utf8');fail=true;response=await request('/mercury/sync',true);assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'upstream'});assert.equal(fs.readFileSync(path.join(directory,'mercury.json'),'utf8'),oldFile);assert.deepEqual(await(await request('/mercury/snapshot')).json(),second);fail=false;
  const example=await(await request('/mercury/example',true)).json();assert.equal(example.mode,'demo');assert.equal(fs.readFileSync(path.join(directory,'mercury.json'),'utf8'),oldFile);
  for(const name of fs.readdirSync(directory)){assert.equal(fs.statSync(path.join(directory,name)).mode&0o777,0o600);assert.doesNotMatch(fs.readFileSync(path.join(directory,name),'utf8'),/synthetic-token|client-secret-synthetic|access-2|refresh-2|123456789012|111111111/);}
  assert.equal(fs.statSync(directory).mode&0o777,0o700);
  await close();await start();assert.deepEqual(await(await request('/mercury/snapshot')).json(),second);assert.equal((await(await request('/status')).json()).whoop.connected,true);
  assert.equal((await request('/whoop/sync',true)).status,200);assert.equal(tokenCount,2);
  assert.equal((await request('/whoop/disconnect',true)).status,200);assert.equal(fs.existsSync(path.join(directory,'whoop-tokens.enc')),false);assert.equal((await(await request('/status')).json()).whoop.connected,false);assert.equal((await(await request('/whoop/snapshot')).json()).owner,'123');
  assert.ok(calls.filter(call=>call.url.hostname==='api.mercury.com').every(call=>!call.options.method||call.options.method==='GET'));
});
test('unconfigured service serves explicit examples without reaching upstream and reports missing configuration',async(t)=>{
  const {createIntegrationService}=await load('server.mjs');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nlc-integrations-empty-'));const port=await freePort();const service=await createIntegrationService({directory,port,env:{},fetchImpl:()=>assert.fail('must not call provider')});await new Promise(resolve=>service.server.listen(port,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>service.server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
  const request=(route,method='GET')=>fetch(`http://127.0.0.1:${port}${route}`,{method,headers:{Origin:'http://127.0.0.1:8084','X-NLC-Client':'1'}});
  const status=await(await request('/status')).json();assert.equal(status.mercury.configured,false);assert.equal(status.whoop.connected,false);assert.deepEqual(status.mercury.missing,['MERCURY_API_TOKEN']);assert.equal((await request('/mercury/sync','POST')).status,400);assert.equal(validateSnapshot(await(await request('/whoop/example','POST')).json()).mode,'demo');assert.equal(await(await request('/whoop/snapshot')).json(),null);
});

test('Metro excludes private integration configuration and server code from app bundles',()=>{
  const Module=require('node:module');const original=Module._load;Module._load=function(request,parent,isMain){if(request==='expo/metro-config')return {getDefaultConfig:()=>({resolver:{assetExts:[]},server:{}})};return original.call(this,request,parent,isMain);};let config;try{config=require('../metro.config.js');}finally{Module._load=original;}
  for(const file of ['/repo/.env.integrations.local','/repo/.env.integrations.example','/repo/.secrets/key','/repo/scripts/integrations/server.mjs'])assert.ok(config.resolver.blockList.some(pattern=>pattern.test(file)),file);
  assert.ok(!config.resolver.blockList.some(pattern=>pattern.test('/repo/src/lib/integrations/model.ts')));
});
